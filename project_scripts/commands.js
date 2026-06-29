import fs from 'fs';
import { sendText } from './utils.js';
import {
    state, saveSettings, resetStateToDefaults,
    chatHistories,
    whitelist, saveWhitelist,
    admins, saveAdmins,
    noPrefixChats, saveNoPrefixChats,
    groupChats, saveGroupChats,
    chatModels, saveChatModels,
} from './config.js';
import { resetRateLimitBucket, resetAllRateLimitBuckets } from './ratelimit.js';

// ============================
// Project version — read from package.json (project root, one level up
// from this file's project_scripts/ folder). Falls back gracefully if
// the file is missing or malformed, so this never crashes Info/Help.
// ============================
function getVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
        return pkg.version || 'unknown';
    } catch (_) {
        return 'unknown';
    }
}

// ============================
// Confirmation gate
// Destructive commands require a follow-up "!<cmd> confirm" within 30s
// ============================
const pendingConfirms = new Map(); // key → { action: fn, expiresAt: timestamp }
const CONFIRM_TTL_MS = 30_000;

function requireConfirm(key, targetId, warningText, action) {
    // If a valid pending confirm already exists for this key → run it
    const pending = pendingConfirms.get(key);
    if (pending && Date.now() < pending.expiresAt) {
        pendingConfirms.delete(key);
        return action();
    }

    // Otherwise register and warn
    const expiresAt = Date.now() + CONFIRM_TTL_MS;
    pendingConfirms.set(key, { action, expiresAt });

    // Auto-cleanup: if the confirm is never used, remove it once it
    // expires so pendingConfirms doesn't grow unbounded over time.
    setTimeout(() => {
        const entry = pendingConfirms.get(key);
        if (entry && entry.expiresAt === expiresAt) {
            pendingConfirms.delete(key);
        }
    }, CONFIRM_TTL_MS);

    return sendText(targetId,
        `${warningText}\n` +
        `Run the same command again within 30s to confirm.`
    );
}

// ============================
// !admin  —  manage admin list
//   (no args / list) → show list
//   add [ID]         → add this chat or given ID
//   remove [ID]      → remove this chat or given ID
//   reset            → clear all (requires confirm)
// ============================
export async function Admin(msg, targetId) {
    const parts = msg.body.trim().split(/\s+/);
    const sub   = parts[1]?.toLowerCase();
    const selfId = msg.author || msg.from;

    if (!sub || sub === 'list') {
        if (admins.size === 0) return sendText(targetId, `No admins configured.`);
        return sendText(targetId, `Admins (${admins.size}):\n${[...admins].join('\n')}`);
    }

    if (sub === 'add') {
        const id = parts[2] || selfId;
        admins.add(id);
        saveAdmins();
        return sendText(targetId, `Added to admins: ${id}`);
    }

    if (sub === 'remove') {
        const id = parts[2] || selfId;
        if (!admins.has(id)) return sendText(targetId, `${id} is not an admin.`);
        admins.delete(id);
        saveAdmins();
        return sendText(targetId, `Removed from admins: ${id}`);
    }

    if (sub === 'reset') {
        return requireConfirm(`admin:reset:${targetId}`, targetId,
            `This will remove ALL ${admins.size} admin(s).`,
            async () => { admins.clear(); saveAdmins(); await sendText(targetId, `Admin list cleared.`); }
        );
    }

    await sendText(targetId,
        `Usage:\n` +
        `${state.debugPrefix}admin list\n` +
        `${state.debugPrefix}admin add [ID]\n` +
        `${state.debugPrefix}admin remove [ID]\n` +
        `${state.debugPrefix}admin reset`
    );
}

// ============================
// !whitelist  —  manage whitelist
//   (no args / list)  → show list
//   add [ID]          → add
//   remove [ID]       → remove
//   reset             → clear all (requires confirm)
//   control           → toggle new-chat gate
// ============================
export async function Whitelist(msg, targetId) {
    const parts = msg.body.trim().split(/\s+/);
    const sub   = parts[1]?.toLowerCase();
    const chat  = await msg.getChat();
    const selfId = chat.id._serialized;

    if (!sub || sub === 'list') {
        if (whitelist.size === 0) return sendText(targetId, `Whitelist is empty.`);
        return sendText(targetId, `Whitelist (${whitelist.size}):\n${[...whitelist].join('\n')}`);
    }

    if (sub === 'add') {
        const id = parts[2] || targetId;
        whitelist.add(id);
        saveWhitelist();
        return sendText(targetId, `Added to whitelist: ${id}`);
    }

    if (sub === 'remove') {
        const id = parts[2] || selfId;
        if (!whitelist.has(id)) return sendText(targetId, `${id} is not in the whitelist.`);
        whitelist.delete(id);
        saveWhitelist();
        return sendText(targetId, `Removed from whitelist: ${id}`);
    }

    if (sub === 'reset') {
        return requireConfirm(`whitelist:reset:${targetId}`, targetId,
            `This will remove ALL ${whitelist.size} whitelisted chat(s).`,
            async () => { whitelist.clear(); saveWhitelist(); await sendText(targetId, `Whitelist cleared.`); }
        );
    }

    if (sub === 'control') {
        // Turning OFF the whitelist gate while noPrefixAll is on means
        // EVERY incoming message would get a no-prefix AI response —
        // guard this specific transition with a confirmation.
        if (state.whitelistMode && state.noPrefixAll) {
            return requireConfirm(`whitelist:control:${targetId}`, targetId,
                `⚠️ No-prefix-all is currently ON. Disabling the whitelist gate ` +
                `will make the bot respond to EVERY incoming message from anyone, with no prefix needed.`,
                async () => {
                    state.whitelistMode = false;
                    saveSettings();
                    await sendText(targetId, `New-chat whitelist gate disabled.`);
                }
            );
        }

        state.whitelistMode = !state.whitelistMode;
        saveSettings();
        return sendText(targetId, `New-chat whitelist gate ${state.whitelistMode ? 'enabled' : 'disabled'}.`);
    }

    await sendText(targetId,
        `Usage:\n` +
        `${state.debugPrefix}whitelist list\n` +
        `${state.debugPrefix}whitelist add [ID]\n` +
        `${state.debugPrefix}whitelist remove [ID]\n` +
        `${state.debugPrefix}whitelist reset\n` +
        `${state.debugPrefix}whitelist control`
    );
}

