// Telegram side of the bot — same idea as bot.js (WhatsApp), just driven by
// a real logged-in Telegram user account (via teleproto/MTProto + QR login,
// see app/main.js's telegram:* IPC handlers) instead of whatsapp-web.js.
// Reuses ai.js/commands.js/config.js/ratelimit.js completely unchanged —
// they only depend on the generic `utils` shape (see telegram-utils.js),
// nothing WhatsApp-specific.
import { TelegramClient, sessions, events } from 'teleproto';
import { createRequire } from 'module';
import mammoth from 'mammoth';

import { createProfileStore } from './config.js';
import { createTelegramUtils } from './telegram-utils.js';
import { createRateLimiter } from './ratelimit.js';
import { createAi } from './ai.js';
import { generateImage } from './imagegen.js';
import { createCommands, AI_GATED_COMMANDS } from './commands.js';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');
const { StringSession } = sessions;
const { NewMessage } = events;

// Caps how much extracted file text (PDF/Word/plain-text attachments) gets
// folded into a prompt — see bot.js's identical helper on the WhatsApp side.
const FILE_TEXT_MAX_CHARS = 30_000;
function truncateFileText(text) {
    return text.length > FILE_TEXT_MAX_CHARS
        ? text.slice(0, FILE_TEXT_MAX_CHARS) + `\n\n[... ${text.length - FILE_TEXT_MAX_CHARS} characters truncated]`
        : text;
}

