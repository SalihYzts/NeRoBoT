// Preload for the app UI (top bar + tab strip + Home screen + log drawer +
// settings drawer). Sandboxed, so CommonJS.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nerobot', {
    init: (profileId) => ipcRenderer.invoke('ui:init', profileId),
    getSplashAscii: () => ipcRenderer.invoke('ui:splashAscii'),
    notifySplashDone: () => ipcRenderer.send('ui:splashDone'),
    retryBotNow: (profileId) => ipcRenderer.send('bot:manualRetry', profileId),
    toggleLogs: (open) => ipcRenderer.send('logs:toggle', open),
    // Tells main to hide the active profile/NeRoChAt native view while an
    // in-app modal (confirm/alert/profile settings/new profile) is open —
    // that view stacks above this page's own DOM, so a modal here would
    // otherwise render underneath it and never be seen. Invoke (not send):
    // opening resolves with a data-URL screenshot of the window taken right
    // before that view collapses, so the modal can show it blurred behind
    // itself instead of just going black — see main.js's 'modal:toggle'.
    setModalOpen: (open) => ipcRenderer.invoke('modal:toggle', open),

    // Profiles (Home screen + tab strip)
    listProfiles: () => ipcRenderer.invoke('profiles:list'),
    createProfile: (name, mode) => ipcRenderer.invoke('profiles:create', name, mode),
    renameProfile: (id, name) => ipcRenderer.invoke('profiles:rename', id, name),
    setProfileMode: (id, mode) => ipcRenderer.invoke('profiles:setMode', id, mode),
    deleteProfile: (id) => ipcRenderer.invoke('profiles:delete', id),
    exportProfile: (id) => ipcRenderer.invoke('profiles:export', id),
    importIntoProfile: (id) => ipcRenderer.invoke('profiles:importInto', id),
    openProfile: (id) => ipcRenderer.invoke('profile:open', id),
    closeProfile: (id) => ipcRenderer.invoke('profile:close', id),
    activateProfile: (id) => ipcRenderer.invoke('profile:activate', id),

    // Telegram — app-wide api_id/api_hash (one-time, from my.telegram.org)
    // + per-profile QR login. Every open profile's status (including QR/
    // password-prompt) still flows through the shared onStatus() below.
    getTelegramAppCredentials: () => ipcRenderer.invoke('telegram:getAppCredentials'),
    setTelegramAppCredentials: (apiId, apiHash) => ipcRenderer.invoke('telegram:setAppCredentials', apiId, apiHash),
    createTelegramProfile: (name, mode) => ipcRenderer.invoke('telegram:createProfile', name, mode),
    submitTelegramPassword: (profileId, password) => ipcRenderer.send('telegram:submitPassword', profileId, password),

    // App-wide config (today just the NeRoChAt quick-popup shortcut)
    getAppConfig: () => ipcRenderer.invoke('app:getConfig'),
    setAppConfig: (updates) => ipcRenderer.invoke('app:setConfig', updates),
    // Fired by main.js whenever the configured shortcut is pressed while a
    // WA/Telegram/Ollama embedded view has keyboard focus (those views can't
    // be reached by this page's own 'keydown' listener — see main.js's
    // wireNeroShortcut). index.html's script calls openNeroPopup() from this.
    onOpenNeroPopup: (cb) => ipcRenderer.on('nero:openPopup', () => cb()),

    // Global settings (Genel tab) — scoped to the given profile
    getSettings: (profileId) => ipcRenderer.invoke('settings:get', profileId),
    saveSettings: (profileId, updates) => ipcRenderer.invoke('settings:save', profileId, updates),
    resetSettings: (profileId) => ipcRenderer.invoke('settings:reset', profileId),
    factoryResetSettings: (profileId) => ipcRenderer.invoke('settings:factoryReset', profileId),

    // Per-chat settings (Sohbet tab) — scoped to the given profile
    listChats: (profileId) => ipcRenderer.invoke('chats:list', profileId),
    // NeRoChAt quick popup's "Bu sohbeti sor" — recent messages of whichever
    // chat is currently open in this WhatsApp profile's pane.
    getChatRecentMessages: (profileId, limit) => ipcRenderer.invoke('chat:recentMessages', profileId, limit),
    getChat: (profileId, chatId) => ipcRenderer.invoke('chat:get', profileId, chatId),
    setChat: (profileId, chatId, updates) => ipcRenderer.invoke('chat:set', profileId, chatId, updates),
    getChatIdVariants: (profileId, chatId) => ipcRenderer.invoke('chat:idVariants', profileId, chatId),
    // The notification panel's inline reply box — sends plain text straight
    // through that profile's bot (session.utils.sendText), same as a !
    // command or AI reply would, just triggered by hand.
    sendChatMessage: (profileId, chatId, text) => ipcRenderer.invoke('chat:send', profileId, chatId, text),

    // Notification panel — every open profile's incoming messages, newest
    // last (see main.js's pushNotification/notifications).
    listNotifications: () => ipcRenderer.invoke('notif:list'),
    markNotificationsRead: (ids) => ipcRenderer.invoke('notif:markRead', ids),
    markProfileNotificationsRead: (profileId) => ipcRenderer.invoke('notif:markProfileRead', profileId),
    onNewNotification: (cb) => ipcRenderer.on('notif:new', (_e, entry) => cb(entry)),

    // ID lists (Listeler tab) — scoped to the given profile
    getList: (profileId, name) => ipcRenderer.invoke('lists:get', profileId, name),
    addToList: (profileId, name, id, force) => ipcRenderer.invoke('lists:add', profileId, name, id, force),
    removeFromList: (profileId, name, id) => ipcRenderer.invoke('lists:remove', profileId, name, id),
    clearList: (profileId, name) => ipcRenderer.invoke('lists:clear', profileId, name),

    // AI service (Hizmetler tab) — scoped to the given profile
    clearAllAiMemory: (profileId) => ipcRenderer.invoke('ai:clearAllMemory', profileId),

    // WhatsApp info tab
    getAppVersion: () => ipcRenderer.invoke('app:version'),
    getHelpText: (lang) => ipcRenderer.invoke('app:helpText', lang),

    // Mic/camera device list (Ayarlar → Genel → İzinler) — only has real
    // labels once WhatsApp's media permission has been granted.
    listWaMediaDevices: (profileId) => ipcRenderer.invoke('wa:listMediaDevices', profileId),

    // Ollama — install gate (Home tile + AI Bot toggle) and the small
    // built-in chat window
    checkOllamaInstalled: () => ipcRenderer.invoke('ollama:checkInstalled'),
    installOllama: () => ipcRenderer.invoke('ollama:install'),
    getOllamaStatus: () => ipcRenderer.invoke('ollama:getStatus'),
    setOllamaShortcutCreated: (created) => ipcRenderer.invoke('ollama:setShortcutCreated', created),
    setOllamaPersonality: (personality) => ipcRenderer.invoke('ollama:setPersonality', personality),
    setOllamaConversationPersonality: (id, personality) => ipcRenderer.invoke('ollama:setConversationPersonality', id, personality),
    setOllamaImageGenEnabled: (enabled) => ipcRenderer.invoke('ollama:setImageGenEnabled', enabled),
    setOllamaImageGenProvider: (provider) => ipcRenderer.invoke('ollama:setImageGenProvider', provider),
    setOllamaImageGenApiKey: (provider, apiKey) => ipcRenderer.invoke('ollama:setImageGenApiKey', provider, apiKey),
    classifyOllamaImageIntent: (prompt, model, hasImage) => ipcRenderer.invoke('ollama:classifyImageIntent', { prompt, model, hasImage }),
    describeOllamaImageForGeneration: (model, imageBase64, extraInstruction) => ipcRenderer.invoke('ollama:describeImageForGeneration', { model, imageBase64, extraInstruction }),
    prepareImageForChat: (model, imageBase64) => ipcRenderer.invoke('ollama:prepareImageForChat', { model, imageBase64 }),
    generateOllamaImage: (prompt) => ipcRenderer.invoke('ollama:generateImage', prompt),
    saveOllamaImage: (base64, mimetype) => ipcRenderer.invoke('ollama:saveImage', { base64, mimetype }),
    getOllamaImageAckNote: () => ipcRenderer.invoke('ollama:getImageAckNote'),
    // The Ollama chat is an embedded tab, not a separate window. activate/
    // deactivate just show/hide it (same as switching WA profile tabs);
    // closeOllamaTab actually tears the view down, like closing a WA tab.
    activateOllamaTab: () => ipcRenderer.invoke('ollama:activateTab'),
    deactivateOllamaTab: () => ipcRenderer.send('ollama:deactivateTab'),
    closeOllamaTab: () => ipcRenderer.send('ollama:closeTab'),
    listOllamaModels: () => ipcRenderer.invoke('ollama:listModels'),
    pullOllamaModel: (model) => ipcRenderer.invoke('ollama:pullModel', model),
    deleteOllamaModel: (model) => ipcRenderer.invoke('ollama:deleteModel', model),
    pickOllamaFile: () => ipcRenderer.invoke('ollama:pickFile'),
    sendOllamaChat: (model, messages) => ipcRenderer.invoke('ollama:chatSend', { model, messages }),
    listOllamaConversations: () => ipcRenderer.invoke('ollama:listConversations'),
    getOllamaConversation: (id) => ipcRenderer.invoke('ollama:getConversation', id),
    saveOllamaConversation: (id, messages, title) => ipcRenderer.invoke('ollama:saveConversation', id, messages, title),
    deleteOllamaConversation: (id) => ipcRenderer.invoke('ollama:deleteConversation', id),
    onOllamaInstallProgress: (cb) => ipcRenderer.on('ollama:installProgress', (_e, progress) => cb(progress)),
    // Returns an unsubscribe function — unlike the other on* listeners here,
    // this one is (re)registered per chat message, so the caller needs a way
    // to remove its own listener before the next message instead of stacking.
    onOllamaChatChunk: (cb) => {
        const listener = (_e, chunk) => cb(chunk);
        ipcRenderer.on('ollama:chatChunk', listener);
        return () => ipcRenderer.removeListener('ollama:chatChunk', listener);
    },
    onOllamaPullProgress: (cb) => {
        const listener = (_e, progress) => cb(progress);
        ipcRenderer.on('ollama:pullProgress', listener);
        return () => ipcRenderer.removeListener('ollama:pullProgress', listener);
    },
    // Told to the NeRoChAt chat window whenever a model finishes pulling
    // (from anywhere — usually Ayarlar → NeRoChAt now) so its model
    // dropdown can pick up the new model without needing to reopen the tab.
    onOllamaModelsChanged: (cb) => ipcRenderer.on('ollama:modelsChanged', () => cb()),

    onLog: (cb) => ipcRenderer.on('log', (_e, entry) => cb(entry)),
    // status events carry { profileId, key, text, extra } now — one stream
    // shared by every open profile's tab dot + (when active) the topbar.
    onStatus: (cb) => ipcRenderer.on('status', (_e, status) => cb(status)),
});