// ============================
// !personality  —  manage system prompt
//   (no args)            → show active (this chat) + global personality
//   chat <text>          → set this chat's personality only
//   global <text>        → set global personality (applies to new/cleared chats)
// ============================
export async function Personality(msg, targetId) {
    const afterCmd   = msg.body.trim().split(/\s+/).slice(1).join(' ').trim();
    const firstWord  = afterCmd.split(/\s+/)[0]?.toLowerCase();
    const restOfText = afterCmd.split(/\s+/).slice(1).join(' ').trim();

    // personality chat <text> → set this chat's personality
    if (firstWord === 'chat') {
        if (!restOfText) {
            return sendText(targetId,
                `Usage: ${state.debugPrefix}personality chat <text>\n` +
                `Sets the personality for this chat only.\n\n` +
                `To view personalities, use: ${state.debugPrefix}personality`
            );
        }
        if (!chatHistories[targetId]) {
            chatHistories[targetId] = [{ role: 'system', content: restOfText }];
        } else {
            chatHistories[targetId][0].content = restOfText;
        }
        return sendText(targetId, `Personality for this chat updated:\n${restOfText}`);
    }

    // personality global <text> → set global personality
    if (firstWord === 'global') {
        if (!restOfText) {
            return sendText(targetId,
                `Usage: ${state.debugPrefix}personality global <text>\n` +
                `Sets the global personality (applies to new/cleared chats).\n\n` +
                `To view personalities, use: ${state.debugPrefix}personality`
            );
        }
        state.systemPrompt = restOfText;
        saveSettings();
        return sendText(targetId,
            `Global personality updated (applies to new/cleared chats):\n${state.systemPrompt}`
        );
    }

    // personality (no args) → show both active + global
    const hasCustom   = !!chatHistories[targetId];
    const activePers  = hasCustom ? chatHistories[targetId][0].content : state.systemPrompt;

    await sendText(targetId,
        `[Active personality — this chat]${hasCustom ? ' (custom)' : ' (using global)'}:\n${activePers}\n\n` +
        `[Global personality]:\n${state.systemPrompt}\n\n` +
        `Usage:\n` +
        `${state.debugPrefix}personality chat <text>    — set this chat's personality\n` +
        `${state.debugPrefix}personality global <text>  — set global personality`
    );
}

// ============================
// !think  —  manage think message
//   (no args)   → show status + current text
//   on / off    → toggle
//   <text>      → set new message text
// ============================
export async function Think(msg, targetId) {
    const parts = msg.body.trim().split(/\s+/);
    const sub   = parts[1]?.toLowerCase();

    if (!sub) {
        return sendText(targetId,
            `Think message: ${state.thinkEnabled ? 'Enabled' : 'Disabled'}\n` +
            `Text: ${state.thinkMessage}\n\n` +
            `Usage:\n` +
            `${state.debugPrefix}think on/off\n` +
            `${state.debugPrefix}think <text>`
        );
    }

    if (sub === 'on' || sub === 'off') {
        state.thinkEnabled = sub === 'on';
        saveSettings();
        return sendText(targetId, `Think message ${state.thinkEnabled ? 'enabled' : 'disabled'}.`);
    }

    state.thinkMessage = parts.slice(1).join(' ');
    saveSettings();
    await sendText(targetId, `Think message text updated:\n${state.thinkMessage}`);
}

