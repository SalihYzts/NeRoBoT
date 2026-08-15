import pkg from 'whatsapp-web.js';
const { MessageMedia } = pkg;

// Per-profile WhatsApp send/receive helpers. Wrapped in a factory so each
// profile gets its own `client`/dedup caches instead of one process-wide
// singleton — two profiles sending at the same time must never see each
// other's in-flight state.
export function createUtils(store) {
    const { state } = store;

    let client = null;

    const sentMessageIds = new Set();
    const MAX_TRACKED_IDS = 100;

    // Tracks chats that currently have an in-flight sendText() call.
    // message_create fires the instant WhatsApp registers the outgoing
    // message — BEFORE client.sendMessage()'s own await resolves — so
    // relying only on sentMessageIds loses that race (the ID isn't
    // tracked yet when the event handler checks isBotSentMessage).
    // This pending-send counter (per chatId) closes the gap: any
    // message_create for a chat with a pending send is bot-sent,
    // no ID lookup needed. Counter (not boolean) so overlapping sends
    // to the same chat don't unlock each other early.
    const pendingSends = new Map(); // chatId → count of in-flight sends

    function markPending(chatId) {
        pendingSends.set(chatId, (pendingSends.get(chatId) || 0) + 1);
    }

    function unmarkPending(chatId) {
        const count = pendingSends.get(chatId) || 0;
        if (count <= 1) {
            pendingSends.delete(chatId);
        } else {
            pendingSends.set(chatId, count - 1);
        }
    }

    function isPending(chatId) {
        return pendingSends.has(chatId);
    }

    // WhatsApp message character limit
    const WA_MAX_LENGTH = 65536;

    function setClient(c) {
        client = c;
    }

    // ============================
    // LID ↔ phone-number (c.us) ID aliasing
    // Modern WhatsApp accounts serialize private chats as "xxxx@lid" while old
    // stored settings and hand-typed IDs use the phone-number "905xx@c.us" form.
    // Both refer to the same contact, so every set/map lookup keyed by a chat or
    // user ID must accept either form. resolveAltId() asks WhatsApp Web for the
    // counterpart form (cached for the session); idVariants() returns every known
    // form of an ID; setHasAny()/mapGetAny() are the alias-aware lookups used by
    // the message handlers and the settings UI.
    // ============================
    const aliasCache = new Map(); // id → counterpart id ('' = confirmed none)
    // Bounded like sentMessageIds below — a long-running profile that talks
    // to thousands of distinct contacts over weeks shouldn't grow this
    // forever. Map preserves insertion order, so oldest-first eviction is a
    // cheap FIFO once the cap is hit.
    const MAX_ALIAS_CACHE_SIZE = 2000;

    function cacheAlias(id, alt) {
        aliasCache.set(id, alt);
        while (aliasCache.size > MAX_ALIAS_CACHE_SIZE) {
            aliasCache.delete(aliasCache.keys().next().value);
        }
    }

    async function resolveAltId(id) {
        if (typeof id !== 'string' || !(id.endsWith('@c.us') || id.endsWith('@lid'))) {
            return null; // groups (@g.us) etc. only ever have one form
        }
        if (aliasCache.has(id)) return aliasCache.get(id) || null;
        if (!client) return null;
        try {
            const [pair] = await client.getContactLidAndPhone([id]);
            const alt = (id.endsWith('@lid') ? pair?.pn : pair?.lid) || null;
            if (alt && alt !== id) {
                cacheAlias(id, alt);
                cacheAlias(alt, id); // both directions from one round-trip
                return alt;
            }
            cacheAlias(id, '');
            return null;
        } catch (_) {
            // Not cached — the page may simply not be ready yet; retry later.
            return null;
        }
    }

    async function idVariants(id) {
        const alt = await resolveAltId(id);
        return alt ? [id, alt] : [id];
    }

    async function setHasAny(set, id) {
        return (await idVariants(id)).some(v => set.has(v));
    }

    async function mapGetAny(obj, id) {
        for (const v of await idVariants(id)) {
            if (obj[v] !== undefined) return obj[v];
        }
        return undefined;
    }

    // Split long text into parts
    function splitMessage(text, maxLen = WA_MAX_LENGTH) {
        if (text.length <= maxLen) return [text];

        const parts = [];
        let remaining = text;

        while (remaining.length > 0) {
            if (remaining.length <= maxLen) {
                parts.push(remaining);
                break;
            }

            // Find the nearest whitespace to avoid cutting mid-word
            let cutAt = maxLen;
            const lastSpace = remaining.lastIndexOf(' ', maxLen);
            const lastNewline = remaining.lastIndexOf('\n', maxLen);
            const bestBreak = Math.max(lastSpace, lastNewline);

            if (bestBreak > maxLen * 0.8) {
                cutAt = bestBreak;
            }

            parts.push(remaining.slice(0, cutAt));
            remaining = remaining.slice(cutAt).trimStart();
        }

        return parts;
    }

    // Track sent message ID to prevent infinite loop
    function trackSentMessage(sentMsg) {
        if (sentMsg && sentMsg.id && sentMsg.id._serialized) {
            sentMessageIds.add(sentMsg.id._serialized);

            if (sentMessageIds.size > MAX_TRACKED_IDS) {
                const firstKey = sentMessageIds.values().next().value;
                sentMessageIds.delete(firstKey);
            }
        }
    }

    async function sendText(chatId, text) {
        const parts = splitMessage(String(text));

        let lastSent = null;

        // Mark this chat as having an in-flight send BEFORE calling
        // client.sendMessage(), so the message_create listener (which
        // can fire before this await resolves) already sees it as pending.
        markPending(chatId);

        try {
            for (const part of parts) {
                try {
                    const sentMsg = await client.sendMessage(chatId, part);
                    trackSentMessage(sentMsg);
                    lastSent = sentMsg;
                } catch (err) {
                    // Notify debug chat (only if target is different to avoid infinite loop)
                    if (state.debugChatId && state.debugChatId !== chatId) {
                        try {
                            const errMsg = `[NeRoBoT Error - sendText]\nTarget: ${chatId}\nReason: ${err.message || err}`;
                            const debugMsg = await client.sendMessage(state.debugChatId, errMsg);
                            trackSentMessage(debugMsg);
                        } catch (_) {}
                    }

                    // Throw to break the loop
                    throw err;
                }
            }
        } finally {
            unmarkPending(chatId);
        }

        return lastSent;
    }

    async function replyText(originalMsg, text) {
        const chatId = originalMsg.fromMe ? originalMsg.to : originalMsg.from;
        const parts = splitMessage(String(text));

        let lastSent = null;
        markPending(chatId);

        try {
            for (let i = 0; i < parts.length; i++) {
                try {
                    // First part as a quoted reply, rest as normal messages
                    const sentMsg = i === 0
                        ? await originalMsg.reply(parts[i])
                        : await client.sendMessage(chatId, parts[i]);
                    trackSentMessage(sentMsg);
                    lastSent = sentMsg;
                } catch (err) {
                    if (state.debugChatId && state.debugChatId !== chatId) {
                        try {
                            const errMsg = `[NeRoBoT Error - replyText]\nTarget: ${chatId}\nReason: ${err.message || err}`;
                            const debugMsg = await client.sendMessage(state.debugChatId, errMsg);
                            trackSentMessage(debugMsg);
                        } catch (_) {}
                    }
                    throw err;
                }
            }
        } finally {
            unmarkPending(chatId);
        }

        return lastSent;
    }

    // Sends raw image bytes (e.g. from src/imagegen.js) as
    // WhatsApp media, with an optional text caption riding in the same
    // message — same pending/error-report conventions as sendText().
    async function sendImage(chatId, buffer, mimetype, caption) {
        const media = new MessageMedia(mimetype, buffer.toString('base64'));
        markPending(chatId);
        try {
            const sentMsg = await client.sendMessage(chatId, media, caption ? { caption } : undefined);
            trackSentMessage(sentMsg);
            return sentMsg;
        } catch (err) {
            if (state.debugChatId && state.debugChatId !== chatId) {
                try {
                    const errMsg = `[NeRoBoT Error - sendImage]\nTarget: ${chatId}\nReason: ${err.message || err}`;
                    const debugMsg = await client.sendMessage(state.debugChatId, errMsg);
                    trackSentMessage(debugMsg);
                } catch (_) {}
            }
            throw err;
        } finally {
            unmarkPending(chatId);
        }
    }

    function isBotSentMessage(msg) {
        if (msg.id && msg.id._serialized && sentMessageIds.has(msg.id._serialized)) {
            return true;
        }
        // Fallback for the race where message_create fires before the
        // sendMessage() promise (and therefore trackSentMessage) resolves.
        const chatId = msg.fromMe ? msg.to : msg.from;
        return isPending(chatId);
    }

    return { setClient, sendText, replyText, sendImage, isBotSentMessage, idVariants, setHasAny, mapGetAny };
}