// Creates one Telegram profile's whole stack — own store, utils, rate
// limiter, AI memory and debug commands, and the teleproto TelegramClient
// wired to all of them. Mirrors bot.js's createBot() shape/return value as
// closely as the two platforms allow.
//
// `onQr(url)` — called (possibly more than once, as tokens refresh) with a
// `tg://login?token=...` URL to show as a QR code, only during first-time
// login (no saved session yet).
// `onPasswordRequired(hint)` — called if the account has Telegram's cloud
// password (2FA) enabled; must resolve with the password.
// `getOllamaClient` — same as bot.js's createBot() (see its own doc): app/
// main.js passes in a closure over readOllamaStatus() so a local/API mode
// switch takes effect immediately, stashed onto `utils` for createAi/
// createCommands to use as-is.
export function createTelegramBot({ profileId, profileDir, apiId, apiHash, sessionString, onQr, onPasswordRequired, onIncomingMessage, abortSignal, getOllamaClient }) {
    const store = createProfileStore(profileDir);
    const { state, whitelist, blacklist, admins, noPrefixChats, groupChats, chatPrefixes } = store;

    const utils = createTelegramUtils(store);
    utils.getOllamaClient = getOllamaClient;
    const { setClient, sendText, replyText, sendImage, isBotSentMessage, trackSentMessage, idVariants, setHasAny } = utils;

    const ratelimit = createRateLimiter(store, idVariants);
    const { checkRateLimit } = ratelimit;

    const { askModel, classifyImageIntent, describeImageForGeneration, describeGeneratedImage } = createAi({ store, utils });
    const { commands } = createCommands({ store, utils, ratelimit });

    const client = new TelegramClient(new StringSession(sessionString || ''), apiId, apiHash, {
        connectionRetries: 5,
    });
    setClient(client);

    async function reportError(context, err) {
        console.error(`[Telegram:${profileId}] [NeRoBoT Error - ${context}]`, err.message || err);
        if (state.debugChatId) {
            try {
                await sendText(state.debugChatId, `[NeRoBoT Error - ${context}]\n${err.message || err}`);
            } catch (_) {}
        }
    }

    async function dispatchCommand(command, msg, targetId, errorContext) {
        if (AI_GATED_COMMANDS.has(command) && !state.aiChatEnabled) {
            await sendText(targetId, `This needs AI Bot turned on first — ${state.debugPrefix}aichat`);
            return;
        }
        try {
            await commands[command](msg, targetId);
        } catch (err) {
            await reportError(errorContext, err);
        }
    }

    // Builds the file name for a Telegram document (Api.Document only
    // exposes attributes as a flat array — DocumentAttributeFilename is
    // wherever a name was actually set, may be absent entirely).
    function documentFilename(document) {
        const attr = (document.attributes || []).find(a => a.fileName);
        return attr?.fileName || '';
    }

    // Mirrors bot.js's handleAiMessage — `msg` is the normalized shim built
    // in the NewMessage handler below (has .body/.chatId/.senderId/.hasMedia/
    // downloadMedia()/reply(), the same shape utils.js's WhatsApp Message
    // had, just built by hand instead of coming from whatsapp-web.js).
    async function handleAiMessage(msg, chatId, userId, body, noPrefix = false, prefixUsed = state.prefix) {
        const memoryKey = (await setHasAny(groupChats, chatId)) ? String(chatId) : String(userId);

        try {
            const { allowed, shouldWarn } = await checkRateLimit(String(userId));
            if (!allowed) {
                if (shouldWarn) await sendText(chatId, state.rateLimitWarnMessage);
                return;
            }

            const rawPrompt = noPrefix ? body.trim() : body.slice(prefixUsed.length).trim();

            const images = [];
            let fileContext = '';

            if (msg.hasMedia) {
                // Only the actual download is attributed to 'downloadMedia' below —
                // see bot.js's identical comment on the WhatsApp side.
                let media;
                try {
                    media = await msg.downloadMedia();
                    if (!media) throw new Error('Failed to download media.');
                } catch (err) {
                    await reportError('downloadMedia', err);
                    await sendText(chatId, state.aiErrorMessage);
                    if (!rawPrompt) return;
                    media = null;
                }

                if (media) {
                    const { mimetype, buffer, filename } = media;
                    const lowerName = (filename || '').toLowerCase();

                    const isPdf = mimetype === 'application/pdf' || lowerName.endsWith('.pdf');
                    const isWord = mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                        || mimetype === 'application/msword' || lowerName.endsWith('.docx') || lowerName.endsWith('.doc');

                    if (mimetype.startsWith('image/') || msg.isPhoto) {
                        if (!state.imageEnabled) {
                            await sendText(chatId, '⚠️ Image reading is currently disabled. To enable: !media image');
                            if (!rawPrompt) return;
                        } else {
                            images.push(buffer.toString('base64'));
                        }
                    } else if (isPdf) {
                        if (!state.fileEnabled) {
                            await sendText(chatId, '⚠️ File reading is currently disabled. To enable: !media file');
                            if (!rawPrompt) return;
                        } else {
                            try {
                                const parser = new PDFParse({ data: buffer });
                                try {
                                    const result = await parser.getText();
                                    fileContext = truncateFileText(`[PDF content]\n${result.text.trim()}`);
                                } finally {
                                    await parser.destroy();
                                }
                            } catch (e) {
                                await reportError('pdf-parse', e);
                                await sendText(chatId, '⚠️ Could not read the PDF.');
                                if (!rawPrompt) return;
                            }
                        }
                    } else if (isWord) {
                        if (!state.fileEnabled) {
                            await sendText(chatId, '⚠️ File reading is currently disabled. To enable: !media file');
                            if (!rawPrompt) return;
                        } else {
                            try {
                                const result = await mammoth.extractRawText({ buffer });
                                fileContext = truncateFileText(`[Word document content]\n${result.value.trim()}`);
                            } catch (e) {
                                await sendText(chatId, '⚠️ Could not read the Word document.');
                                if (!rawPrompt) return;
                            }
                        }
                    } else if (
                        mimetype.startsWith('text/') ||
                        /\.(txt|json|js|ts|csv|xml|sh|ya?ml|md|log)$/.test(lowerName)
                    ) {
                        if (!state.fileEnabled) {
                            await sendText(chatId, '⚠️ File reading is currently disabled. To enable: !media file');
                            if (!rawPrompt) return;
                        } else {
                            const text = buffer.toString('utf8');
                            fileContext = truncateFileText(`[File content (${mimetype})]\n${text}`);
                        }
                    } else {
                        await sendText(chatId, `⚠️ This file type is not supported (${mimetype || 'unknown'}).`);
                        if (!rawPrompt) return;
                    }
                }
            }

            const prompt = fileContext
                ? `${fileContext}\n\n${rawPrompt || 'Review and summarize this file.'}`
                : rawPrompt || (images.length > 0 ? 'What do you see in this image?' : '');

            if (!prompt && images.length === 0) return;

            // Image-generation requests — same routing/ack-note trick as
            // bot.js's WhatsApp side (see ai.js's IMAGE_ACK_NOTE).
            if (state.imageGenEnabled && !fileContext && rawPrompt) {
                const intent = await classifyImageIntent(rawPrompt, images.length > 0);
                if (intent.image) {
                    if (state.thinkEnabled) await sendText(chatId, state.thinkMessage);
                    try {
                        const apiKey = state.imageGenProvider === 'openai' ? state.imageGenApiKeyOpenai
                            : state.imageGenProvider === 'stability' ? state.imageGenApiKeyStability
                            : undefined;
                        const genPrompt = images.length > 0
                            ? await describeImageForGeneration(images[0], intent.prompt || rawPrompt)
                            : (intent.prompt || rawPrompt);
                        const { buffer, mimetype } = await generateImage(genPrompt, { provider: state.imageGenProvider, apiKey });
                        const caption = await describeGeneratedImage(memoryKey, rawPrompt);
                        await sendImage(chatId, buffer, mimetype, caption);
                    } catch (err) {
                        await reportError('imageGen', err);
                        await sendText(chatId, state.aiErrorMessage);
                    }
                    return;
                }
            }

            if (state.thinkEnabled) await sendText(chatId, state.thinkMessage);

            try {
                const aiResponse = await askModel(memoryKey, prompt, images);
                if (state.replyMode) await replyText(msg, aiResponse);
                else await sendText(chatId, aiResponse);
            } catch (err) {
                await reportError('askModel', err);
                if (state.replyMode) await replyText(msg, state.aiErrorMessage);
                else await sendText(chatId, state.aiErrorMessage);
            }
        } catch (err) {
            await reportError('handleAiMessage', err);
        }
    }

    // Builds the same normalized `msg` shape utils.js's WhatsApp Message
    // gave handleAiMessage/replyText — lets both platforms' bots share that
    // logic's call sites almost verbatim.
    function buildMsgShim(tgMessage, chatId, senderId) {
        return {
            body: tgMessage.text || '',
            chatId: String(chatId),
            // Mirrors whatsapp-web.js's Message.author/.from that commands.js's
            // Admin()/Blacklist() read as `msg.author || msg.from` to find "the
            // person who sent this" when no explicit ID argument was given.
            // Without this, those commands silently added/removed the literal
            // string "undefined" on Telegram.
            author: senderId != null ? String(senderId) : undefined,
            id: tgMessage.id,
            hasMedia: !!(tgMessage.photo || tgMessage.document),
            isPhoto: !!tgMessage.photo,
            async downloadMedia() {
                const buffer = await client.downloadMedia(tgMessage, {});
                if (!buffer) return null;
                if (tgMessage.photo) {
                    return { mimetype: 'image/jpeg', buffer, filename: 'photo.jpg' };
                }
                const doc = tgMessage.document;
                return {
                    mimetype: doc?.mimeType || 'application/octet-stream',
                    buffer,
                    filename: doc ? documentFilename(doc) : '',
                };
            },
        };
    }

    // Notification panel avatars (app/main.js's pushNotification) — same
    // fire-and-forget cache approach as bot.js's WhatsApp side (see its own
    // comment): downloadProfilePhoto is a real download, not something to
    // block a message's AI/command handling on. Telegram has no public
    // profile-pic URL to just hand the renderer (unlike WhatsApp's CDN), so
    // this stores a data: URI instead — fine at avatar size.
    const avatarCache = new Map();
    // Capped FIFO — see bot.js's identical comment on the WhatsApp side.
    const MAX_AVATAR_CACHE_SIZE = 1000;
    function cacheAvatar(chatId, value) {
        avatarCache.set(chatId, value);
        while (avatarCache.size > MAX_AVATAR_CACHE_SIZE) {
            avatarCache.delete(avatarCache.keys().next().value);
        }
    }
    function scheduleAvatarFetch(chatId) {
        if (avatarCache.has(chatId)) return;
        cacheAvatar(chatId, null);
        client.downloadProfilePhoto(chatId, {})
            .then(buf => {
                if (buf && Buffer.isBuffer(buf)) cacheAvatar(chatId, `data:image/jpeg;base64,${buf.toString('base64')}`);
            })
            .catch(() => {});
    }

    async function handleIncoming(event) {
        try {
            const message = event.message;
            if (message.out) return; // our own account's outgoing messages are handled separately below

            const chatId = message.chatId?.toString();
            const senderId = message.senderId?.toString() || chatId;
            if (!chatId) return;

            if (await setHasAny(blacklist, chatId)) return;

            const text = (message.text || '').trim();
            const lower = text.toLowerCase();
            const msg = buildMsgShim(message, chatId, senderId);

            // The app's notification panel (app/main.js's pushNotification)
            // — same "notify regardless of whether AI/commands act on it" as
            // bot.js's WhatsApp side. teleproto's NewMessage event already
            // resolves .chat/.sender onto the raw message (gramjs entity
            // cache), so this needs no extra network round-trip.
            if (onIncomingMessage) {
                try {
                    const chatName = message.chat?.title || message.chat?.firstName || message.sender?.username || message.sender?.firstName || chatId;
                    scheduleAvatarFetch(chatId);
                    onIncomingMessage({
                        chatId,
                        chatName,
                        senderName: chatName,
                        body: text,
                        t: message.date ? message.date * 1000 : Date.now(),
                        avatarUrl: avatarCache.get(chatId) || null,
                    });
                } catch (_) {}
            }

            // Prefixes are stored/edited verbatim (any case) but compared here
            // against an already-lower-cased `lower`, so the comparison side
            // must be lower-cased too — otherwise a prefix with any uppercase
            // letter could never match again.
            if (lower.startsWith(state.debugPrefix.toLowerCase())) {
                if (admins.has(senderId)) {
                    const command = lower.slice(state.debugPrefix.length).split(' ')[0];
                    if (commands[command]) await dispatchCommand(command, msg, chatId, `command:${command}`);
                }
                return;
            }

            if (!state.aiChatEnabled) return;

            const chatIds = await idVariants(chatId);
            const isNoPrefixChat = state.noPrefixAll || chatIds.some(id => noPrefixChats.has(id));
            const chatPrefix = chatIds.map(id => chatPrefixes[id]).find(p => p) || state.prefix;
            const hasPrefix = lower.startsWith(chatPrefix.toLowerCase());

            if (!isNoPrefixChat && !hasPrefix) return;
            if (isNoPrefixChat && state.ignorePrefix && lower.startsWith(state.ignorePrefix.toLowerCase())) return;

            if (state.fixedMode) {
                if (chatIds.includes(state.activeChatId)) {
                    await handleAiMessage(msg, chatId, senderId, text, isNoPrefixChat, chatPrefix);
                }
                return;
            }

            if (state.whitelistMode && !chatIds.some(id => whitelist.has(id))) {
                if (state.debugChatId) {
                    try { await sendText(state.debugChatId, `New message received!\nID: ${chatId}\nMessage: ${text}`); } catch (_) {}
                }
                return;
            }

            await handleAiMessage(msg, chatId, senderId, text, isNoPrefixChat, chatPrefix);
        } catch (err) {
            await reportError('message_event', err);
        }
    }

    // Outgoing (messages sent from this same account, e.g. typed on your
    // phone while the bot's also running) — same "you can type commands to
    // yourself" convenience bot.js's message_create handler gives WhatsApp.
    async function handleOutgoing(event) {
        try {
            const message = event.message;
            if (!message.out) return;
            if (isBotSentMessage(message.id)) return; // our own automated send, not a human typing

            const chatId = message.chatId?.toString();
            if (!chatId) return;
            const text = (message.text || '').trim();
            const lower = text.toLowerCase();
            // Self-typed (fromMe) message — the account owner is both sender and chat.
            const msg = buildMsgShim(message, chatId, chatId);

            if (lower.startsWith(state.debugPrefix.toLowerCase())) {
                const command = lower.slice(state.debugPrefix.length).split(' ')[0];
                if (commands[command]) await dispatchCommand(command, msg, chatId, `command_create:${command}`);
                return;
            }

            if (!state.aiChatEnabled) return;

            const chatIds = await idVariants(chatId);
            const isNoPrefixChat = state.noPrefixAll || chatIds.some(id => noPrefixChats.has(id));
            const chatPrefix = chatIds.map(id => chatPrefixes[id]).find(p => p) || state.prefix;
            const hasPrefix = lower.startsWith(chatPrefix.toLowerCase());

            if (isNoPrefixChat && state.ignorePrefix && lower.startsWith(state.ignorePrefix.toLowerCase())) return;
            if (isNoPrefixChat || hasPrefix) {
                await handleAiMessage(msg, chatId, chatId, text, isNoPrefixChat, chatPrefix);
            }
        } catch (err) {
            await reportError('message_create_event', err);
        }
    }

    // Connects, logs in (QR code + optional 2FA password) if there's no
    // saved session yet, and starts listening. Resolves once the account is
    // fully connected and ready; `sessionString` for future runs is
    // returned so the caller (main.js) can persist it and skip QR next time.
    async function connectAndLogin() {
        await client.connect();

        const alreadyAuthorized = await client.checkAuthorization().catch(() => false);
        if (!alreadyAuthorized) {
            await client.signInUserWithQrCode(
                { apiId, apiHash },
                {
                    onError: async (err) => { await reportError('telegramLogin', err); return true; },
                    qrCode: async (code) => {
                        const url = `tg://login?token=${code.token.toString('base64url')}`;
                        onQr?.(url, code.expires);
                    },
                    password: async (hint) => onPasswordRequired ? onPasswordRequired(hint) : '',
                    abortSignal,
                }
            );
        }

        client.addEventHandler(handleIncoming, new NewMessage({ incoming: true }));
        client.addEventHandler(handleOutgoing, new NewMessage({ outgoing: true }));

        return client.session.save();
    }

    return { client, connectAndLogin, reportError, store, utils, ratelimit };
}