// ============================
// !prefix  —  manage command prefixes
//   (no args)      → show all
//   main <p>       → change main prefix
//   debug <p>      → change debug prefix
//   ignore <p>     → change ignore prefix (no-prefix chats only)
// ============================
export async function Prefix(msg, targetId) {
    const parts = msg.body.trim().split(/\s+/);
    const sub   = parts[1]?.toLowerCase();

    if (!sub) {
        return sendText(targetId,
            `Prefixes:\n` +
            `- Main:   ${state.prefix}\n` +
            `- Debug:  ${state.debugPrefix}\n` +
            `- Ignore: ${state.ignorePrefix}  (no-prefix chats only)\n\n` +
            `Usage:\n` +
            `${state.debugPrefix}prefix main <p>\n` +
            `${state.debugPrefix}prefix debug <p>\n` +
            `${state.debugPrefix}prefix ignore <p>`
        );
    }

    if (sub === 'main') {
        const p = parts[2];
        if (!p) return sendText(targetId, `Usage: ${state.debugPrefix}prefix main <p>`);
        if (p === state.debugPrefix || p === state.ignorePrefix) return sendText(targetId, `Main prefix must differ from debug and ignore prefixes.`);
        state.prefix = p;
        saveSettings();
        return sendText(targetId, `Main prefix → ${state.prefix}`);
    }

    if (sub === 'debug') {
        const p = parts[2];
        if (!p) return sendText(targetId, `Usage: ${state.debugPrefix}prefix debug <p>`);
        if (p === state.prefix || p === state.ignorePrefix) return sendText(targetId, `Debug prefix must differ from main and ignore prefixes.`);
        state.debugPrefix = p;
        saveSettings();
        return sendText(targetId, `Debug prefix → ${state.debugPrefix}`);
    }

    if (sub === 'ignore') {
        const p = parts[2];
        if (!p) return sendText(targetId, `Usage: ${state.debugPrefix}prefix ignore <p>`);
        if (p === state.prefix || p === state.debugPrefix) return sendText(targetId, `Ignore prefix must differ from main and debug prefixes.`);
        state.ignorePrefix = p;
        saveSettings();
        return sendText(targetId, `Ignore prefix → ${state.ignorePrefix}\n(In no-prefix chats, messages starting with this won't be sent to the AI.)`);
    }

    await sendText(targetId,
        `Usage:\n` +
        `${state.debugPrefix}prefix main <p>\n` +
        `${state.debugPrefix}prefix debug <p>\n` +
        `${state.debugPrefix}prefix ignore <p>`
    );
}

// ============================
// !clear  —  clear chat memory
//   (no args)     → usage hint, clears nothing
//   chat          → clear this chat's memory
//   chat <ID>     → clear a specific chat's memory
//   all           → clear ALL chats' memory (requires confirm)
// ============================
export async function Clear(msg, targetId) {
    const parts = msg.body.trim().split(/\s+/);
    const sub   = parts[1]?.toLowerCase();

    if (sub === 'chat') {
        const id = parts[2] || targetId;
        if (!chatHistories[id]) {
            return sendText(targetId, id === targetId ? `No memory for this chat.` : `No memory for: ${id}`);
        }
        delete chatHistories[id];
        resetRateLimitBucket(id);
        return sendText(targetId, id === targetId ? `Memory cleared for this chat.` : `Memory cleared for: ${id}`);
    }

    if (sub === 'all') {
        const count = Object.keys(chatHistories).length;
        return requireConfirm(`clear:all:${targetId}`, targetId,
            `This will erase memory for ALL ${count} active chat(s).`,
            async () => {
                for (const key in chatHistories) delete chatHistories[key];
                resetAllRateLimitBuckets();
                await sendText(targetId, `All chat memories cleared.`);
            }
        );
    }

    // (no args) / unknown sub — usage hint only, nothing is deleted
    await sendText(targetId,
        `Usage:\n` +
        `${state.debugPrefix}clear chat          — clear this chat's memory\n` +
        `${state.debugPrefix}clear chat <ID>     — clear a specific chat's memory\n` +
        `${state.debugPrefix}clear all           — clear ALL chats' memory`
    );
}

// ============================
// !reset  —  reset settings back to defaults
//   (no args)                  → usage hint, resets nothing
//   settings                   → reset ALL of this chat's own overrides to global (requires confirm)
//   settings <name>            → reset a single chat-level setting (no confirm needed)
//                                 names: model, personality, noprefix, groupchat, debugchat, fixedchat
//   all settings               → factory-reset EVERYTHING (global state + all lists) (requires confirm)
// ============================

// Resets a single chat-level setting for `targetId`. Returns a status line.
function resetSingleChatSetting(targetId, name) {
    switch (name) {
        case 'model': {
            if (!chatModels[targetId]) return `This chat had no model override.`;
            delete chatModels[targetId];
            saveChatModels();
            return `Model override removed — back to global model: ${state.aiModel}`;
        }
        case 'personality': {
            if (!chatHistories[targetId]) return `This chat had no custom personality.`;
            chatHistories[targetId][0].content = state.systemPrompt;
            return `Personality reset to global for this chat.`;
        }
        case 'noprefix': {
            if (!noPrefixChats.has(targetId)) return `No-prefix mode was already off for this chat.`;
            noPrefixChats.delete(targetId);
            saveNoPrefixChats();
            return `No-prefix mode disabled for this chat.`;
        }
        case 'groupchat': {
            if (!groupChats.has(targetId)) return `Group chat mode was already off for this chat.`;
            groupChats.delete(targetId);
            saveGroupChats();
            return `Group chat mode disabled for this chat.`;
        }
        case 'debugchat': {
            if (state.debugChatId !== targetId) return `This chat wasn't the debug channel.`;
            state.debugChatId = null;
            return `Debug channel cleared (was this chat).`;
        }
        case 'fixedchat': {
            if (!(state.fixedMode && state.activeChatId === targetId)) return `Bot wasn't fixed to this chat.`;
            state.fixedMode = false;
            state.activeChatId = null;
            return `Bot unlocked from this chat.`;
        }
        default:
            return null; // unknown name
    }
}

