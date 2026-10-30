// Per-profile Telegram send/receive helpers — the Telegram equivalent of
// utils.js (WhatsApp), built to the exact same shape (sendText/replyText/
// sendImage/isBotSentMessage/idVariants/setHasAny/mapGetAny) so ai.js,
// commands.js, and telegram-bot.js's own message loop can lean on it
// exactly like bot.js leans on utils.js.
//
// Much simpler than utils.js: Telegram has no WhatsApp-style dual ID
// problem (a chat only ever has the one numeric id), so idVariants/
// setHasAny/mapGetAny are trivial here — kept only so callers written
// against the shared shape don't need a WhatsApp-specific branch.
import { CustomFile } from 'teleproto/client/uploads.js';

const IMAGE_EXT_BY_MIME = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp',
};

// teleproto decides "photo vs. document" from the upload's file NAME. A
// bare Buffer is uploaded as "unnamed" — no extension — so every image the
// bot sent (generated images, Çoklu Mesaj photos) arrived as a downloadable
// file called "unnamed" instead of an inline photo. Naming it after its
// MIME type fixes that (png/jpg → photo; webp/gif/bmp stay documents, which
// is how Telegram treats them anyway).
export function namedUpload(buffer, mimetype, base = 'image') {
    const ext = IMAGE_EXT_BY_MIME[String(mimetype || '').toLowerCase()] || 'png';
    return new CustomFile(`${base}.${ext}`, buffer.length, '', buffer);
}

// Placeholder text for a message that has no text of its own — notification
// bodies, "Bu sohbeti sor" context, !upload. Mirrors WhatsApp's "[type]".
export function describeMedia(m) {
    if (!m) return '';
    if (m.photo) return '[photo]';
    if (m.sticker) return '[sticker]';
    if (m.voice) return '[voice]';
    if (m.videoNote) return '[video note]';
    if (m.video) return '[video]';
    if (m.gif) return '[gif]';
    if (m.audio) return '[audio]';
    if (m.document) return '[document]';
    if (m.poll) return '[poll]';
    if (m.geo) return '[location]';
    if (m.contact) return '[contact]';
    return m.media ? '[media]' : '';
}

