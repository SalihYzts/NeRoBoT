import fs from 'fs';

// ============================
// File paths
// ============================
const PATHS = {
    whitelist:   './NeRoBoT_db/whitelist.json',
    admins:      './NeRoBoT_db/admin.json',
    noPrefixChats: './NeRoBoT_db/noprefix.json',
    groupChats:  './NeRoBoT_db/groupchat.json',
    settings:    './NeRoBoT_db/settings.json',
    chatModels:  './NeRoBoT_db/chatmodels.json',
};

// ============================
// Default state (used when settings.json doesn't exist yet)
// ============================
const DEFAULTS = {
    // Behaviour
    fixedMode:             false,
    activeChatId:          null,
    debugChatId:           null,
    whitelistMode:         false,
    aiChatEnabled:         true,

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
};

// ============================
// Helpers: generic JSON file load/save
// ============================
function loadJson(path, fallback) {
    if (!fs.existsSync(path)) {
        fs.writeFileSync(path, JSON.stringify(fallback, null, 2));
        return fallback;
    }
    try {
        return JSON.parse(fs.readFileSync(path, 'utf8'));
    } catch {
        return fallback;
    }
}

function saveJson(path, data) {
    fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// ============================
// State — loaded from settings.json, falls back to DEFAULTS
// Non-persistent runtime fields (activeChatId, debugChatId) are
// intentionally excluded from the saved snapshot.
// ============================
const PERSISTENT_KEYS = [
    'prefix', 'debugPrefix', 'ignorePrefix', 'whitelistMode', 'aiChatEnabled',
    'noPrefixAll',
    'aiModel', 'systemPrompt',
    'thinkEnabled', 'thinkMessage',
    'rateLimitEnabled', 'rateLimitMaxTokens', 'rateLimitRefillMs',
    'rateLimitWarnCooldown', 'rateLimitWarnMessage',
    'helpLanguage', 'aiErrorMessage', 'replyMode', 'imageEnabled', 'fileEnabled',
];

const savedSettings = loadJson(PATHS.settings, {});

export const state = Object.assign({}, DEFAULTS, savedSettings);

export function saveSettings() {
    const snapshot = {};
    for (const key of PERSISTENT_KEYS) snapshot[key] = state[key];
    saveJson(PATHS.settings, snapshot);
}

// Resets every persistent setting back to its DEFAULTS value (in place,
// so other modules' references to `state` stay valid) and saves.
// Runtime-only fields (activeChatId, debugChatId, fixedMode) are also
// reset here since "reset all" should fully restore a fresh-install state.
export function resetStateToDefaults() {
    for (const key of Object.keys(DEFAULTS)) {
        state[key] = DEFAULTS[key];
    }
    saveSettings();
}

// ============================
// Whitelist
// ============================
export const whitelist = new Set(loadJson(PATHS.whitelist, []));

export function saveWhitelist() {
    saveJson(PATHS.whitelist, [...whitelist]);
}

// ============================
// Admin list
// ============================
export const admins = new Set(loadJson(PATHS.admins, []));

export function saveAdmins() {
    saveJson(PATHS.admins, [...admins]);
}

// ============================
// No-prefix chats (now persisted)
// ============================
export const noPrefixChats = new Set(loadJson(PATHS.noPrefixChats, []));

export function saveNoPrefixChats() {
    saveJson(PATHS.noPrefixChats, [...noPrefixChats]);
}

// ============================
// Group chats — "shared memory" mode.
// Groups in this set route every member's AI message into ONE shared
// chatHistories entry (keyed by the group ID) instead of one per sender.
// ============================
export const groupChats = new Set(loadJson(PATHS.groupChats, []));

export function saveGroupChats() {
    saveJson(PATHS.groupChats, [...groupChats]);
}

// ============================
// Chat-specific model overrides
// chatModels[chatId] = "model-name"
// Chats without an entry here fall back to state.aiModel (the global/main model).
// Persisted separately from settings.json — kept independent of !clear,
// since clearing a chat's memory shouldn't also reset its model choice.
// ============================
export const chatModels = loadJson(PATHS.chatModels, {});

export function saveChatModels() {
    saveJson(PATHS.chatModels, chatModels);
}

// ============================
// Chat histories (runtime only — intentionally not persisted)
// ============================
export const chatHistories = {};

// ============================
// Puppeteer path
// ============================
export const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";