const CHAT_SETTING_NAMES = ['model', 'personality', 'noprefix', 'groupchat', 'debugchat', 'fixedchat'];

export async function Reset(msg, targetId) {
    const parts = msg.body.trim().split(/\s+/);
    const sub   = parts[1]?.toLowerCase();
    const arg2  = parts[2]?.toLowerCase();

    // ---- reset all settings  (factory reset — global state + all lists) ----
    if (sub === 'all' && arg2 === 'settings') {
        return requireConfirm(`reset:all:${targetId}`, targetId,
            `This will reset EVERYTHING to the project's default config: ` +
            `all settings, the whitelist, admins, no-prefix chats, group chats, ` +
            `per-chat model overrides, and all chat memories.`,
            async () => {
                resetStateToDefaults();
                whitelist.clear();      saveWhitelist();
                admins.clear();         saveAdmins();
                noPrefixChats.clear();  saveNoPrefixChats();
                groupChats.clear();     saveGroupChats();
                for (const key in chatModels) delete chatModels[key];
                saveChatModels();
                for (const key in chatHistories) delete chatHistories[key];
                resetAllRateLimitBuckets();
                await sendText(targetId, `Everything has been reset to the project defaults.`);
            }
        );
    }

    // ---- reset settings [name] ----
    if (sub === 'settings') {
        // reset settings <name> — single chat-level setting, no confirm
        if (arg2) {
            if (!CHAT_SETTING_NAMES.includes(arg2)) {
                return sendText(targetId,
                    `Unknown setting "${arg2}".\n` +
                    `Available: ${CHAT_SETTING_NAMES.join(', ')}`
                );
            }
            const result = resetSingleChatSetting(targetId, arg2);
            return sendText(targetId, result);
        }

        // reset settings (no name) — reset ALL of this chat's overrides, requires confirm
        return requireConfirm(`reset:settings:${targetId}`, targetId,
            `This will reset ALL of this chat's own settings back to global ` +
            `(model, personality, no-prefix, group chat, debug channel, fixed chat — whichever apply).`,
            async () => {
                const lines = CHAT_SETTING_NAMES.map(name => resetSingleChatSetting(targetId, name));
                await sendText(targetId, `This chat's settings have been reset to global:\n` + lines.join('\n'));
            }
        );
    }

    // ---- (no args) / unknown sub — usage hint, nothing is reset ----
    await sendText(targetId,
        `Usage:\n` +
        `${state.debugPrefix}reset settings              — reset all of THIS chat's overrides to global\n` +
        `${state.debugPrefix}reset settings <name>       — reset a single setting (no confirm)\n` +
        `   names: ${CHAT_SETTING_NAMES.join(', ')}\n` +
        `${state.debugPrefix}reset all settings          — factory-reset EVERYTHING (global)`
    );
}