export function createTelegramUtils(store) {
    const { state } = store;

    let client = null;
    function setClient(c) { client = c; }

    // Keyed "chatId:messageId": Telegram message ids are only unique per
    // chat for supergroups/channels, so a bare id could match an unrelated
    // human message in another chat.
    const sentMessageIds = new Set();
    const MAX_TRACKED_IDS = 300;
    function sentKey(chatId, id) { return `${chatId}:${id}`; }
    // Accepts a teleproto Message (preferred) or a bare id plus chat.
    function trackSentMessage(msgOrId, chatId) {
        if (msgOrId == null) return;
        const id = typeof msgOrId === 'object' ? msgOrId.id : msgOrId;
        const chat = typeof msgOrId === 'object' ? (msgOrId.chatId?.toString() ?? chatId) : chatId;
        if (id == null) return;
        sentMessageIds.add(sentKey(chat ?? '', id));
        while (sentMessageIds.size > MAX_TRACKED_IDS) {
            sentMessageIds.delete(sentMessageIds.values().next().value);
        }
    }

    // Same race-closer as utils.js's markPending/isPending: teleproto can
    // deliver our own send to the outgoing NewMessage handler BEFORE
    // sendMessage() resolves (so before its id is tracked) — without this, a
    // no-prefix chat could see the bot answer its own reply.
    const pendingSends = new Map(); // chatId → in-flight count
    function markPending(chatId) {
        const k = String(chatId);
        pendingSends.set(k, (pendingSends.get(k) || 0) + 1);
    }
    function unmarkPending(chatId) {
        const k = String(chatId);
        const n = (pendingSends.get(k) || 0) - 1;
        if (n > 0) pendingSends.set(k, n); else pendingSends.delete(k);
    }

    // `message` is a teleproto Message from the outgoing NewMessage event.
    function isBotSentMessage(message) {
        if (message == null) return false;
        if (typeof message !== 'object') return [...sentMessageIds].some(k => k.endsWith(`:${message}`));
        const chatId = message.chatId?.toString() ?? '';
        if (sentMessageIds.has(sentKey(chatId, message.id))) return true;
        return pendingSends.has(chatId);
    }

    async function idVariants(id) { return [String(id)]; }
    async function setHasAny(set, id) { return set.has(String(id)); }
    async function mapGetAny(obj, id) { return obj[String(id)]; }

    // Telegram's per-message text limit.
    const TG_MAX_LENGTH = 4096;
    function splitMessage(text, maxLen = TG_MAX_LENGTH) {
        if (text.length <= maxLen) return [text];
        const parts = [];
        let remaining = text;
        while (remaining.length > 0) {
            if (remaining.length <= maxLen) {
                parts.push(remaining);
                break;
            }
            let cutAt = maxLen;
            const lastSpace = remaining.lastIndexOf(' ', maxLen);
            const lastNewline = remaining.lastIndexOf('\n', maxLen);
            const bestBreak = Math.max(lastSpace, lastNewline);
            if (bestBreak > maxLen * 0.8) cutAt = bestBreak;
            parts.push(remaining.slice(0, cutAt));
            remaining = remaining.slice(cutAt).trimStart();
        }
        return parts;
    }

    async function reportSendError(context, chatId, err) {
        if (state.debugChatId && String(state.debugChatId) !== String(chatId)) {
            try {
                const errMsg = `[NeRoBoT Error - ${context}]\nTarget: ${chatId}\nReason: ${err.message || err}`;
                markPending(state.debugChatId);
                try {
                    const debugMsg = await client.sendMessage(state.debugChatId, { message: errMsg });
                    trackSentMessage(debugMsg);
                } finally {
                    unmarkPending(state.debugChatId);
                }
            } catch (_) {}
        }
    }

    async function sendText(chatId, text) {
        const parts = splitMessage(String(text));
        let lastSent = null;
        for (const part of parts) {
            markPending(chatId);
            try {
                const sent = await client.sendMessage(chatId, { message: part });
                trackSentMessage(sent);
                lastSent = sent;
            } catch (err) {
                await reportSendError('sendText', chatId, err);
                throw err;
            } finally {
                unmarkPending(chatId);
            }
        }
        return lastSent;
    }

    // `originalMsg` is the normalized message shim built in telegram-bot.js
    // (has .chatId and .id) — mirrors utils.js's replyText(originalMsg, text).
    async function replyText(originalMsg, text) {
        const chatId = originalMsg.chatId;
        const parts = splitMessage(String(text));
        let lastSent = null;
        for (let i = 0; i < parts.length; i++) {
            markPending(chatId);
            try {
                const sent = await client.sendMessage(chatId, {
                    message: parts[i],
                    replyTo: i === 0 ? originalMsg.id : undefined,
                });
                trackSentMessage(sent);
                lastSent = sent;
            } catch (err) {
                await reportSendError('replyText', chatId, err);
                throw err;
            } finally {
                unmarkPending(chatId);
            }
        }
        return lastSent;
    }

    async function sendImage(chatId, buffer, mimetype, caption) {
        markPending(chatId);
        try {
            const sent = await client.sendFile(chatId, {
                file: namedUpload(buffer, mimetype),
                caption: caption || undefined,
            });
            trackSentMessage(sent);
            return sent;
        } catch (err) {
            await reportSendError('sendImage', chatId, err);
            throw err;
        } finally {
            unmarkPending(chatId);
        }
    }

    // Forwards an existing message (`source` = { chatId, id }) into chatId —
    // Telegram counterpart of utils.js's forwardMessage (Çoklu Mesaj's
    // "aynen ilet" mode).
    async function forwardMessage(chatId, source) {
        markPending(chatId);
        try {
            const sent = await client.forwardMessages(chatId, { messages: [Number(source.id)], fromPeer: source.chatId });
            for (const m of [].concat(sent || [])) if (m) trackSentMessage(m);
            return sent;
        } catch (err) {
            await reportSendError('forwardMessage', chatId, err);
            throw err;
        } finally {
            unmarkPending(chatId);
        }
    }

    // Last `limit` messages of a chat, oldest first, in the same shape the
    // WhatsApp side builds from chat.msgs — used by !upload and the
    // NeRoChAt popup's "Bu sohbeti sor".
    async function fetchRecentMessages(chatId, limit = 20) {
        const msgs = await client.getMessages(chatId, { limit });
        return [...msgs].reverse().filter(Boolean).map(m => ({
            fromMe: !!m.out,
            author: m.out ? null : (m.sender?.firstName || m.sender?.username || m.senderId?.toString() || null),
            body: m.message || describeMedia(m),
            t: m.date || 0,
        }));
    }

    return { setClient, sendText, replyText, sendImage, forwardMessage, fetchRecentMessages, isBotSentMessage, trackSentMessage, idVariants, setHasAny, mapGetAny };
}
