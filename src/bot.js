import pkg from 'whatsapp-web.js';
import { createRequire } from 'module';
import mammoth from 'mammoth';
import path from 'path';

import { createProfileStore } from './config.js';
import { createUtils } from './utils.js';
import { createRateLimiter } from './ratelimit.js';
import { createAi } from './ai.js';
import { generateImage } from './imagegen.js';
import { createCommands, AI_GATED_COMMANDS } from './commands.js';

// pdf-parse v2 exposes a PDFParse class (pdf.js based) instead of the old
// v1 callable function — see https://github.com/mehmet-kozan/pdf-parse
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const { Client } = pkg;

// Caps how much extracted file text (PDF/Word/plain-text attachments) gets
// folded into a prompt — applied to every format alike, not just plain text,
// so a large PDF/Word document can't blow past the model's context window
// (or a metered cloud model's token quota) the way an unbounded extraction
// used to.
const FILE_TEXT_MAX_CHARS = 30_000;
function truncateFileText(text) {
    return text.length > FILE_TEXT_MAX_CHARS
        ? text.slice(0, FILE_TEXT_MAX_CHARS) + `\n\n[... ${text.length - FILE_TEXT_MAX_CHARS} characters truncated]`
        : text;
}

// Creates one profile's whole bot stack: its own config store, utils,
// rate limiter, AI memory and debug commands, and the whatsapp-web.js
// Client wired to all of them. Two profiles calling this never share so
// much as a Set — each gets fresh closures over its own `store`.
//
// `puppeteer` is passed straight to whatsapp-web.js — the Electron app gives
// it a browserURL so the bot connects to the WhatsApp Web view living inside
// the app window instead of launching its own browser. `profileId` rides
// along inside those same puppeteer options — puppeteer itself ignores the
// unknown key, but the app's shared, once-patched `puppeteer.connect` reads
// it to hand back THIS profile's embedded page (see app/main.js).
// `userAgent` is forwarded to whatsapp-web.js when given. The library's
// default UA is an ancient Chrome 101/macOS string — WhatsApp treats that as
// an unsupported browser and drops the session, so the app passes its own
// modern UA to keep the login alive between restarts.
// `automationEnabled` (default true) gates whether the message/message_create
// listeners below — the only things that dispatch commands/AI — get attached
// at all. False for a profile running in connectionMode 'web' (see
// app/main.js's attemptBotStart): the Client (and its embedded page) still
// needs to exist either way, whatsapp-web.js has no other way to drive the
// session, this just keeps it a plain manual WhatsApp Web tab with no bot
// reading/replying to anything.
// `getOllamaClient` — resolves which Ollama instance (local daemon or
// Ollama Cloud API, see src/ollama-client.js) this profile's AI
// calls should use right now; app/main.js passes in a closure over its own
// readOllamaStatus() so a mode switch takes effect on the very next call,
// no restart needed. Stashed onto `utils` (rather than added to createAi/
// createCommands' own signatures) since both already receive `utils` as-is.
export function createBot({ profileId, profileDir, puppeteer: puppeteerOptions, userAgent, automationEnabled = true, onIncomingMessage, getOllamaClient } = {}) {
    const store = createProfileStore(profileDir);
    const { state, whitelist, blacklist, admins, noPrefixChats, groupChats, chatPrefixes } = store;

    const utils = createUtils(store);
    utils.getOllamaClient = getOllamaClient;
    const { setClient, sendText, replyText, sendImage, isBotSentMessage, idVariants, setHasAny } = utils;

    const ratelimit = createRateLimiter(store, idVariants);
    const { checkRateLimit } = ratelimit;

    const { askModel, classifyImageIntent, describeImageForGeneration, describeGeneratedImage } = createAi({ store, utils });
    const { commands } = createCommands({ store, utils, ratelimit });

    const client = new Client({
        puppeteer: { ...puppeteerOptions, profileId },
        ...(userAgent ? { userAgent } : {}),
        // Keep each profile's cached WhatsApp Web build file separate —
        // sharing one default `.wwebjs_cache/` across concurrent profiles
        // risks two Clients writing the same file at once.
        webVersionCache: { type: 'local', path: path.join(profileDir, '.wwebjs_cache') },
    });

    setClient(client);

    // Report error — always to the log panel, and to the debug chat too if one's set
    async function reportError(context, err) {
        console.error(`[NeRoBoT Error - ${context}]`, err.message || err);
        if (state.debugChatId) {
            try {
                await sendText(state.debugChatId, `[NeRoBoT Error - ${context}]\n${err.message || err}`);
            } catch (_) {}
        }
    }

    // Runs a debug command, gating the AI-only ones (model/personality/
    // think/ratelimit/aierror/media/replymode/fixedchat/clear/debugchat/
    // noprefix/noprefixall — see AI_GATED_COMMANDS) behind AI Bot being on.
    // !aichat itself is never gated, so it's always available to turn AI
    // back on remotely. Shared by both dispatch sites below (incoming and
    // outgoing debug-prefixed messages) so the gate can't be forgotten in one.
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

    // Handle AI message
    async function handleAiMessage(msg, from, to, userId, body, fromMe, noPrefix = false, prefixUsed = state.prefix) {
        const chatId = fromMe ? to : from;

        // In group-chat mode, everyone in this chat shares ONE AI memory
        // (keyed by the group's chatId) instead of one per sender.
        // Rate limiting stays per-user regardless, so one chatty member
        // can't burn through the whole group's token bucket.
        const memoryKey = (await setHasAny(groupChats, chatId)) ? chatId : userId;

        try {
            // Rate limit check — runs before thinkMessage so we don't send "thinking..." then drop it
            const { allowed, shouldWarn } = await checkRateLimit(userId);
            if (!allowed) {
                if (shouldWarn) {
                    await sendText(chatId, state.rateLimitWarnMessage);
                }
                return;
            }

            // In no-prefix mode send the raw message, otherwise strip the prefix
            const rawPrompt = noPrefix ? body.trim() : body.slice(prefixUsed.length).trim();

            // ============================
            // Media handling
            // Images are sent to Ollama as base64 (vision models).
            // PDF, Word, and text-based files are extracted to plain text
            // and prepended to the prompt so any model can read them.
            //
            // NOTE: WhatsApp/whatsapp-web.js doesn't always report an accurate
            // mimetype (sometimes it's missing or comes through as the generic
            // "application/octet-stream"). To stay robust against that, every
            // type check below also falls back to the file's extension.
            // ============================
            const images = [];
            let fileContext = '';

            if (msg.hasMedia) {
                // Only the actual download is attributed to 'downloadMedia' below —
                // the type-detection/notification code that follows has its own
                // sendText() calls, and if one of those fails it shouldn't be
                // misreported as a download failure (falls through to the generic
                // handleAiMessage catch instead, which is accurate either way).
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
                    const mime = media.mimetype || '';
                    const buffer = Buffer.from(media.data, 'base64');
                    const filename = (media.filename || '').toLowerCase();

                    const isPdf  = mime === 'application/pdf' || filename.endsWith('.pdf');
                    const isWord = mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                        || mime === 'application/msword'
                        || filename.endsWith('.docx') || filename.endsWith('.doc');

                    if (mime.startsWith('image/')) {
                        // Görsel → Ollama vision
                        if (!state.imageEnabled) {
                            await sendText(chatId, '⚠️ Image reading is currently disabled. To enable: !media image');
                            if (!rawPrompt) return;
                        } else {
                            images.push(media.data);
                        }

                    } else if (isPdf) {
                        // PDF → metin çıkar
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
                        // Word (.docx / .doc) → metin çıkar
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
                        mime.startsWith('text/') ||
                        [
                            'application/json',
                            'application/javascript',
                            'application/x-javascript',
                            'application/typescript',
                            'application/xml',
                            'application/x-sh',
                            'application/x-yaml',
                            'application/yaml',
                        ].includes(mime) ||
                        // Mimetype belirsiz/octet-stream geldiğinde sadece
                        // bilinen metin uzantılarında bu yola düş — aksi halde
                        // PDF/Word gibi binary dosyalar yanlışlıkla burada
                        // UTF-8'e çevrilmeye çalışılırdı.
                        (mime === 'application/octet-stream' &&
                            /\.(txt|json|js|ts|csv|xml|sh|ya?ml|md|log)$/.test(filename))
                    ) {
                        // Düz metin dosyaları (txt, json, js, ts, csv, xml, sh, yaml...)
                        if (!state.fileEnabled) {
                            await sendText(chatId, '⚠️ File reading is currently disabled. To enable: !media file');
                            if (!rawPrompt) return;
                        } else {
                            try {
                                const text = buffer.toString('utf8');
                                fileContext = truncateFileText(`[File content (${mime})]\n${text}`);
                            } catch (e) {
                                await sendText(chatId, '⚠️ Could not convert the file to text.');
                                if (!rawPrompt) return;
                            }
                        }

                    } else {
                        // Desteklenmeyen format
                        await sendText(chatId,
                            `⚠️ This file type is not supported (${mime || 'unknown'}).\n` +
                            `Supported: image, PDF, Word, TXT, JSON, JS, TS, CSV, XML, YAML, SH`
                        );
                        if (!rawPrompt) return;
                    }
                }
            }

            // Dosya içeriği varsa prompt'un önüne ekle
            const prompt = fileContext
                ? `${fileContext}\n\n${rawPrompt || 'Review and summarize this file.'}`
                : rawPrompt || (images.length > 0 ? 'What do you see in this image?' : '');

            if (!prompt && images.length === 0) return; // nothing to send

            // Image-generation requests get routed to a separate image
            // backend instead of the normal text reply — see ai.js's
            // classifyImageIntent()/describeGeneratedImage() for how the chat
            // model still "knows" about the image afterwards without the
            // user ever being told two different AIs were involved. A PDF/
            // Word/text attachment still opts out entirely (that's read it,
            // not generate one), but a PHOTO attachment no longer does — the
            // classifier is told a photo came along too, so "redraw/
            // regenerate this" is recognized as a generation request for
            // that photo (see describeImageForGeneration below), while a
            // bare "what is this?" caption still falls through to normal
            // vision reading further down.
            if (state.imageGenEnabled && !fileContext && rawPrompt) {
                const intent = await classifyImageIntent(rawPrompt, images.length > 0);
                if (intent.image) {
                    if (state.thinkEnabled) {
                        await sendText(chatId, state.thinkMessage);
                    }
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
                        if (state.replyMode) {
                            await replyText(msg, state.aiErrorMessage);
                        } else {
                            await sendText(chatId, state.aiErrorMessage);
                        }
                    }
                    return;
                }
            }

            if (state.thinkEnabled) {
                await sendText(chatId, state.thinkMessage);
            }

            try {
                const aiResponse = await askModel(memoryKey, prompt, images);
                if (state.replyMode) {
                    await replyText(msg, aiResponse);
                } else {
                    await sendText(chatId, aiResponse);
                }
            } catch (err) {
                // AI failure: detailed error → debug channel only,
                // short generic notice → the active chat.
                await reportError('askModel', err);
                if (state.replyMode) {
                    await replyText(msg, state.aiErrorMessage);
                } else {
                    await sendText(chatId, state.aiErrorMessage);
                }
            }
        } catch (err) {
            await reportError('handleAiMessage', err);
        }
    }

    // Notification panel avatars (app/main.js's pushNotification) — chatId
    // → profile-pic URL (WhatsApp's own CDN, usable directly as an <img
    // src>) or null once resolved as "none"/failed. Fetched fire-and-forget
    // (see scheduleAvatarFetch below) instead of awaited inline: it's a real
    // network call, and blocking the message handler on it would delay
    // every command/AI reply by however long WhatsApp takes to answer —
    // the first message from a brand-new chat just goes out without one,
    // every message after that (once the fetch resolves) has it cached.
    const avatarCache = new Map();
    // Capped FIFO — a profile that's been up for weeks and seen thousands of
    // distinct chats shouldn't keep every avatar in memory forever.
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
        client.getProfilePicUrl(chatId)
            .then(url => cacheAvatar(chatId, url || null))
            .catch(() => {});
    }

    // Incoming message (from others) — skipped entirely in connectionMode
    // 'web' (see createBot's automationEnabled doc above).
    if (automationEnabled) client.on('message', async msg => {
        try {
            // Some whatsapp-web.js setups also fire 'message' for messages the
            // bot itself just sent (notably in "Message Yourself" chats). Without
            // this guard, the bot's own command replies (e.g. the "No-prefix mode
            // enabled" confirmation) get reprocessed as if a user sent them.
            if (msg.fromMe && isBotSentMessage(msg)) return;

            // A chat/user can be known by two IDs (the new @lid form and the
            // old phone-number @c.us form) — resolve both once and run every
            // list/map lookup below against the pair, so settings stored
            // under either form keep working.
            const chatIds = await idVariants(msg.from);

            // Blacklisted chats are fully ignored — messages and debug
            // commands alike — regardless of whitelist/prefix state.
            if (chatIds.some(id => blacklist.has(id))) return;

            // The app's notification panel (app/main.js's pushNotification)
            // — every incoming message that gets this far, regardless of
            // whether AI/commands below end up doing anything with it (a
            // message from a non-whitelisted or no-prefix chat still
            // deserves a glance in the panel, it just won't get an AI reply).
            if (onIncomingMessage) {
                try {
                    const chat = await msg.getChat().catch(() => null);
                    scheduleAvatarFetch(msg.from);
                    onIncomingMessage({
                        chatId: msg.from,
                        chatName: chat?.name || chat?.formattedTitle || msg.from,
                        senderName: msg._data?.notifyName || (msg.author ? msg.author.split('@')[0] : undefined),
                        body: msg.body || (msg.type && msg.type !== 'chat' ? `[${msg.type}]` : ''),
                        t: msg.timestamp ? msg.timestamp * 1000 : Date.now(),
                        avatarUrl: avatarCache.get(msg.from) || null,
                    });
                } catch (_) {}
            }

            const text = msg.body.trim().toLowerCase();

            // Prefixes are stored/edited verbatim (any case) but compared here
            // against an already-lower-cased text, so the comparison side must
            // be lower-cased too — otherwise a prefix with any uppercase letter
            // (e.g. set via "!prefix debug CMD") could never match again.
            if (text.startsWith(state.debugPrefix.toLowerCase())) {
                const senderId = msg.author || msg.from;
                const senderIds = await idVariants(senderId);

                if (senderIds.some(id => admins.has(id)) || msg.fromMe) {
                    const command = text.slice(state.debugPrefix.length).split(" ")[0];
                    if (commands[command]) {
                        const targetId = msg.fromMe ? msg.to : msg.from;
                        await dispatchCommand(command, msg, targetId, `command:${command}`);
                    }
                }

                // Anything starting with the debug prefix is treated as a debug
                // command attempt and must never reach the AI block below —
                // even if the sender isn't an admin or the command doesn't
                // exist. Without this, a non-admin's "!whatever" in a no-prefix
                // chat would get sent to the AI as a prompt.
                return;
            }

            if (state.aiChatEnabled) {
                const userId = msg.author || msg.from;
                const isNoPrefixChat = state.noPrefixAll || chatIds.some(id => noPrefixChats.has(id));
                const chatPrefix = chatIds.map(id => chatPrefixes[id]).find(p => p) || state.prefix;
                const hasPrefix = text.startsWith(chatPrefix.toLowerCase());

                // Skip if neither no-prefix mode nor prefix match
                if (!isNoPrefixChat && !hasPrefix) return;

                // In no-prefix chats, let people "speak" without triggering the AI
                // by starting their message with the ignore prefix.
                if (isNoPrefixChat && state.ignorePrefix && text.startsWith(state.ignorePrefix.toLowerCase())) return;

                if (state.fixedMode) {
                    if (chatIds.includes(state.activeChatId)) {
                        await handleAiMessage(msg, msg.from, msg.to, userId, msg.body, false, isNoPrefixChat, chatPrefix);
                    }
                    return;
                }

                if (state.whitelistMode && !chatIds.some(id => whitelist.has(id))) {
                    if (state.debugChatId) {
                        try {
                            await sendText(state.debugChatId, `New message received!\nID: ${msg.from}\nMessage: ${msg.body}`);
                        } catch (_) {}
                    }
                    return;
                }

                await handleAiMessage(msg, msg.from, msg.to, userId, msg.body, false, isNoPrefixChat, chatPrefix);
            }
        } catch (err) {
            await reportError('message_event', err);
        }
    });

    // Outgoing message (sent by you) — also skipped in connectionMode 'web'.
    if (automationEnabled) client.on('message_create', async (msg) => {
        try {
            if (!msg.fromMe) return;
            if (isBotSentMessage(msg)) return;

            const text = msg.body.trim().toLowerCase();

            if (text.startsWith(state.debugPrefix.toLowerCase())) {
                const command = text.slice(state.debugPrefix.length).split(" ")[0];
                if (commands[command]) {
                    const targetId = msg.to;
                    await dispatchCommand(command, msg, targetId, `command_create:${command}`);
                }
                // Debug-prefixed messages never fall through to the AI block,
                // even if the command name doesn't match anything — otherwise
                // a no-prefix chat would send "!typo" to the AI as a prompt.
                return;
            }

            if (state.aiChatEnabled) {
                // Same LID/c.us aliasing as the incoming-message handler.
                const chatIds = await idVariants(msg.to);
                const isNoPrefixChat = state.noPrefixAll || chatIds.some(id => noPrefixChats.has(id));
                const chatPrefix = chatIds.map(id => chatPrefixes[id]).find(p => p) || state.prefix;
                const hasPrefix = text.startsWith(chatPrefix.toLowerCase());

                // In no-prefix chats, let people "speak" without triggering the AI
                // by starting their message with the ignore prefix.
                if (isNoPrefixChat && state.ignorePrefix && text.startsWith(state.ignorePrefix.toLowerCase())) {
                    return;
                }

                if (isNoPrefixChat || hasPrefix) {
                    await handleAiMessage(msg, msg.from, msg.to, msg.to, msg.body, true, isNoPrefixChat, chatPrefix);
                }
            }
        } catch (err) {
            await reportError('message_create_event', err);
        }
    });

    // No process-level 'unhandledRejection'/'uncaughtException' listeners
    // here — those are process-wide, and N profiles would stack N of them.
    // app/main.js registers ONE global pair instead; `reportError` is
    // returned so callers (main.js) can still route a profile-scoped
    // failure to this profile's own debug chat when they know which
    // profile it belongs to. `store`/`utils`/`ratelimit` are returned too so
    // main.js's settings/chat/list IPC handlers (including the UI-triggered
    // factory reset, which also needs to clear rate-limit buckets) operate
    // on the SAME instances this bot is reading/writing — not a second,
    // disconnected copy.
    return { client, reportError, store, utils, ratelimit };
}