//   (no args)              → usage hint (ambiguous — use global or chat)
//   list                    → show global model + every chat override
//   global <name>           → change the main/global model
//   chat <name>             → change this chat's model override
//   chat <ID> <name>        → change the given chat's model override
//   chat reset              → remove this chat's override (falls back to global)
//   chat reset <ID>         → remove the given chat's override
//   installed               → list installed Ollama models
// ============================
export async function Model(msg, targetId) {
    const parts = msg.body.trim().split(/\s+/);
    const sub   = parts[1]?.toLowerCase();

    // ---- model list ----
    if (sub === 'list') {
        const entries = Object.entries(chatModels);
        let body = `Global model (default for new/cleared chats): ${state.aiModel}\n\n`;
        if (entries.length === 0) {
            body += `No per-chat overrides set.`;
        } else {
            body += `Per-chat overrides (${entries.length}):\n` +
                entries.map(([id, m]) => `• ${id} → ${m}`).join('\n');
        }
        return sendText(targetId, body);
    }

    // ---- model installed ----
    if (sub === 'installed') {
        let modelList = '';
        try {
            const { default: ollama } = await import('ollama');
            const result = await ollama.list();
            const models = result.models || [];
            if (models.length === 0) {
                modelList = '(no models found — is Ollama running?)';
            } else {
                modelList = models
                    .map(m => {
                        const name     = m.name || m.model || '?';
                        const sizeMb   = m.size ? (m.size / 1024 / 1024 / 1024).toFixed(1) + ' GB' : '';
                        const modified = m.modified_at
                            ? new Date(m.modified_at).toLocaleDateString()
                            : '';
                        const tag = name === state.aiModel
                            ? ' ← global'
                            : (Object.values(chatModels).includes(name) ? ' ← used by a chat' : '');
                        return `• ${name}${sizeMb ? '  [' + sizeMb + ']' : ''}${modified ? '  ' + modified : ''}${tag}`;
                    })
                    .join('\n');
            }
        } catch (err) {
            modelList = `(could not fetch model list: ${err.message || err})`;
        }
        return sendText(targetId, `Installed Ollama models:\n${modelList}`);
    }

    // ---- model global <name> ----
    if (sub === 'global') {
        const name = parts[2];
        if (!name) return sendText(targetId, `Usage: ${state.debugPrefix}model global <name>`);
        const old = state.aiModel;
        state.aiModel = name;
        saveSettings();
        return sendText(targetId, `Global model changed:\n${old} → ${state.aiModel}\n(Used by chats without their own override.)`);
    }

    // ---- model chat ... ----
    if (sub === 'chat') {
        const arg2 = parts[2];
        const arg3 = parts[3];

        // model chat reset [ID]
        if (arg2?.toLowerCase() === 'reset') {
            const id = arg3 || targetId;
            if (!chatModels[id]) return sendText(targetId, `${id} has no model override (already using global).`);
            delete chatModels[id];
            saveChatModels();
            return sendText(targetId, `Model override removed for: ${id}\nNow using global model: ${state.aiModel}`);
        }

        // model chat <name>            → this chat
        // model chat <ID> <name>       → given chat
        let id, name;
        if (arg3) {
            id = arg2;
            name = arg3;
        } else {
            id = targetId;
            name = arg2;
        }

        if (!name) {
            return sendText(targetId,
                `Usage:\n` +
                `${state.debugPrefix}model chat <name>          — set this chat's model\n` +
                `${state.debugPrefix}model chat <ID> <name>     — set a specific chat's model\n` +
                `${state.debugPrefix}model chat reset [ID]      — remove override, fall back to global`
            );
        }

        const old = chatModels[id] || `${state.aiModel} (global)`;
        chatModels[id] = name;
        saveChatModels();
        return sendText(targetId, `Model for ${id}:\n${old} → ${name}`);
    }

    // ---- model (no args) / unknown sub ----
    const hasOverride = !!chatModels[targetId];
    await sendText(targetId,
        `Model commands are split into global vs. per-chat — please specify:\n\n` +
        `${state.debugPrefix}model global <name>        — change the main model (default for all chats)\n` +
        `${state.debugPrefix}model chat <name>          — change this chat's model only\n` +
        `${state.debugPrefix}model chat <ID> <name>     — change a specific chat's model\n` +
        `${state.debugPrefix}model chat reset [ID]      — remove a chat's override\n` +
        `${state.debugPrefix}model list                 — show global model + all overrides\n` +
        `${state.debugPrefix}model installed            — list installed Ollama models\n\n` +
        `This chat is currently using: ${hasOverride ? chatModels[targetId] + ' (override)' : state.aiModel + ' (global)'}`
    );
}

// ============================
// !aichat  —  toggle AI responses
// ============================
export async function AiChat(msg, targetId) {
    state.aiChatEnabled = !state.aiChatEnabled;
    saveSettings();
    await sendText(targetId, `AI chat ${state.aiChatEnabled ? 'enabled' : 'disabled'}.`);
}

// ============================
// !fixedchat  —  lock bot to one chat
// ============================
export async function FixedChat(msg, targetId) {
    state.fixedMode = !state.fixedMode;
    state.activeChatId = state.fixedMode ? targetId : null;
    // fixedMode is intentionally not persisted (runtime-only)
    await sendText(targetId, state.fixedMode
        ? `Bot locked to this chat.`
        : `Bot unlocked — responding everywhere.`
    );
}

// ============================
// !noprefix  —  toggle no-prefix mode for this chat
// ============================
export async function NoPrefix(msg, targetId) {
    if (noPrefixChats.has(targetId)) {
        noPrefixChats.delete(targetId);
        saveNoPrefixChats();
        await sendText(targetId, `No-prefix mode disabled. Prefix required again.`);
    } else {
        noPrefixChats.add(targetId);
        saveNoPrefixChats();
        await sendText(targetId,
            `No-prefix mode enabled. Bot will respond to every message.\n` +
            `Start a message with "${state.ignorePrefix}" to skip the AI for that message.`
        );
    }
}

// ============================
// !noprefixall  —  toggle no-prefix mode globally for every chat
// Which chats actually get a response still depends on whitelistMode:
//   - whitelistMode ON  → only whitelisted chats respond (no-prefix)
//   - whitelistMode OFF → every incoming message gets a no-prefix
//     response — dangerous, so turning this ON while whitelist is OFF
//     requires confirmation. Turning it back OFF is always immediate.
// ============================
export async function NoPrefixAll(msg, targetId) {
    if (state.noPrefixAll) {
        state.noPrefixAll = false;
        saveSettings();
        return sendText(targetId, `No-prefix-all disabled. Prefix (or per-chat no-prefix mode) required again.`);
    }

    if (!state.whitelistMode) {
        return requireConfirm(`noprefixall:enable:${targetId}`, targetId,
            `⚠️ Whitelist mode is currently OFF. Enabling no-prefix-all ` +
            `will make the bot respond to EVERY incoming message from anyone, with no prefix needed.`,
            async () => {
                state.noPrefixAll = true;
                saveSettings();
                await sendText(targetId,
                    `No-prefix-all enabled. Bot will respond to every message in every chat — no prefix needed.`
                );
            }
        );
    }

    state.noPrefixAll = true;
    saveSettings();
    await sendText(targetId,
        `No-prefix-all enabled. Whitelisted chats will respond to every message — no prefix needed.`
    );
}

