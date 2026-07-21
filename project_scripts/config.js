import fs from 'fs';
import path from 'path';

// ============================
// Default state (used when settings.json doesn't exist yet)
// ============================
const DEFAULTS = {
    // Behaviour
    fixedMode:             false,
    activeChatId:          null,
    debugChatId:           null,
    whitelistMode:         false,
    // Off by default — AI is an opt-in "service" a profile turns on, not
    // an always-on default (see the Hizmetler/AI settings tab).
    aiChatEnabled:         false,

    // No-prefix-all — when enabled, EVERY chat is treated as no-prefix
    // (no need to be in the noPrefixChats set). Which chats actually get
    // a response is still gated by whitelistMode:
    //   - whitelistMode ON  → only whitelisted chats respond (now no-prefix)
    //   - whitelistMode OFF → literally every incoming message gets a
    //     no-prefix response — dangerous, so toggling this on/off is
    //     guarded (see commands.js NoPrefixAll / Whitelist control).
    // Defaults to OFF.
    noPrefixAll:           false,

    // Prefixes
    prefix:                ".",
    debugPrefix:           "!",
    ignorePrefix:          "/",     // in no-prefix chats, messages starting with this are NOT sent to AI

    // AI
    aiModel:               "minimax-m3:cloud",
    systemPrompt:          "Your name is NeRoBoT. You were created by Salih Yazıtaş.",

    // Vector memory (RAG-lite) — instead of always sending a chat's ENTIRE
    // raw history to the model, embed each message and only send the most
    // recent turns plus the most semantically relevant older ones. Falls
    // back to a plain recency window automatically if the embed model
    // below isn't pulled (see project_scripts/ai.js), so leaving this on
    // is safe even without the extra model.
    vectorMemoryEnabled:   true,
    embedModel:            "nomic-embed-text",

    // Think message
    thinkEnabled:          true,
    thinkMessage:          "NeRoBoT is thinking...",

    // Rate limiting (token bucket)
    rateLimitEnabled:      true,
    rateLimitMaxTokens:    3,        // max burst messages before throttling
    rateLimitRefillMs:     15000,    // 1 token refilled every N ms
    rateLimitWarnCooldown: 60000,    // min ms between warning messages per user
    rateLimitWarnMessage:  "⚠️ You're sending messages too fast. Please wait a moment.",

    // Help
    helpLanguage:          "en",     // "tr" | "en"

    // AI error message — shown to the user in the active chat when the
    // AI fails to respond. The detailed error always goes to the debug channel.
    aiErrorMessage:        "⚠️An unexpected error occurred. Please contact the developer.",

    // Reply mode — when enabled, AI responses are sent as a quoted reply
    // to the user's original message instead of a plain message.
    replyMode:             true,

    // Media toggles — control whether images / files are forwarded to the AI.
    imageEnabled:          true,   // görsel okuma (vision)
    fileEnabled:           true,   // dosya okuma (pdf, word, txt, json, js...)

    // Image generation — Ollama itself can't draw, so a request that's
    // clearly asking for a picture gets routed to a separate image backend
    // instead (see project_scripts/imagegen.js + ai.js's
    // classifyImageIntent()). On by default (Pollinations needs no API key,
    // so there's nothing to configure before it works).
    imageGenEnabled:       true,
    // Which backend imageGenEnabled routes to — 'pollinations' (free, no
    // key) | 'openai' | 'stability'. The latter two need their own API key
    // below; switching providers keeps both keys around so flipping back
    // and forth doesn't lose either one.
    imageGenProvider:      'pollinations',
    imageGenApiKeyOpenai:     '',
    imageGenApiKeyStability:  '',

    // Browser permissions the embedded WhatsApp view grants — see
    // app/main.js's setPermissionRequestHandler. Microphone is always
    // granted (voice messages are a core feature, and this embedded view
    // has no address-bar UI to fall back on if denied). Notifications/
    // location/camera are genuinely optional, so they're toggleable here;
    // on by default since that's what a real browser would prompt-and-allow
    // for WhatsApp Web too.
    notificationsEnabled:  true,
    locationEnabled:       true,
    cameraEnabled:         true,

    // Preferred mic/camera for the embedded WhatsApp view (device id from
    // navigator.mediaDevices.enumerateDevices()) — empty means "system
    // default". WhatsApp Web only offers its own device picker inside an
    // active call; this covers voice-message recording too. See
    // app/main.js's injectMediaDevicePrefs().
    preferredMicId:        '',
    preferredCameraId:     '',
};

// ============================
// Helpers: generic JSON file load/save
// ============================
function loadJson(filePath, fallback) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
        return fallback;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

function saveJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export const PERSISTENT_KEYS = [
    'prefix', 'debugPrefix', 'ignorePrefix', 'whitelistMode', 'aiChatEnabled',
    'noPrefixAll',
    'aiModel', 'systemPrompt', 'debugChatId', 'vectorMemoryEnabled', 'embedModel',
    'thinkEnabled', 'thinkMessage',
    'rateLimitEnabled', 'rateLimitMaxTokens', 'rateLimitRefillMs',
    'rateLimitWarnCooldown', 'rateLimitWarnMessage',
    'helpLanguage', 'aiErrorMessage', 'replyMode', 'imageEnabled', 'fileEnabled',
    'imageGenEnabled', 'imageGenProvider', 'imageGenApiKeyOpenai', 'imageGenApiKeyStability',
    'notificationsEnabled', 'locationEnabled', 'cameraEnabled', 'preferredMicId', 'preferredCameraId',
];

// ============================
// Per-profile store — everything that used to be a module-level singleton
// here now lives inside one instance of this factory, keyed off an
// absolute `profileDir` (NeRoBoT_db/profiles/<id>/) so two profiles never
// share so much as a file path, let alone in-memory state. `fs.mkdirSync`
// is idempotent (recursive + exist-ok) so callers don't need to pre-create
// the directory.
// ============================
export function createProfileStore(profileDir) {
    fs.mkdirSync(profileDir, { recursive: true });

    const PATHS = {
        whitelist:     path.join(profileDir, 'whitelist.json'),
        blacklist:     path.join(profileDir, 'blacklist.json'),
        admins:        path.join(profileDir, 'admin.json'),
        noPrefixChats: path.join(profileDir, 'noprefix.json'),
        groupChats:    path.join(profileDir, 'groupchat.json'),
        settings:      path.join(profileDir, 'settings.json'),
        chatModels:    path.join(profileDir, 'chatmodels.json'),
        chatPrefixes:  path.join(profileDir, 'chatprefixes.json'),
    };

    // ============================
    // State — loaded from settings.json, falls back to DEFAULTS.
    // Non-persistent runtime fields (activeChatId, debugChatId) are
    // intentionally excluded from the saved snapshot.
    // ============================
    const savedSettings = loadJson(PATHS.settings, {});
    const state = Object.assign({}, DEFAULTS, savedSettings);

    function saveSettings() {
        const snapshot = {};
        for (const key of PERSISTENT_KEYS) snapshot[key] = state[key];
        saveJson(PATHS.settings, snapshot);
    }

    // Resets every persistent setting back to its DEFAULTS value (in place,
    // so other modules' references to `state` stay valid) and saves.
    // Runtime-only fields (activeChatId, debugChatId, fixedMode) are also
    // reset here since "reset all" should fully restore a fresh-install state.
    function resetStateToDefaults() {
        for (const key of Object.keys(DEFAULTS)) {
            state[key] = DEFAULTS[key];
        }
        saveSettings();
    }

    // Whitelist
    const whitelist = new Set(loadJson(PATHS.whitelist, []));
    function saveWhitelist() { saveJson(PATHS.whitelist, [...whitelist]); }

    // Blacklist — chats in this set are fully ignored (messages and debug
    // commands alike), regardless of whitelist/prefix/no-prefix state.
    const blacklist = new Set(loadJson(PATHS.blacklist, []));
    function saveBlacklist() { saveJson(PATHS.blacklist, [...blacklist]); }

    // Admin list
    const admins = new Set(loadJson(PATHS.admins, []));
    function saveAdmins() { saveJson(PATHS.admins, [...admins]); }

    // No-prefix chats
    const noPrefixChats = new Set(loadJson(PATHS.noPrefixChats, []));
    function saveNoPrefixChats() { saveJson(PATHS.noPrefixChats, [...noPrefixChats]); }

    // Group chats — "shared memory" mode. Groups in this set route every
    // member's AI message into ONE shared chatHistories entry (keyed by
    // the group ID) instead of one per sender.
    const groupChats = new Set(loadJson(PATHS.groupChats, []));
    function saveGroupChats() { saveJson(PATHS.groupChats, [...groupChats]); }

    // Chat-specific model overrides. chatModels[chatId] = "model-name".
    // Chats without an entry here fall back to state.aiModel.
    const chatModels = loadJson(PATHS.chatModels, {});
    function saveChatModels() { saveJson(PATHS.chatModels, chatModels); }

    // Chat-specific AI-prefix overrides. chatPrefixes[chatId] = "p".
    // Chats without an entry here fall back to state.prefix. Only the
    // AI-trigger prefix is overridable per chat — debug/ignore prefixes
    // stay global (per-profile).
    const chatPrefixes = loadJson(PATHS.chatPrefixes, {});
    function saveChatPrefixes() { saveJson(PATHS.chatPrefixes, chatPrefixes); }

    // Chat histories (runtime only — intentionally not persisted).
    const chatHistories = {};

    return {
        state, PERSISTENT_KEYS, saveSettings, resetStateToDefaults,
        whitelist, saveWhitelist,
        blacklist, saveBlacklist,
        admins, saveAdmins,
        noPrefixChats, saveNoPrefixChats,
        groupChats, saveGroupChats,
        chatModels, saveChatModels,
        chatPrefixes, saveChatPrefixes,
        chatHistories,
    };
}
