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
export function createTelegramUtils(store) {
    const { state } = store;

    let client = null;
    function setClient(c) { client = c; }

    const sentMessageIds = new Set();
    const MAX_TRACKED_IDS = 100;
    function trackSentMessage(id) {
        if (id == null) return;
        sentMessageIds.add(id);
        if (sentMessageIds.size > MAX_TRACKED_IDS) {
            sentMessageIds.delete(sentMessageIds.values().next().value);
        }
    }
    // `id` is a teleproto message id (number) — see isBotSentMessage below.
    function isBotSentMessage(id) {
        return sentMessageIds.has(id);
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
                const debugMsg = await client.sendMessage(state.debugChatId, { message: errMsg });
                trackSentMessage(debugMsg.id);
            } catch (_) {}
        }
    }

    async function sendText(chatId, text) {
        const parts = splitMessage(String(text));
        let lastSent = null;
        for (const part of parts) {
            try {
                const sent = await client.sendMessage(chatId, { message: part });
                trackSentMessage(sent.id);
                lastSent = sent;
            } catch (err) {
                await reportSendError('sendText', chatId, err);
                throw err;
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
            try {
                const sent = await client.sendMessage(chatId, {
                    message: parts[i],
                    replyTo: i === 0 ? originalMsg.id : undefined,
                });
                trackSentMessage(sent.id);
                lastSent = sent;
            } catch (err) {
                await reportSendError('replyText', chatId, err);
                throw err;
            }
        }
        return lastSent;
    }

    async function sendImage(chatId, buffer, mimetype, caption) {
        try {
            const sent = await client.sendFile(chatId, {
                file: buffer,
                caption: caption || undefined,
            });
            trackSentMessage(sent.id);
            return sent;
        } catch (err) {
            await reportSendError('sendImage', chatId, err);
            throw err;
        }
    }

    return { setClient, sendText, replyText, sendImage, isBotSentMessage, trackSentMessage, idVariants, setHasAny, mapGetAny };
}