// ============================
// !groupchat  —  toggle shared-memory group chat mode
//   (no args)  → toggle for the group this command was run in
//   list       → show all groups with the mode enabled
//   [ID]       → toggle for the given group ID instead
// In a group with this mode on, every member's AI message is routed
// into ONE shared chatHistories entry (keyed by the group ID) instead
// of one per sender — the AI replies as if it's one ongoing chat.
// ============================
export async function GroupChat(msg, targetId) {
    const arg = msg.body.trim().split(/\s+/)[1];

    if (arg?.toLowerCase() === 'list') {
        if (groupChats.size === 0) return sendText(targetId, `No group chat mode active anywhere.`);
        return sendText(targetId, `Group chat mode active (${groupChats.size}):\n${[...groupChats].join('\n')}`);
    }

    const id = arg || targetId;

    if (groupChats.has(id)) {
        groupChats.delete(id);
        saveGroupChats();
        await sendText(targetId, `Group chat mode disabled for: ${id}`);
    } else {
        groupChats.add(id);
        saveGroupChats();
        await sendText(targetId,
            `Group chat mode enabled for: ${id}\n` +
            `Everyone in this group now shares one AI conversation.`
        );
    }
}

// ============================
// !debugchat  —  register debug channel
// ============================
export async function DebugChat(msg, targetId) {
    state.debugChatId = targetId;
    // debugChatId is intentionally not persisted (runtime-only)
    await sendText(targetId, `Debug channel set.\nID: ${state.debugChatId}`);
}

// ============================
// !ratelimit  —  token bucket rate limiter
//   (no args)           → show settings
//   on / off            → toggle
//   tokens <n>          → max burst token count
//   refill <sec>        → seconds per token refill
//   warn <sec>          → warning cooldown in seconds
//   message <text>      → warning text shown to users
// ============================
export async function RateLimit(msg, targetId) {
    const parts = msg.body.trim().split(/\s+/);
    const sub   = parts[1]?.toLowerCase();

    if (!sub) {
        return sendText(targetId,
            `Rate Limit Settings:\n` +
            `- Enabled:       ${state.rateLimitEnabled}\n` +
            `- Max tokens:    ${state.rateLimitMaxTokens} (burst)\n` +
            `- Refill:        1 token / ${state.rateLimitRefillMs / 1000}s\n` +
            `- Warn cooldown: ${state.rateLimitWarnCooldown / 1000}s\n` +
            `- Warn message:  ${state.rateLimitWarnMessage}\n\n` +
            `Usage:\n` +
            `${state.debugPrefix}ratelimit on/off\n` +
            `${state.debugPrefix}ratelimit tokens <n>\n` +
            `${state.debugPrefix}ratelimit refill <seconds>\n` +
            `${state.debugPrefix}ratelimit warn <seconds>\n` +
            `${state.debugPrefix}ratelimit message <text>`
        );
    }

    if (sub === 'on' || sub === 'off') {
        state.rateLimitEnabled = sub === 'on';
        saveSettings();
        return sendText(targetId, `Rate limiting ${state.rateLimitEnabled ? 'enabled' : 'disabled'}.`);
    }
    if (sub === 'tokens') {
        const n = parseInt(parts[2]);
        if (isNaN(n) || n < 1) return sendText(targetId, `Invalid. Usage: ${state.debugPrefix}ratelimit tokens <n>`);
        state.rateLimitMaxTokens = n;
        saveSettings();
        return sendText(targetId, `Max burst tokens: ${n}`);
    }
    if (sub === 'refill') {
        const s = parseFloat(parts[2]);
        if (isNaN(s) || s <= 0) return sendText(targetId, `Invalid. Usage: ${state.debugPrefix}ratelimit refill <seconds>`);
        state.rateLimitRefillMs = Math.round(s * 1000);
        saveSettings();
        return sendText(targetId, `Refill interval: ${s}s`);
    }
    if (sub === 'warn') {
        const s = parseFloat(parts[2]);
        if (isNaN(s) || s < 0) return sendText(targetId, `Invalid. Usage: ${state.debugPrefix}ratelimit warn <seconds>`);
        state.rateLimitWarnCooldown = Math.round(s * 1000);
        saveSettings();
        return sendText(targetId, `Warn cooldown: ${s}s`);
    }
    if (sub === 'message') {
        const text = parts.slice(2).join(' ');
        if (!text) return sendText(targetId, `Usage: ${state.debugPrefix}ratelimit message <text>`);
        state.rateLimitWarnMessage = text;
        saveSettings();
        return sendText(targetId, `Rate limit warn message updated:\n${state.rateLimitWarnMessage}`);
    }

    await sendText(targetId, `Unknown subcommand "${sub}". Use ${state.debugPrefix}ratelimit to see options.`);
}

