import { state } from './config.js';

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

export function setClient(c) {
    client = c;
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

export async function sendText(chatId, text) {
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

export async function replyText(originalMsg, text) {
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

export function isBotSentMessage(msg) {
    if (msg.id && msg.id._serialized && sentMessageIds.has(msg.id._serialized)) {
        return true;
    }
    // Fallback for the race where message_create fires before the
    // sendMessage() promise (and therefore trackSentMessage) resolves.
    const chatId = msg.fromMe ? msg.to : msg.from;
    return isPending(chatId);
}