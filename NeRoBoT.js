import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import { createRequire } from 'module';
import mammoth from 'mammoth';

import { state, whitelist, admins, noPrefixChats, groupChats, CHROME_PATH } from './project_scripts/config.js';
import { setClient, sendText, replyText, isBotSentMessage } from './project_scripts/utils.js';
import { commands } from './project_scripts/commands.js';
import { askModel } from './project_scripts/ai.js';
import { checkRateLimit } from './project_scripts/ratelimit.js';

// pdf-parse v2 exposes a PDFParse class (pdf.js based) instead of the old
// v1 callable function — see https://github.com/mehmet-kozan/pdf-parse
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const { Client } = pkg;

const client = new Client({
    puppeteer: {
        executablePath: CHROME_PATH,
        headless: false
    },
});

setClient(client);

client.on('qr', qr => qrcode.generate(qr, { small: true }));

client.on('ready', () => {
    process.stdout.write('\x1Bc');
    const asciiArt = fs.readFileSync('./NeRoBoT_db/ascii.txt', 'utf8');
    console.log(asciiArt);
});

// Report error — send to debug chat only
async function reportError(context, err) {
    if (state.debugChatId) {
        try {
            await sendText(state.debugChatId, `[NeRoBoT Error - ${context}]\n${err.message || err}`);
        } catch (_) {}
    }
}

// Handle AI message
async function handleAiMessage(msg, from, to, userId, body, fromMe, noPrefix = false) {
    const chatId = fromMe ? to : from;

    // In group-chat mode, everyone in this chat shares ONE AI memory
    // (keyed by the group's chatId) instead of one per sender.
    // Rate limiting stays per-user regardless, so one chatty member
    // can't burn through the whole group's token bucket.
    const memoryKey = groupChats.has(chatId) ? chatId : userId;

    try {
        // Rate limit check — runs before thinkMessage so we don't send "thinking..." then drop it
        const { allowed, shouldWarn } = checkRateLimit(userId);
        if (!allowed) {
            if (shouldWarn) {
                await sendText(chatId, state.rateLimitWarnMessage);
            }
            return;
        }

        // In no-prefix mode send the raw message, otherwise strip the prefix
        const rawPrompt = noPrefix ? body.trim() : body.slice(state.prefix.length).trim();

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
            try {
                const media = await msg.downloadMedia();
                if (!media) throw new Error('Failed to download media.');

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
                                fileContext = `[PDF content]\n${result.text.trim()}`;
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
                            fileContext = `[Word document content]\n${result.value.trim()}`;
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
                            // Çok büyük dosyaları kırp (model context limiti gözetilerek)
                            const MAX_CHARS = 30_000;
                            const trimmed = text.length > MAX_CHARS
                                ? text.slice(0, MAX_CHARS) + `\n\n[... ${text.length - MAX_CHARS} characters truncated]`
                                : text;
                            fileContext = `[File content (${mime})]\n${trimmed}`;
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

            } catch (err) {
                // Media download failure shouldn't crash the flow — report
                // to debug chat and fall back to text-only if there's a caption.
                await reportError('downloadMedia', err);
                await sendText(chatId, state.aiErrorMessage);
                if (!rawPrompt) return;
            }
        }

        // Dosya içeriği varsa prompt'un önüne ekle
        const prompt = fileContext
            ? `${fileContext}\n\n${rawPrompt || 'Review and summarize this file.'}`
            : rawPrompt || (images.length > 0 ? 'What do you see in this image?' : '');

        if (!prompt && images.length === 0) return; // nothing to send

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

// Incoming message (from others)
client.on('message', async msg => {
    try {
        // Some whatsapp-web.js setups also fire 'message' for messages the
        // bot itself just sent (notably in "Message Yourself" chats). Without
        // this guard, the bot's own command replies (e.g. the "No-prefix mode
        // enabled" confirmation) get reprocessed as if a user sent them.
        if (msg.fromMe && isBotSentMessage(msg)) return;

        const text = msg.body.trim().toLowerCase();

        if (text.startsWith(state.debugPrefix)) {
            const senderId = msg.author || msg.from;

            if (admins.has(senderId) || msg.fromMe) {
                const command = text.slice(state.debugPrefix.length).split(" ")[0];
                if (commands[command]) {
                    const targetId = msg.fromMe ? msg.to : msg.from;
                    try {
                        await commands[command](msg, targetId);
                    } catch (err) {
                        await reportError(`command:${command}`, err);
                    }
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
            const isNoPrefixChat = state.noPrefixAll || noPrefixChats.has(msg.from);
            const hasPrefix = text.startsWith(state.prefix);

            // Skip if neither no-prefix mode nor prefix match
            if (!isNoPrefixChat && !hasPrefix) return;

            // In no-prefix chats, let people "speak" without triggering the AI
            // by starting their message with the ignore prefix.
            if (isNoPrefixChat && state.ignorePrefix && text.startsWith(state.ignorePrefix)) return;

            if (state.fixedMode) {
                if (msg.from === state.activeChatId) {
                    await handleAiMessage(msg, msg.from, msg.to, userId, msg.body, false, isNoPrefixChat);
                }
                return;
            }

            if (state.whitelistMode && !whitelist.has(msg.from)) {
                if (state.debugChatId) {
                    try {
                        await sendText(state.debugChatId, `New message received!\nID: ${msg.from}\nMessage: ${msg.body}`);
                    } catch (_) {}
                }
                return;
            }

            await handleAiMessage(msg, msg.from, msg.to, userId, msg.body, false, isNoPrefixChat);
        }
    } catch (err) {
        await reportError('message_event', err);
    }
});

// Outgoing message (sent by you)
client.on('message_create', async (msg) => {
    try {
        if (!msg.fromMe) return;
        if (isBotSentMessage(msg)) return;

        const text = msg.body.trim().toLowerCase();

        if (text.startsWith(state.debugPrefix)) {
            const command = text.slice(state.debugPrefix.length).split(" ")[0];
            if (commands[command]) {
                const targetId = msg.to;
                try {
                    await commands[command](msg, targetId);
                } catch (err) {
                    await reportError(`command_create:${command}`, err);
                }
            }
            // Debug-prefixed messages never fall through to the AI block,
            // even if the command name doesn't match anything — otherwise
            // a no-prefix chat would send "!typo" to the AI as a prompt.
            return;
        }

        if (state.aiChatEnabled) {
            const isNoPrefixChat = state.noPrefixAll || noPrefixChats.has(msg.to);
            const hasPrefix = text.startsWith(state.prefix);

            // In no-prefix chats, let people "speak" without triggering the AI
            // by starting their message with the ignore prefix.
            if (isNoPrefixChat && state.ignorePrefix && text.startsWith(state.ignorePrefix)) {
                return;
            }

            if (isNoPrefixChat || hasPrefix) {
                await handleAiMessage(msg, msg.from, msg.to, msg.to, msg.body, true, isNoPrefixChat);
            }
        }
    } catch (err) {
        await reportError('message_create_event', err);
    }
});

// Global unhandled errors — prevent bot from crashing
process.on('unhandledRejection', async (reason) => {
    await reportError('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
});

process.on('uncaughtException', async (err) => {
    await reportError('uncaughtException', err);
});

client.initialize();