// ============================
// !info  —  status overview
//   (no args)  → quick snapshot
//   chat       → this chat's details
//   ai         → AI, think, rate limit, personality
//   system     → prefixes, whitelist, debug channel
// ============================
export async function Info(msg, targetId) {
    const parts  = msg.body.trim().split(/\s+/);
    const sub    = parts[1]?.toLowerCase();
    const chat   = await msg.getChat();
    const chatId = chat.id._serialized;

    if (!sub) {
        return sendText(targetId,
            `NeRoBoT v${getVersion()} — Status Overview\n` +
            `\n[Chat]\n` +
            `ID: ${chatId}  |  ${chat.isGroup ? 'Group' : 'DM'}\n` +
            `No-prefix: ${noPrefixChats.has(targetId) ? 'on' : 'off'}  |  ` +
            `Group chat: ${groupChats.has(targetId) ? 'on' : 'off'}  |  ` +
            `Memory: ${chatHistories[targetId] ? 'active' : 'none'}\n` +
            `\n[AI]\n` +
            `Enabled: ${state.aiChatEnabled}  |  Model: ${chatModels[targetId] || state.aiModel}${chatModels[targetId] ? ' (override)' : ' (global)'}\n` +
            `Fixed chat: ${state.fixedMode ? `on (${state.activeChatId})` : 'off'}\n` +
            `Think: ${state.thinkEnabled ? 'on' : 'off'}  |  ` +
            `Rate limit: ${state.rateLimitEnabled ? `on (${state.rateLimitMaxTokens}t / ${state.rateLimitRefillMs/1000}s)` : 'off'}  |  ` +
            `Reply mode: ${state.replyMode ? 'on' : 'off'}\n` +
            `\n[System]\n` +
            `Prefix: ${state.prefix}  |  Debug: ${state.debugPrefix}\n` +
            `Whitelist mode: ${state.whitelistMode ? 'on' : 'off'}  |  ` +
            `No-prefix-all: ${state.noPrefixAll ? 'on' : 'off'}  |  ` +
            `Admins: ${admins.size}  |  Whitelist: ${whitelist.size}\n` +
            `\nUse ${state.debugPrefix}info ai / chat / system for details.`
        );
    }

    if (sub === 'chat') {
        const hasCustom   = !!chatHistories[targetId];
        const personality = hasCustom ? chatHistories[targetId][0].content : state.systemPrompt;
        return sendText(targetId,
            `[Chat Info]\n` +
            `ID: ${chatId}\n` +
            `Type: ${chat.isGroup ? 'Group' : 'DM'}\n` +
            `No-prefix mode: ${noPrefixChats.has(targetId) ? 'Enabled' : 'Disabled'}\n` +
            `Group chat mode: ${groupChats.has(targetId) ? 'Enabled (shared memory)' : 'Disabled'}\n` +
            `Model: ${chatModels[targetId] || state.aiModel}${chatModels[targetId] ? ' (override)' : ' (global)'}\n` +
            `Memory: ${hasCustom ? `Active (${chatHistories[targetId].length - 1} messages)` : 'None'}\n` +
            `Personality: ${hasCustom ? '(custom)' : '(global)'}\n` +
            `${personality}`
        );
    }

    if (sub === 'ai') {
        const hasCustom   = !!chatHistories[targetId];
        const personality = hasCustom ? chatHistories[targetId][0].content : state.systemPrompt;
        return sendText(targetId,
            `[AI Info]\n` +
            `Enabled: ${state.aiChatEnabled}  |  Global model: ${state.aiModel}\n` +
            `This chat's model: ${chatModels[targetId] || state.aiModel}${chatModels[targetId] ? ' (override)' : ' (using global)'}\n` +
            `Fixed chat: ${state.fixedMode ? `Enabled (${state.activeChatId})` : 'Disabled'}\n` +
            `\n` +
            `Think message: ${state.thinkEnabled ? 'Enabled' : 'Disabled'}\n` +
            `Think text: ${state.thinkMessage}\n` +
            `Reply mode: ${state.replyMode ? 'Enabled' : 'Disabled'}\n` +
            `Image reading: ${state.imageEnabled ? 'Enabled' : 'Disabled'}\n` +
            `File reading:  ${state.fileEnabled  ? 'Enabled' : 'Disabled'}\n` +
            `\n` +
            `Rate limiting: ${state.rateLimitEnabled ? 'Enabled' : 'Disabled'}\n` +
            `Tokens: ${state.rateLimitMaxTokens} burst  |  Refill: ${state.rateLimitRefillMs/1000}s  |  Warn cooldown: ${state.rateLimitWarnCooldown/1000}s\n` +
            `\n` +
            `AI error message: ${state.aiErrorMessage}\n` +
            `\n` +
            `Global personality:\n${state.systemPrompt}\n` +
            `\nActive personality (this chat)${hasCustom ? ' [custom]' : ' [global]'}:\n${personality}`
        );
    }

    if (sub === 'system') {
        return sendText(targetId,
            `[System Info]\n` +
            `Version: v${getVersion()}\n` +
            `Main prefix:   ${state.prefix}\n` +
            `Debug prefix:  ${state.debugPrefix}\n` +
            `Ignore prefix: ${state.ignorePrefix}\n` +
            `Help language: ${state.helpLanguage.toUpperCase()}\n` +
            `Debug channel: ${state.debugChatId || 'None'}\n` +
            `\n` +
            `Whitelist mode:  ${state.whitelistMode ? 'Enabled' : 'Disabled'}\n` +
            `No-prefix-all:   ${state.noPrefixAll ? 'Enabled' : 'Disabled'}\n` +
            `Whitelist count: ${whitelist.size}\n` +
            `Admin count:     ${admins.size}`
        );
    }

    await sendText(targetId,
        `Usage:\n` +
        `${state.debugPrefix}info          — overview\n` +
        `${state.debugPrefix}info chat     — this chat's details\n` +
        `${state.debugPrefix}info ai       — AI & rate limit settings\n` +
        `${state.debugPrefix}info system   — prefixes, whitelist, debug`
    );
}

// ============================
// !aierror  —  manage AI failure message (sent to user when AI errors)
//   (no args)   → show current text
//   <text>      → set new message text
// ============================
export async function AiError(msg, targetId) {
    const text = msg.body.trim().split(/\s+/).slice(1).join(' ').trim();

    if (!text) {
        return sendText(targetId,
            `AI error message (shown in active chat on AI failure):\n${state.aiErrorMessage}\n\n` +
            `Usage:\n${state.debugPrefix}aierror <text>`
        );
    }

    state.aiErrorMessage = text;
    saveSettings();
    await sendText(targetId, `AI error message updated:\n${state.aiErrorMessage}`);
}

// ============================
// !help
//   (no args)  → full help menu (TR or EN, based on helpLanguage)
//   github     → sends the project's GitHub link
// ============================
export async function Help(msg, targetId) {
    const sub = msg.body.trim().split(/\s+/)[1]?.toLowerCase();

    if (sub === 'github') {
        return sendText(targetId, `NeRoBoT v${getVersion()} — GitHub:\nhttps://github.com/SalihYzts/NeRoBoT`);
    }

    const helpText  = fs.readFileSync('./NeRoBoT_db/help.txt', 'utf8');
    const trMatch   = helpText.match(/===TR===\s*([\s\S]*?)(?====EN===|$)/);
    const enMatch   = helpText.match(/===EN===\s*([\s\S]*?)$/);
    const trSection = trMatch ? trMatch[1].trim() : 'TR bölümü bulunamadı.';
    const enSection = enMatch ? enMatch[1].trim() : 'EN section not found.';
    await sendText(targetId, state.helpLanguage === 'en' ? enSection : trSection);
}

// ============================
// !helplang tr/en
// ============================
export async function HelpLang(msg, targetId) {
    const lang = msg.body.trim().toLowerCase().split(/\s+/)[1];
    if (lang === 'tr' || lang === 'en') {
        state.helpLanguage = lang;
        saveSettings();
        return sendText(targetId, `Help language: ${lang.toUpperCase()}`);
    }
    await sendText(targetId,
        `Current: ${state.helpLanguage.toUpperCase()}\n` +
        `Usage: ${state.debugPrefix}helplang tr/en`
    );
}

// ============================
// !replymode  —  toggle quoted-reply mode for AI responses
// ============================
export async function ReplyMode(msg, targetId) {
    state.replyMode = !state.replyMode;
    saveSettings();
    await sendText(targetId, `Reply mode ${state.replyMode ? 'enabled — AI will quote your message when responding.' : 'disabled — AI will send plain messages.'}`);
}

// ============================
// !media  —  toggle image / file reading
//   (no args)   → show status
//   image       → toggle görsel okuma (vision)
//   file        → toggle dosya okuma (pdf, word, txt, json, js...)
// ============================
export async function Media(msg, targetId) {
    const sub = msg.body.trim().split(/\s+/)[1]?.toLowerCase();

    if (!sub) {
        return sendText(targetId,
            `Media Settings:\n` +
            `- Image reading: ${state.imageEnabled ? 'Enabled' : 'Disabled'}\n` +
            `- File reading:  ${state.fileEnabled  ? 'Enabled' : 'Disabled'}\n\n` +
            `Usage:\n` +
            `${state.debugPrefix}media image\n` +
            `${state.debugPrefix}media file`
        );
    }

    if (sub === 'image') {
        state.imageEnabled = !state.imageEnabled;
        saveSettings();
        return sendText(targetId, `Image reading (vision) ${state.imageEnabled ? 'enabled' : 'disabled'}.`);
    }

    if (sub === 'file') {
        state.fileEnabled = !state.fileEnabled;
        saveSettings();
        return sendText(targetId, `File reading (PDF, Word, TXT, JSON, JS...) ${state.fileEnabled ? 'enabled' : 'disabled'}.`);
    }

    await sendText(targetId,
        `Usage:\n` +
        `${state.debugPrefix}media image  — toggle görsel okuma\n` +
        `${state.debugPrefix}media file   — toggle dosya okuma`
    );
}

// ============================
// Command map
// ============================
export const commands = {
    'admin':       Admin,
    'whitelist':   Whitelist,
    'personality': Personality,
    'think':       Think,
    'prefix':      Prefix,
    'clear':       Clear,
    'reset':       Reset,
    'model':       Model,
    'aichat':      AiChat,
    'fixedchat':   FixedChat,
    'noprefix':    NoPrefix,
    'noprefixall': NoPrefixAll,
    'groupchat':   GroupChat,
    'debugchat':   DebugChat,
    'ratelimit':   RateLimit,
    'info':        Info,
    'help':        Help,
    'helplang':    HelpLang,
    'aierror':     AiError,
    'replymode':   ReplyMode,
    'media':       Media,
};