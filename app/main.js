// NeRoBoT desktop app — a Home/profile-picker screen plus browser-style tabs,
// each tab embedding a real WhatsApp Web view (driven by whatsapp-web.js) for
// one "profile" (WhatsApp account). Multiple profiles can be open and running
// their own bot at the same time; each has fully isolated settings/lists/AI
// memory (see project_scripts/config.js's createProfileStore).
//
// How the embedding works (per profile):
//   1. Electron is started with ONE remote-debugging port, shared by every
//      profile's WebContentsView — every one of them, in every open tab,
//      shows up as a distinct page/target over that single CDP connection.
//   2. whatsapp-web.js supports connecting to an existing browser via
//      `puppeteer.browserURL` instead of launching Chrome itself.
//   3. Its connect path then calls `browser.newPage()`, which Electron can't
//      do — so we patch puppeteer.connect (once, globally) to hand back the
//      page that belongs to the CORRECT profile's WebContentsView, found via
//      a per-profile `window.__NEROBOT_WA_<id>__` marker. The profile id
//      rides along on the puppeteer options object (see project_scripts/bot.js)
//      so the shared patched connect() knows which profile is asking.
// Result: each open tab's bot drives its own WhatsApp Web view, independently.
import { app, BrowserWindow, WebContentsView, ipcMain, shell, dialog, session as electronSession, desktopCapturer } from 'electron';
import path from 'node:path';
import util from 'node:util';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
    loadProfiles, createProfile, renameProfile, deleteProfile,
    exportProfile, overwriteProfile, getProfileDir, setProfileMode,
    createTelegramProfile, TELEGRAM_SESSION_FILE,
} from '../project_scripts/profiles.js';
import { isOllamaInstalled, installOllama, openOllamaApp } from '../project_scripts/ollama-installer.js';
import { isImageExt, extractFileText } from '../project_scripts/file-extract.js';
import { generateImage } from '../project_scripts/imagegen.js';
import {
    IMAGE_CLASSIFY_PROMPT, IMAGE_ACK_NOTE, IMAGE_DESCRIBE_FOR_GEN_PROMPT, IMAGE_READ_FALLBACK_PROMPT,
    pickClassifierModel, modelHasVision, pickVisionFallbackModel, resolveVisionModel,
} from '../project_scripts/ai.js';
import { createTelegramBot } from '../project_scripts/telegram-bot.js';
import { getEmbeddedTelegramCredentials } from '../project_scripts/telegram-default-app.js';
import ollamaClient from 'ollama';
import QRCode from 'qrcode';
// electron-updater is CommonJS — its named exports aren't statically
// analyzable from an ESM import, hence the default-import + destructure
// (Node's own suggestion for this exact error).
import electronUpdaterPkg from 'electron-updater';
const { autoUpdater } = electronUpdaterPkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// PROJECT_ROOT is the app's OWN install location (where package.json/
// help.txt actually ship — see APP_VERSION/app:helpText below and the
// process.chdir() a bit further down, both of which need to keep pointing
// there). User data goes somewhere else entirely — see DB_DIR.
const PROJECT_ROOT = path.join(__dirname, '..');
// Every profile's data (sessions, settings, chat lists, Ollama
// conversations, app config — everything under NeRoBoT_db/) used to live
// next to the app itself (PROJECT_ROOT). For a packaged build that's
// wherever the installer put it (Program Files, needing admin rights to
// write on some setups) and disappears the moment you uninstall or move
// the app — not where a user expects their own data to live, and not
// something an uninstall should be able to take with it. Documents is a
// real, writable-by-default, survives-a-reinstall location instead.
const DATA_ROOT = path.join(app.getPath('documents'), 'NeRoBoT');
const DB_DIR = path.join(DATA_ROOT, 'NeRoBoT_db');

// One-time migration for anyone who already has data at the old location —
// only runs if the new location doesn't exist yet AND the old one does, so
// it's safe to check on every startup and never overwrites/merges anything.
// fs.renameSync is instant but fails across drives (EXDEV) — e.g. the app
// installed on C: with Documents redirected to D: — so that falls back to
// a real copy + delete.
{
    const legacyDbDir = path.join(PROJECT_ROOT, 'NeRoBoT_db');
    if (!fs.existsSync(DB_DIR) && fs.existsSync(legacyDbDir)) {
        try {
            fs.mkdirSync(DATA_ROOT, { recursive: true });
            try {
                fs.renameSync(legacyDbDir, DB_DIR);
            } catch (_) {
                fs.cpSync(legacyDbDir, DB_DIR, { recursive: true });
                fs.rmSync(legacyDbDir, { recursive: true, force: true });
            }
            console.log(`[NeRoBoT] Veri klasörü taşındı: ${legacyDbDir} → ${DB_DIR}`);
        } catch (err) {
            console.error('[NeRoBoT] Eski veri klasörü Belgeler\'e taşınamadı:', err.message || err);
        }
    }
}

const OLLAMA_STATUS_FILE = path.join(DB_DIR, 'ollama.json');
// The mini Ollama chat window's saved conversations — independent of any
// WhatsApp profile (it's a standalone Home-screen shortcut, see the
// Ollama-tile design note in project_scripts/ollama-installer.js).
const OLLAMA_CHATS_FILE = path.join(DB_DIR, 'ollama-chats.json');
// api_id/api_hash for Telegram's MTProto login (my.telegram.org) — ONE pair
// identifies this whole app to Telegram, not each profile; every Telegram
// profile then logs in as its own real account via QR code through it, the
// same way every WhatsApp profile here is its own independent WhatsApp Web
// session. See project_scripts/telegram-bot.js and the telegram:* IPC below.
const TELEGRAM_APP_FILE = path.join(DB_DIR, 'telegram-app.json');

// A per-install override (NeRoBoT_db/ is gitignored, never shipped/committed)
// always wins if present; otherwise falls back to the identity baked into
// the app itself (see telegram-default-app.js) so a fresh download works
// with zero setup, same as WhatsApp. Both are the same shape, so callers
// never need to know which one they got.
function readTelegramAppConfig() {
    try {
        const saved = JSON.parse(fs.readFileSync(TELEGRAM_APP_FILE, 'utf8'));
        if (saved.apiId && saved.apiHash) return saved;
    } catch (_) {}
    return getEmbeddedTelegramCredentials();
}

function writeTelegramAppConfig(config) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(TELEGRAM_APP_FILE, JSON.stringify(config, null, 2));
}

// App-wide, non-Telegram config — today just the NeRoChAt quick-popup
// shortcut (see index.html's Uygulama section / global keydown listener).
// Same read/write shape as the Telegram app config above, own file since
// it's a genuinely separate concern.
const APP_CONFIG_FILE = path.join(DB_DIR, 'app-config.json');
const DEFAULT_APP_CONFIG = { neroPopupShortcut: 'Ctrl+Shift+K', fixTextShortcut: 'Ctrl+Shift+J', fixTextAutoMode: false, fixTextUseLocalModel: true };

function readAppConfig() {
    try {
        return { ...DEFAULT_APP_CONFIG, ...JSON.parse(fs.readFileSync(APP_CONFIG_FILE, 'utf8')) };
    } catch (_) {
        return { ...DEFAULT_APP_CONFIG };
    }
}

function writeAppConfig(config) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(APP_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// The NeRoChAt popup shortcut also has to work while a WA/Telegram/Ollama
// WebContentsView has keyboard focus — which is basically always, since
// those views cover the whole content area. index.html's own 'keydown'
// listener only ever sees keys typed while ITS document has focus (e.g. no
// profile open, or a modal up), so every embedded view wires this same
// check into its webContents' 'before-input-event' (see setupWaView/
// setupTelegramView/setupOllamaView below) and pings the host window over
// 'nero:openPopup' instead of trying to open anything itself.
function matchesNeroShortcut(input) {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return false;
    const combo = readAppConfig().neroPopupShortcut;
    if (!combo) return false;
    const parts = combo.split('+');
    const wantKey = parts[parts.length - 1];
    if (!!input.control !== parts.includes('Ctrl')) return false;
    if (!!input.alt !== parts.includes('Alt')) return false;
    if (!!input.shift !== parts.includes('Shift')) return false;
    return String(input.key).toUpperCase() === wantKey.toUpperCase();
}

// Same shape as matchesNeroShortcut above, just its own configurable combo
// (see handleFixTextShortcut below) — the "fix this draft" shortcut, only
// meaningful while a WhatsApp view has focus (see wireGlobalShortcuts).
function matchesFixTextShortcut(input) {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return false;
    const combo = readAppConfig().fixTextShortcut;
    if (!combo) return false;
    const parts = combo.split('+');
    const wantKey = parts[parts.length - 1];
    if (!!input.control !== parts.includes('Ctrl')) return false;
    if (!!input.alt !== parts.includes('Alt')) return false;
    if (!!input.shift !== parts.includes('Shift')) return false;
    return String(input.key).toUpperCase() === wantKey.toUpperCase();
}

// Ctrl+Tab / Ctrl+Shift+Tab tab switcher — same "has to work no matter which
// embedded view has keyboard focus" story as the NeRoChAt shortcut above.
// Fixed combo (not user-configurable like neroPopupShortcut), so no config
// read needed: just Tab, held with Ctrl, not an OS key-repeat.
function matchesTabSwitchStep(input) {
    return input.type === 'keyDown' && !input.isAutoRepeat && input.control && String(input.key).toUpperCase() === 'TAB';
}
// The switcher commits on Ctrl's own release, wherever that happens — not
// gated on any particular key combo, since by then Tab has already been
// let go too.
function isControlKeyUp(input) {
    return input.type === 'keyUp' && input.key === 'Control';
}
function matchesEscapeKeyDown(input) {
    return input.type === 'keyDown' && !input.isAutoRepeat && input.key === 'Escape';
}

// ============================
// Cross-profile notification feed — every WA/Telegram profile's incoming
// messages (bot/both mode only — see createBot's/createTelegramBot's
// automationEnabled doc; a plain 'web'-mode manual tab has no message
// listener to hook into at all), newest last, capped so a busy profile left
// unread for a while can't grow this forever. In-memory only — deliberately
// not persisted, this is a "what came in while you weren't looking" glance,
// not a message archive (chat history itself already lives in WhatsApp/
// Telegram's own storage).
// ============================
const MAX_NOTIFICATIONS = 200;
let notifications = [];

function pushNotification(session, { chatId, chatName, senderName, body, t, avatarUrl }) {
    if (!chatId) return;
    // The user's already looking at this exact profile's view live (its
    // WhatsApp/Telegram pane is on screen right now) — no point flagging a
    // message they can already see arrive in front of them. Doesn't apply
    // once they switch away (activeProfileId no longer matches), even if
    // this same session is still running in the background.
    if (session.id === activeProfileId) return;
    const entry = {
        id: `${session.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        profileId: session.id,
        profileName: session.name,
        platform: session.platform,
        chatId,
        chatName: chatName || chatId,
        senderName: senderName || chatName || chatId,
        body: body || '',
        t: t || Date.now(),
        // The contact's (or group's) profile picture — a real https URL for
        // WhatsApp, a data: URI for Telegram (see bot.js's/telegram-bot.js's
        // own avatar cache); null while not yet fetched/unavailable, in
        // which case the panel falls back to a plain initial-letter circle.
        avatarUrl: avatarUrl || null,
    };
    notifications.push(entry);
    if (notifications.length > MAX_NOTIFICATIONS) notifications.shift();
    if (win && !win.isDestroyed()) win.webContents.send('notif:new', entry);
}

// Hooks one embedded view's 'before-input-event' for every global shortcut
// that has to work regardless of which view currently has keyboard focus
// (basically always, once a profile's open — see matchesNeroShortcut's own
// doc). Renamed from wireNeroShortcut now that it covers the Ctrl+Tab
// switcher too; still called from the same three setup sites
// (setupWaView/setupTelegramView/setupOllamaView).
// `session` is only passed for WA/Telegram views (needed by
// handleFixTextShortcut, which reads/writes that profile's own embedded
// page) — the Ollama view passes none, since there's no compose box or bot
// there for that shortcut to act on.
function wireGlobalShortcuts(webContents, session) {
    webContents.on('before-input-event', (event, input) => {
        if (matchesNeroShortcut(input)) {
            event.preventDefault();
            if (win && !win.isDestroyed()) win.webContents.send('nero:openPopup');
        } else if (matchesTabSwitchStep(input)) {
            event.preventDefault();
            if (win && !win.isDestroyed()) win.webContents.send('tabSwitcher:step', input.shift ? -1 : 1);
        } else if (isControlKeyUp(input)) {
            if (win && !win.isDestroyed()) win.webContents.send('tabSwitcher:commit');
        } else if (matchesEscapeKeyDown(input)) {
            if (win && !win.isDestroyed()) win.webContents.send('tabSwitcher:cancel');
        } else if (session && matchesFixTextShortcut(input)) {
            event.preventDefault();
            handleFixTextShortcut(session).catch(err => console.error('[fixText]', err.message || err));
        }
    });
}

// Read once at startup for the renderer's WhatsApp-info tab — same file
// commands.js's getVersion() reads at runtime, just cached here since this
// value never changes for the life of the process.
let APP_VERSION = 'unknown';
try {
    APP_VERSION = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).version || 'unknown';
} catch (_) {}

// Bot code (commands.js's getVersion/Help) still reads package.json/help.txt
// with cwd-relative paths, so anchor the cwd to the project root no matter
// where the app was launched from (shortcut, bat…). Per-profile data itself
// no longer depends on this — config.js takes an absolute profile directory.
process.chdir(PROJECT_ROOT);

const require = createRequire(import.meta.url);
// Same hoisted instance whatsapp-web.js resolves — patching connect() here
// is what lets us inject the right embedded page into each profile's
// initialize() flow.
const puppeteer = require('puppeteer');

// NEROBOT_HIDE=1 → automated test mode: invisible window and a throwaway
// profile so a running production instance is untouched.
const TEST_MODE = process.env.NEROBOT_HIDE === '1';

// Port 0 → Chromium picks any free OS port instead of a fixed one. A fixed
// port (this used to be 9333) means a single leftover/stuck socket from a
// crash or a forceful kill can permanently block every future launch from
// getting its own DevTools server — a fresh OS-assigned port each run avoids
// that whole failure class. The actual port ends up in a file (see
// getDevToolsPort() below) since we don't know it ahead of time. One port
// serves every profile — Electron exposes every WebContentsView's page over
// the same CDP connection regardless of which profile it belongs to.
app.commandLine.appendSwitch('remote-debugging-port', '0');

if (TEST_MODE) {
    app.setPath('userData', path.join(app.getPath('temp'), 'nerobot-test-profile'));
} else {
    // Single instance — a second launch would fight over the CDP port and
    // its bots couldn't attach. Focus the existing window instead.
    if (!app.requestSingleInstanceLock()) {
        app.quit();
        process.exit(0);
    }
    app.on('second-instance', () => {
        if (win) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
        }
    });
}

// One consistent, modern Chrome UA used everywhere (Electron session AND the
// page UA whatsapp-web.js sets). If these disagree — or look like an old
// browser, as whatsapp-web.js's 2022-era default UA does — WhatsApp refuses
// to restore the saved session and asks for a fresh QR scan on every start.
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

const TOPBAR_H = 36;     // must match the top bar height in ui/index.html
const STATUSBAR_H = 26;  // must match the bottom status bar height in ui/index.html
const LOG_H = 240;       // must match the log drawer height in ui/index.html

let win = null;
let logOpen = false;
// True while an in-app modal (confirm/alert/profile settings/new profile)
// is open in the renderer's own DOM — see layoutViews() below and the
// 'modal:toggle' IPC handler.
let modalOpen = false;
// Bumped on every 'modal:toggle' call — lets a slow open() notice a close()
// landed while it was still capturing and bail out instead of clobbering
// the closed state with a stale result (see the handler below).
let modalToggleGen = 0;
let devToolsPort = null;
// The Ollama chat is an embedded tab (like a WA profile), not a separate
// OS window — same WebContentsView pattern as a profile's waView, just
// singleton and independent of any profile. See layoutViews()/setupOllamaView().
let ollamaView = null;
let ollamaActive = false;

// Which profile's WebContentsView is laid out over the content area right
// now. `null` = the Home/selection screen (the renderer's own HTML) shows
// through — every open profile's views get collapsed to 0×0 bounds in that
// case (still mounted, still running, just not on screen — see layoutViews).
let activeProfileId = null;

// One entry per OPEN profile (created on profile:open, destroyed on
// profile:close). Never persisted — every launch starts at the Home screen
// with nothing open, same as the user asked for.
const sessions = new Map(); // profileId → session

function markerName(profileId) {
    return 'NEROBOT_WA_' + String(profileId).replace(/[^a-zA-Z0-9]/g, '_');
}

// Chromium writes the OS-assigned DevTools port (see the port-0 switch
// above) to this file in the profile dir, shortly after startup — poll for
// it since there's a brief window before it's written.
async function getDevToolsPort() {
    const portFile = path.join(app.getPath('userData'), 'DevToolsActivePort');
    for (let attempt = 0; attempt < 100; attempt++) {
        try {
            const port = parseInt(fs.readFileSync(portFile, 'utf8').split('\n')[0], 10);
            if (Number.isFinite(port) && port > 0) return port;
        } catch (_) {
            // Not written yet — keep polling.
        }
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('DevToolsActivePort never appeared — could not determine the DevTools port.');
}

// ============================
// Log capture — mirror console.* into the in-app log panel.
// One shared buffer/stream across every profile (structured entries like
// setStatus/reportError prefix the profile name so lines stay attributable
// even though the panel itself isn't filtered per-tab).
// ============================
const LOG_LIMIT = 500;
const logBuffer = [];

function pushLog(level, text) {
    const entry = { level, text, time: Date.now() };
    logBuffer.push(entry);
    if (logBuffer.length > LOG_LIMIT) logBuffer.shift();
    if (win && !win.isDestroyed()) win.webContents.send('log', entry);
}

for (const level of ['log', 'info', 'warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
        orig(...args);
        pushLog(level, util.format(...args));
    };
}

// Global catch-alls — registered ONCE here rather than per profile (see
// project_scripts/bot.js), so N open profiles never stack N of these.
process.on('unhandledRejection', (reason) => {
    console.error('[NeRoBoT] unhandledRejection:', reason instanceof Error ? (reason.stack || reason.message) : reason);
});
process.on('uncaughtException', (err) => {
    console.error('[NeRoBoT] uncaughtException:', err?.stack || err?.message || err);
});

// `text` is always Turkish and only used for the (Turkish) console/log-panel
// line — the topbar's own status text is translated in the renderer from
// `key` (+ `extra` for the one status that carries a dynamic value).
function setStatus(session, key, text, extra) {
    session.currentStatus = { key, text, extra };
    console.log(`[${session.name}] ${text}`);
    if (win && !win.isDestroyed()) {
        win.webContents.send('status', { profileId: session.id, ...session.currentStatus });
    }
    // The splash is a separate WebContentsView with its own webContents —
    // win.webContents.send() above doesn't reach it, so it needs its own
    // copy to know when to dismiss itself (see splash.html).
    if (session.splashView && !session.splashView.webContents.isDestroyed()) {
        session.splashView.webContents.send('status', session.currentStatus);
    }
    // Every loading phase brings this profile's splash back up — not just
    // the first open: manual/auto retries, reconnects and the post-QR
    // session restore all go through a 'starting'/'auth' status. The splash
    // then dismisses itself when something actionable arrives (qr/ready/error).
    // Telegram profiles have no waView to cover with a splash in the first
    // place (see openTelegramProfile) — the renderer's own placeholder
    // shows this same status directly instead.
    if ((key === 'starting' || key === 'auth') && session.platform !== 'telegram') {
        showSplash(session).catch(err => console.error(`[${session.name}] Splash açılamadı:`, err));
    }
    // Needed for connectionMode 'bot' WhatsApp profiles: layoutViews()'s
    // showWaView depends on session.currentStatus.key (visible only for
    // 'qr', to let a first-time login happen, hidden otherwise) — without
    // this, that toggle wouldn't actually apply until something unrelated
    // happened to trigger a re-layout (a tab switch, opening settings...).
    layoutViews();
}

// ============================
// Window + per-profile views
// ============================
function layoutViews() {
    if (!win) return;
    const { width, height } = win.getContentBounds();
    const activeBounds = {
        x: 0,
        y: TOPBAR_H,
        width,
        height: Math.max(0, height - TOPBAR_H - STATUSBAR_H - (logOpen ? LOG_H : 0)),
    };
    const zero = { x: 0, y: 0, width: 0, height: 0 };
    // Full-size but shifted way outside the window instead of 0×0 — used
    // ONLY for connectionMode 'bot' WhatsApp profiles below. A literal 0×0
    // WebContentsView can stall whatsapp-web.js's own page indefinitely
    // (layout-dependent JS — ResizeObserver/getBoundingClientRect/viewport
    // checks — that a real SPA this heavy almost certainly has somewhere,
    // and which never gets a real size to react to if the view stays 0×0
    // for the page's entire lifetime, not just briefly while backgrounded).
    // Every genuinely-inactive tab still collapses to true 0×0 via `zero`
    // below — that's fine, since it's temporary and the tab gets normal
    // bounds again the moment it's switched back to. This offscreen bounds
    // is for a view that's meant to NEVER become visible while still
    // running, so it can't rely on that eventual real-size moment to
    // recover from any such stall.
    const offscreen = { x: -width - 4000, y: activeBounds.y, width: activeBounds.width, height: activeBounds.height };

    for (const session of sessions.values()) {
        // A modal overlay lives in the renderer's own DOM, which this native
        // child view stacks above — collapse it to 0×0 while any modal is
        // open so the dim backdrop + panel underneath actually show.
        const isActive = session.id === activeProfileId && !ollamaActive && !modalOpen;
        // WhatsApp connectionMode 'bot': the page still has to exist and run
        // (whatsapp-web.js drives the session through it, see bot.js) but
        // the user picked "bot only" specifically to NOT see/use it
        // manually — keep it offscreen (not 0×0, see `offscreen` above)
        // even while this tab is active. Exception: WhatsApp's QR code is
        // rendered BY the page itself (unlike Telegram's, which is a
        // separate image — see openTelegramProfile), so a first-time login
        // still needs it actually on-screen for that one moment, or there'd
        // be no way to ever scan it in 'bot' mode. 'web'/'both' show it
        // normally, always.
        const hideForBotMode = session.mode === 'bot' && session.currentStatus?.key !== 'qr';
        if (session.waView) {
            session.waView.setBounds(!isActive ? zero : hideForBotMode ? offscreen : activeBounds);
        }
        if (session.tgView) session.tgView.setBounds(isActive ? activeBounds : zero);
        // Same bounds as the profile's own view (not the whole window) — the
        // splash used to cover the topbar/tab-strip/statusbar too, which
        // blocked switching tabs or checking logs while it was up for no
        // reason (its content is fully self-contained, doesn't need the
        // extra room, see splash.html).
        if (session.splashView) session.splashView.setBounds(isActive ? activeBounds : zero);
    }
    if (ollamaView) ollamaView.setBounds(ollamaActive && !modalOpen ? activeBounds : zero);
}

// ============================
// Loading splash — a separate view stacked ABOVE a profile's waView (added
// to contentView after it, same bounds — see layoutViews() — so the ASCII
// intro paints over the WhatsApp view without covering the topbar/tab-strip/
// statusbar too). waView is sized normally and immediately in setupWaView()
// — it must be, puppeteer/CDP needs it live right away to find and drive the
// page — so the splash can't be done by hiding or delaying waView; it has to
// sit on its own layer on top instead.
// Shown when a profile is opened AND re-shown on every later loading phase
// (retries, reconnects, post-QR session restore) — see setStatus(). Removed
// once the renderer signals the fade has finished.
// ============================
async function showSplash(session) {
    if (session.splashView || session.splashLoading || !win || win.isDestroyed()) return;
    session.splashLoading = true;
    try {
        session.splashView = new WebContentsView({
            webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
        });
        win.contentView.addChildView(session.splashView);
        layoutViews();
        // The splash page needs to know which profile it belongs to (for
        // init()/retryBotNow()/getSettings() calls) — passed as a query
        // param since it has no other way to learn its own profileId.
        await session.splashView.webContents.loadFile(path.join(__dirname, 'ui', 'splash.html'), {
            search: `profileId=${encodeURIComponent(session.id)}`,
        });
        // Give the freshly loaded splash the current status right away so it
        // can render the progress bar (or dismiss itself) without waiting
        // for the next status change.
        session.splashView.webContents.send('status', session.currentStatus);
    } finally {
        session.splashLoading = false;
    }
    // Hard backstop per showing — the splash dismisses itself on a real
    // status (qr/ready/error); this only catches a missed signal (e.g. a
    // preload error). Comfortably longer than the bot's stuck-watchdog.
    const shownView = session.splashView;
    setTimeout(() => {
        if (session.splashView === shownView) hideSplash(session);
    }, 90_000);
}

function hideSplash(session) {
    if (!session.splashView) return;
    try { win.contentView.removeChildView(session.splashView); } catch (_) {}
    session.splashView = null;
}

// Creates (or recreates) a profile's WhatsApp WebContentsView: sets up its
// session/UA/permissions, adds it to the window, and marks + primes it so
// findWaPage() can match it once puppeteer connects. Used both when a
// profile is first opened and by the stuck-bot recovery path
// (recreateWaView below), which needs a genuinely fresh page —
// whatsapp-web.js's page-bound bindings (exposeFunctionIfAbsent) persist
// across navigations on the same Page object, so reusing one across two
// Client instances would leave the new client's handlers never firing.
// Forces navigator.mediaDevices.getUserMedia() calls inside the WhatsApp
// view onto a specific mic/camera (Ayarlar → Genel → İzinler) — WhatsApp
// Web only offers its own device picker inside an active call, nothing for
// picking a default before that (including for voice-message recording),
// so this fills that gap. Re-injecting is safe/cheap: the wrap only
// happens once per page load (__nerobotPatched guard), later calls just
// update the prefs object the wrapped function reads from.
//
// `ideal`, not `exact`, on purpose: a saved deviceId can go stale (USB
// webcam unplugged, driver update reassigning ids, profile exported/
// imported onto a different machine) — `exact` turns that into a hard
// OverconstrainedError on every getUserMedia() call, which is what was
// surfacing as WhatsApp's generic "kamera bulunamadı" even though a camera
// was actually available, just not under the id we'd pinned. `ideal` uses
// the saved device when it's still there and falls back to the system
// default instead of failing outright when it isn't.
function buildDeviceOverrideScript(micId, camId) {
    const prefs = JSON.stringify({ mic: micId || '', cam: camId || '' });
    return `(() => {
        window.__nerobotDevicePrefs = ${prefs};
        if (!navigator.mediaDevices || navigator.mediaDevices.__nerobotPatched) return true;
        const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = function(constraints) {
            const p = window.__nerobotDevicePrefs || {};
            constraints = constraints ? Object.assign({}, constraints) : {};
            if (p.mic && constraints.audio) {
                constraints.audio = typeof constraints.audio === 'object' ? Object.assign({}, constraints.audio) : {};
                constraints.audio.deviceId = { ideal: p.mic };
            }
            if (p.cam && constraints.video) {
                constraints.video = typeof constraints.video === 'object' ? Object.assign({}, constraints.video) : {};
                constraints.video.deviceId = { ideal: p.cam };
            }
            return orig(constraints);
        };
        navigator.mediaDevices.__nerobotPatched = true;
        return true;
    })();`;
}

async function injectMediaDevicePrefs(session) {
    if (!session.waView || session.waView.webContents.isDestroyed()) return;
    const state = session.store?.state;
    try {
        await session.waView.webContents.executeJavaScript(
            buildDeviceOverrideScript(state?.preferredMicId, state?.preferredCameraId)
        );
    } catch (_) {}
}

// Screen-share source picker (getDisplayMedia during a WhatsApp call) —
// Electron's setDisplayMediaRequestHandler has no built-in picker UI of its
// own; its `useSystemPicker` option only covers macOS 15+ (see the handler
// in setupWaView), so this small modal window IS the picker on Windows.
// Resolves with the chosen desktopCapturer source id, or null if the user
// cancelled/closed it.
function showScreenPicker(sources) {
    return new Promise((resolve) => {
        const picker = new BrowserWindow({
            width: 560,
            height: 420,
            parent: win,
            modal: true,
            resizable: false,
            minimizable: false,
            maximizable: false,
            title: 'Ekranınızı Paylaşın',
            webPreferences: {
                preload: path.join(__dirname, 'preload-screenpicker.cjs'),
            },
        });

        let settled = false;
        const finish = (id) => {
            if (settled) return;
            settled = true;
            ipcMain.removeListener('screenpicker:choice', onChoice);
            if (!picker.isDestroyed()) picker.close();
            resolve(id || null);
        };
        function onChoice(e, sourceId) {
            if (e.sender !== picker.webContents) return;
            finish(sourceId);
        }
        ipcMain.on('screenpicker:choice', onChoice);
        picker.on('closed', () => finish(null));

        picker.loadFile(path.join(__dirname, 'ui', 'screenpicker.html')).then(() => {
            if (picker.isDestroyed()) return;
            const payload = sources.map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
            picker.webContents.send('screenpicker:sources', payload);
        });
    });
}

async function setupWaView(session) {
    session.waView = new WebContentsView({
        webPreferences: {
            partition: session.partition,
            // Background (non-focused) profile tabs must keep running their
            // bot at full speed — default Chromium throttling of hidden/
            // zero-bounds views would stall their message processing.
            backgroundThrottling: false,
        },
    });

    // Electron's default UA contains "Electron/x.y" — present a plain Chrome
    // UA so WhatsApp Web doesn't treat us as an unsupported browser.
    session.waView.webContents.session.setUserAgent(CHROME_UA);

    // WhatsApp needs mic access for voice messages/calls — always granted,
    // unconditionally: this embedded view has no browser chrome at all (no
    // address bar, no padlock icon), so denying it points WhatsApp's own
    // in-page prompt ("click the icon next to the address bar") at UI that
    // doesn't exist here, a permanent dead end. Notifications/location/
    // camera are genuinely optional and per-profile toggleable (Ayarlar →
    // Genel → İzinler) — session.store doesn't exist yet at setup time (the
    // bot factory runs after this), so these read it lazily inside the
    // callback, which only fires once WhatsApp actually asks (well after
    // the bot is up) — defaulting true covers the gap. Everything else
    // (midiSysex, pointerLock, etc.) stays denied.
    //
    // Camera gets its own toggle instead of riding along with mic under the
    // single 'media' permission Electron reports both under — `details.
    // mediaTypes` (only populated for 'media') says which of audio/video was
    // actually requested, so a request that's audio-only (voice messages,
    // audio-only calls) is unaffected by cameraEnabled; only a request that
    // includes video gets denied when it's off. A combined audio+video
    // request (a video call) with the camera toggle off denies the WHOLE
    // request, same as a real browser blocking camera mid-video-call would
    // — there's no partial grant at this API level.
    function isPermissionAllowed(permission, details) {
        const state = session.store?.state;
        if (permission === 'media') {
            if (details?.mediaTypes?.includes('video')) return state?.cameraEnabled ?? true;
            return true;
        }
        if (permission === 'notifications') return state?.notificationsEnabled ?? true;
        if (permission === 'geolocation') return state?.locationEnabled ?? true;
        return false;
    }
    session.waView.webContents.session.setPermissionRequestHandler((_wc, permission, callback, details) => {
        callback(isPermissionAllowed(permission, details));
    });
    session.waView.webContents.session.setPermissionCheckHandler((_wc, permission, _origin, details) => isPermissionAllowed(permission, details));

    // Screen sharing during a call (getDisplayMedia) — Electron has no
    // built-in picker of its own the way a real browser does, so without
    // this the request just silently failed ("izin gerekli" with nothing
    // to actually grant it through). useSystemPicker only covers macOS 15+
    // (Electron's own docs), so on Windows this handler always runs —
    // showScreenPicker (see above) is the actual "which screen/window" UI.
    session.waView.webContents.session.setDisplayMediaRequestHandler(async (_request, callback) => {
        try {
            const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 300, height: 200 } });
            if (!sources.length) return callback({});
            const chosenId = await showScreenPicker(sources);
            const chosen = chosenId ? sources.find(s => s.id === chosenId) : null;
            callback(chosen ? { video: chosen, audio: 'loopback' } : {});
        } catch (_) {
            callback({});
        }
    }, { useSystemPicker: true });

    // Re-applies the preferred mic/camera (see buildDeviceOverrideScript)
    // on every navigation — WhatsApp Web reloading the page would otherwise
    // wipe the patch out.
    session.waView.webContents.on('dom-ready', () => { injectMediaDevicePrefs(session); });

    // target=_blank links to WhatsApp's OWN domain (its "pop out chat" /
    // similar features) open as a real Electron window sharing this
    // profile's session/partition (action: 'allow' inherits it automatically)
    // — opening those in the external default browser would land on a
    // logged-out page, which is what "izin gerekli" dead-ended on before.
    // Everything else external still goes to the real browser, same as before.
    session.waView.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://web.whatsapp.com') || url.startsWith('https://www.whatsapp.com')) {
            return { action: 'allow' };
        }
        if (url.startsWith('http')) shell.openExternal(url);
        return { action: 'deny' };
    });

    wireGlobalShortcuts(session.waView.webContents, session);

    win.contentView.addChildView(session.waView);
    layoutViews();

    // Marker so findWaPage() can tell this profile's view apart from every
    // other open profile's (and the UI page) once puppeteer connects.
    // whatsapp-web.js navigates it to web.whatsapp.com right after, which
    // is fine — the page is already matched by then.
    const marker = markerName(session.id);
    await session.waView.webContents.loadURL('about:blank');
    await session.waView.webContents.executeJavaScript(`window['${marker}'] = true; true`);
}

// Creates a Telegram profile's embedded web.telegram.org view (connectionMode
// 'web'/'both' — see openProfile below). Modeled on setupWaView above, but
// much simpler: this is a plain manual chat surface, not an automation
// target — no puppeteer marker, no CDP hook, no bot wiring of any kind.
// Message automation (if this profile also has connectionMode 'both')
// stays entirely on the separate teleproto/MTProto connection in
// openTelegramProfile — this view and that bot never talk to each other.
async function setupTelegramView(session) {
    session.tgView = new WebContentsView({
        webPreferences: {
            partition: session.partition,
            backgroundThrottling: false,
        },
    });

    // Same reasoning as WA's UA override — present a plain modern Chrome UA
    // so Telegram Web doesn't flag this as an unsupported browser.
    session.tgView.webContents.session.setUserAgent(CHROME_UA);

    // Telegram Web wants mic access for voice messages/calls — auto-granted
    // for the same reason WA's view grants it unconditionally (see
    // setupWaView): no browser chrome here for Telegram's own in-page
    // permission prompt to point at. Notifications/geolocation/camera
    // follow this profile's own store toggle when it has one (connectionMode
    // 'both'); default to allowed when it doesn't (connectionMode 'web' —
    // no bot/store at all for this profile). See setupWaView's own
    // isPermissionAllowed for why camera gets checked against
    // details.mediaTypes instead of riding along with mic under 'media'.
    function isPermissionAllowed(permission, details) {
        const state = session.store?.state;
        if (permission === 'media') {
            if (details?.mediaTypes?.includes('video')) return state?.cameraEnabled ?? true;
            return true;
        }
        if (permission === 'notifications') return state?.notificationsEnabled ?? true;
        if (permission === 'geolocation') return state?.locationEnabled ?? true;
        return false;
    }
    session.tgView.webContents.session.setPermissionRequestHandler((_wc, permission, callback, details) => {
        callback(isPermissionAllowed(permission, details));
    });
    session.tgView.webContents.session.setPermissionCheckHandler((_wc, permission, _origin, details) => isPermissionAllowed(permission, details));

    // Screen sharing during a Telegram call — same picker WA's view uses.
    session.tgView.webContents.session.setDisplayMediaRequestHandler(async (_request, callback) => {
        try {
            const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 300, height: 200 } });
            if (!sources.length) return callback({});
            const chosenId = await showScreenPicker(sources);
            const chosen = chosenId ? sources.find(s => s.id === chosenId) : null;
            callback(chosen ? { video: chosen, audio: 'loopback' } : {});
        } catch (_) {
            callback({});
        }
    }, { useSystemPicker: true });

    // Stay inside web.telegram.org for its own navigation (e.g. switching
    // between the /k/ and /a/ clients); anything else external goes to the
    // real browser instead of hijacking this pane.
    session.tgView.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://web.telegram.org')) return { action: 'allow' };
        if (url.startsWith('http')) shell.openExternal(url);
        return { action: 'deny' };
    });

    wireGlobalShortcuts(session.tgView.webContents);

    win.contentView.addChildView(session.tgView);
    layoutViews();
    await session.tgView.webContents.loadURL('https://web.telegram.org/k/');

    // Only meaningful for connectionMode 'web' — 'both' already gets a
    // richer status stream from openTelegramProfile's bot lifecycle
    // (starting/qr/telegram_password/ready/error), which shouldn't be
    // clobbered by this view's own trivial "loaded" signal. 'web' has no
    // other status source at all, so without this the tab dot would sit on
    // the initial 'starting' state forever even though the page is right
    // there and fully usable.
    if (session.mode === 'web') setStatus(session, 'ready', 'Telegram Web açıldı');
}

// Tears down a profile's current WhatsApp view and builds a fresh one in
// its place — a lighter-weight recovery than closing/reopening the whole
// tab: the window, topbar and settings stay up the whole time, only that
// profile's WhatsApp pane blanks and reloads.
async function recreateWaView(session) {
    if (session.waView) {
        try { win.contentView.removeChildView(session.waView); } catch (_) {}
        try { session.waView.webContents.close(); } catch (_) {}
        session.waView = null;
    }
    await setupWaView(session);
}

// The Ollama tab's view — created once, lazily, on first activation, then
// just shown/hidden via layoutViews() like a profile's waView (never
// recreated/torn down, since it has no puppeteer/session state to go stale).
async function setupOllamaView() {
    if (ollamaView) return;
    ollamaView = new WebContentsView({
        webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
    });
    wireGlobalShortcuts(ollamaView.webContents);

    win.contentView.addChildView(ollamaView);
    await ollamaView.webContents.loadFile(path.join(__dirname, 'ui', 'ollama.html'));
}

async function createWindow() {
    win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        // Test mode keeps the window invisible — no popping windows on screen.
        show: !TEST_MODE,
        title: 'NeRoBoT',
        // .ico on Windows gives crisper taskbar/titlebar rendering than .png
        // (multi-resolution, picked per-context by the OS).
        icon: path.join(__dirname, 'ui', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
        backgroundColor: '#0b0b0d',
        // No native title bar — #topbar in index.html is already its own
        // draggable region (see -webkit-app-region: drag there) with its
        // own icon/title; a native frame on top of that was just a second,
        // redundant bar. The three window-control buttons at its right end
        // (window:minimize/maximizeToggle/close below) replace what the
        // native frame used to provide.
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
        },
    });
    win.setMenuBarVisibility(false);
    win.on('resize', layoutViews);
    win.on('maximize', () => { layoutViews(); win.webContents.send('window:maximizedChanged', true); });
    win.on('unmaximize', () => { layoutViews(); win.webContents.send('window:maximizedChanged', false); });

    await win.loadFile(path.join(__dirname, 'ui', 'index.html'));

    // Make sure every open profile's WhatsApp session (IndexedDB/cookies) is
    // flushed to disk before the process dies — an unflushed close is
    // another way to lose a login and get asked for the QR again.
    win.on('close', () => {
        for (const session of sessions.values()) {
            try { session.waView?.webContents.session.flushStorageData(); } catch (_) {}
        }
    });

    win.on('closed', () => {
        win = null;
        app.quit();
    });
}

// ============================
// Puppeteer → Electron bridge
// ============================
async function findWaPage(browser, profileId) {
    const marker = markerName(profileId);
    for (let attempt = 0; attempt < 40; attempt++) {
        for (const page of await browser.pages()) {
            try {
                if (await page.evaluate(`window['${marker}'] === true`)) return page;
            } catch (_) {
                // Page may be mid-navigation or not evaluable — skip it.
            }
        }
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`Could not find the WhatsApp view page for profile ${profileId} over CDP.`);
}

// Patched ONCE, globally — every profile's Client.initialize() calls the
// same puppeteer.connect(), so the profile id smuggled onto the options
// object (see project_scripts/bot.js) is how this shared wrapper knows
// which profile's embedded page to hand back.
function patchPuppeteerConnect() {
    const realConnect = puppeteer.connect.bind(puppeteer);
    puppeteer.connect = async (options) => {
        const browser = await realConnect(options);
        const page = await findWaPage(browser, options.profileId);
        // whatsapp-web.js calls newPage() right after connecting; hand it
        // our embedded view's page instead of letting it create a target
        // (which Electron doesn't support).
        browser.newPage = async () => page;
        // Stashed so profile teardown can call browser.disconnect() — a
        // local-only cleanup. NEVER call client.destroy() anywhere in this
        // app: it sends a CDP Browser.close(), and "the browser" here IS
        // the whole Electron app, so that would kill every open profile.
        const session = sessions.get(options.profileId);
        if (session) session.pupBrowser = browser;
        return browser;
    };
}

// ============================
// Startup watchdog — whatsapp-web.js occasionally just stalls on first
// connect (seen stuck at a fixed loading percentage, e.g. 99%, forever)
// with no error and no further events. Recovery is a fresh WhatsApp view
// (recreateWaView) + a brand new bot Client — NOT client.destroy() (see the
// comment in patchPuppeteerConnect above). This keeps the window, topbar
// and settings up the whole time; only that profile's WhatsApp pane blanks
// and reloads. Capped at MAX_AUTO_RETRIES so a genuinely broken setup
// doesn't loop forever — it gives up and shows an error status instead.
// Scoped to the pre-ready startup phase only: once 'qr' fires we're waiting
// on the user to scan (not stuck), and once 'ready' fires the retry budget
// resets for any future stall. All of this is per-session now — one
// profile's stuck watchdog/retry budget never touches another's.
// ============================
const MAX_AUTO_RETRIES = 2;
const STUCK_TIMEOUT_MS = 60_000;

async function startBotForSession(session) {
    if (!session.flushIntervalStarted) {
        session.flushIntervalStarted = true;
        // Periodic flush so a crash/force-kill can cost at most a few minutes
        // of freshly written session data instead of the whole login.
        setInterval(() => {
            try { session.waView?.webContents.session.flushStorageData(); } catch (_) {}
        }, 5 * 60 * 1000);
    }
    await attemptBotStart(session);
}

async function attemptBotStart(session) {
    // Dynamic import: bot.js (transitively commands.js) reads package.json/
    // help.txt with cwd-relative paths, so it must load after process.chdir
    // above — a static import would run before it.
    const { createBot } = await import('../project_scripts/bot.js');

    const built = createBot({
        profileId: session.id,
        profileDir: session.dir,
        puppeteer: {
            browserURL: `http://127.0.0.1:${devToolsPort}`,
            defaultViewport: null,
        },
        userAgent: CHROME_UA,
        // connectionMode 'web' → manual-only WhatsApp Web tab, no bot.js
        // message/AI dispatch (see createBot's automationEnabled doc).
        automationEnabled: session.mode !== 'web',
        onIncomingMessage: (payload) => pushNotification(session, payload),
    });
    session.client = built.client;
    session.reportError = built.reportError;
    session.store = built.store;
    session.utils = built.utils;
    session.ratelimit = built.ratelimit;
    // dom-ready may well have already fired (WhatsApp Web loading) before
    // session.store existed — catch up now that it does.
    injectMediaDevicePrefs(session);
    const client = session.client;

    const flushSession = () => {
        try { session.waView?.webContents.session.flushStorageData(); } catch (_) {}
    };

    // Generation guard: each attempt gets a number, and only the newest one
    // may report status or trigger recovery. Without this, a manual retry
    // that lands while the previous initialize() is still in flight starts a
    // race — the superseded attempt's failure ("frame was detached") fires
    // its own retryInBackground, burning the auto-retry budget and tearing
    // down the WhatsApp view the newer attempt is using. Also invalidated by
    // closeProfile() so a stray in-flight attempt can't resurrect a closed tab.
    const gen = ++session.botGeneration;
    const isCurrent = () => gen === session.botGeneration;

    let watchdog = null;
    let lastLoadingPercent = null;
    function clearWatchdog() {
        if (watchdog) { clearTimeout(watchdog); watchdog = null; }
    }
    function armWatchdog() {
        clearWatchdog();
        watchdog = setTimeout(() => retryInBackground('stuck'), STUCK_TIMEOUT_MS);
    }

    async function retryInBackground(reason) {
        if (!isCurrent()) return; // a newer attempt (or a close) owns recovery now
        clearWatchdog();
        const manual = reason === 'manual';
        // A manual click always goes through — the auto-retry cap only
        // exists to stop an unattended loop, not to block the user.
        if (!manual && session.autoRetryCount >= MAX_AUTO_RETRIES) {
            console.error(`[${session.name}] Bot ${MAX_AUTO_RETRIES} otomatik denemeden sonra hâlâ açılamadı — sekmeyi kapatıp tekrar açman gerekebilir.`);
            setStatus(session, 'error', 'Bot açılamadı — sekmeyi kapatıp tekrar açmayı dene.');
            return;
        }
        if (manual) {
            console.warn(`[${session.name}] Kullanıcı "Yeniden dene" butonuna bastı — WhatsApp görünümü tazeleniyor...`);
        } else {
            session.autoRetryCount++;
            const why = reason === 'stuck' ? `${STUCK_TIMEOUT_MS / 1000} saniyedir ilerlemiyor` : 'başlatılamadı';
            console.warn(`[${session.name}] Bot ${why} — WhatsApp görünümü arka planda tazelenip tekrar deneniyor (${session.autoRetryCount}/${MAX_AUTO_RETRIES})...`);
        }
        try {
            await recreateWaView(session);
            await attemptBotStart(session);
        } catch (err) {
            console.error(`[${session.name}] Otomatik yeniden deneme başarısız:`, err);
            setStatus(session, 'error', 'Başlatma hatası — loglara bak');
        }
    }
    session.manualRetryFn = () => retryInBackground('manual');

    client.on('qr', () => {
        if (!isCurrent()) return;
        clearWatchdog(); // waiting on the user to scan now — not "stuck"
        setStatus(session, 'qr', 'Giriş bekleniyor — QR kodu telefonundan okut');
    });
    // Fires repeatedly (0-100%) while restoring an existing saved session —
    // this can legitimately take a while for large accounts. Without this,
    // the status bar just sat on "starting" the whole time with no visible
    // progress, indistinguishable from being frozen. Only re-arms the
    // watchdog when the percentage actually changes, so a genuine stall at
    // a fixed percentage still gets caught.
    client.on('loading_screen', (percent) => {
        if (!isCurrent()) return;
        // WhatsApp Web sometimes fires a fresh loading_screen pass on its
        // own (an internal resync) even AFTER this session already reached
        // 'ready' — that's not an actual reload, so it must not flip the
        // status back to "starting" or re-show the splash (setStatus does
        // both for key 'starting'). Without this guard the app looked like
        // it silently reconnected/reloaded every so often even while the
        // bot was fine the whole time.
        if (session.botReady) return;
        if (percent !== lastLoadingPercent) {
            lastLoadingPercent = percent;
            armWatchdog();
        }
        setStatus(session, 'starting', `WhatsApp Web yükleniyor… %${percent}`, percent);
    });
    client.on('authenticated', () => {
        if (!isCurrent()) return;
        clearWatchdog();
        setStatus(session, 'auth', 'Giriş yapıldı, yükleniyor…');
        // The session credentials were just written — get them on disk now.
        setTimeout(flushSession, 5000);
    });
    client.on('ready', () => {
        if (!isCurrent()) return;
        clearWatchdog();
        session.autoRetryCount = 0; // fully recovered — give any future stall a fresh budget
        session.botReady = true;
        setStatus(session, 'ready', 'Bot aktif');
        setTimeout(flushSession, 5000);
    });
    client.on('disconnected', reason => {
        if (!isCurrent()) return;
        session.botReady = false;
        setStatus(session, 'down', `Bağlantı koptu: ${reason}`, reason);
        console.error(`[${session.name}] Disconnected:`, reason);
    });

    setStatus(session, 'starting', 'WhatsApp Web bağlanıyor…');
    armWatchdog();
    try {
        await client.initialize();
    } catch (err) {
        // A superseded attempt failing (typically "frame was detached" after
        // a manual retry replaced its WhatsApp view) is expected — only the
        // current attempt gets to log and recover.
        if (!isCurrent()) return;
        console.error(`[${session.name}] initialize failed:`, err);
        await retryInBackground('error');
    }
}

// ============================
// Profile lifecycle
// ============================
function newSession(entry) {
    return {
        id: entry.id,
        name: entry.name,
        platform: entry.platform || 'whatsapp',
        // 'bot' | 'web' | 'both' — see profiles.js's loadProfiles() for the
        // legacy-entry backfill and createProfile/createTelegramProfile for
        // how a fresh profile picks this. Drives openProfile()'s branching
        // below and is echoed back to the renderer via profilesPayload().
        mode: entry.connectionMode || (entry.platform === 'telegram' ? 'bot' : 'both'),
        dir: getProfileDir(DB_DIR, entry.id),
        partition: entry.sessionPartition || (entry.platform === 'telegram' ? `persist:nerobot-tg-${entry.id}` : undefined),
        waView: null,
        // Telegram-only — the embedded web.telegram.org page (connectionMode
        // 'web'/'both'). See setupTelegramView below.
        tgView: null,
        splashView: null,
        splashLoading: false,
        flushIntervalStarted: false,
        client: null,
        reportError: null,
        store: null,
        utils: null,
        ratelimit: null,
        pupBrowser: null,
        currentStatus: { key: 'starting', text: 'Başlatılıyor…' },
        botReady: false,
        botGeneration: 0,
        autoRetryCount: 0,
        manualRetryFn: null,
        // Telegram-only (see openTelegramProfile below).
        telegramBot: null,
        telegramAbort: null,
        pendingPasswordResolve: null,
    };
}

async function openProfile(id) {
    if (sessions.has(id)) {
        activeProfileId = id;
        layoutViews();
        return;
    }
    const entry = loadProfiles(DB_DIR).find(p => p.id === id);
    if (!entry) throw new Error(`Unknown profile: ${id}`);

    const session = newSession(entry);
    sessions.set(id, session);
    activeProfileId = id;

    if (session.platform === 'telegram') {
        // connectionMode gates which of the two independent Telegram
        // connections actually run — see profiles.js/newSession() for where
        // session.mode comes from, and the plan's "Single-QR bridging"
        // section for why these stay two separate logins instead of one.
        const wantsView = session.mode === 'web' || session.mode === 'both';
        const wantsBot = session.mode === 'bot' || session.mode === 'both';

        if (wantsView) {
            setupTelegramView(session).catch(err => {
                console.error(`[${session.name}] Telegram Web açılamadı:`, err);
            });
        } else {
            layoutViews(); // no tgView to create — the renderer's own placeholder covers this profile
        }
        if (wantsBot) {
            openTelegramProfile(session).catch(err => {
                console.error(`[${session.name}] Telegram bağlanamadı:`, err);
                setStatus(session, 'error', 'Bağlantı hatası — loglara bak');
            });
        }
        return;
    }

    await setupWaView(session);
    await showSplash(session);
    layoutViews();

    // Fire-and-forget, like the previous single-profile startBot() call —
    // the splash carries the "connecting…" UX while this runs in the
    // background; the IPC call resolves as soon as the view/splash exist.
    startBotForSession(session).catch(err => {
        console.error(`[${session.name}] Bot başlatılamadı:`, err);
        setStatus(session, 'error', 'Başlatma hatası — loglara bak');
    });
}

// Telegram equivalent of setupWaView+startBotForSession — no browser view,
// just a real MTProto login (QR code, optionally a 2FA password) followed
// by listening for messages. See project_scripts/telegram-bot.js.
async function openTelegramProfile(session) {
    setStatus(session, 'starting', 'Telegram\'a bağlanılıyor…');

    const appCreds = readTelegramAppConfig();
    if (!appCreds.apiId || !appCreds.apiHash) {
        setStatus(session, 'error', 'Telegram API kimliği ayarlanmamış — Ayarlar\'dan gir (my.telegram.org).');
        return;
    }

    const sessionFile = path.join(session.dir, TELEGRAM_SESSION_FILE);
    let sessionString = '';
    try { sessionString = fs.readFileSync(sessionFile, 'utf8').trim(); } catch (_) {}

    const controller = new AbortController();
    session.telegramAbort = controller;

    const bot = createTelegramBot({
        profileId: session.id,
        profileDir: session.dir,
        apiId: appCreds.apiId,
        apiHash: appCreds.apiHash,
        sessionString,
        abortSignal: controller.signal,
        onQr: async (url) => {
            try {
                const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 280 });
                setStatus(session, 'qr', 'Giriş bekleniyor — Telegram\'dan QR kodu okut', qrDataUrl);
            } catch (_) {}
        },
        // Resolved by the 'telegram:submitPassword' IPC handler below, once
        // the renderer's password prompt (shown for status key
        // 'telegram_password') gets an answer.
        onPasswordRequired: (hint) => new Promise((resolve) => {
            session.pendingPasswordResolve = resolve;
            setStatus(session, 'telegram_password', 'İki adımlı doğrulama şifresi gerekli', hint || '');
        }),
        onIncomingMessage: (payload) => pushNotification(session, payload),
    });

    session.client = bot.client;
    session.reportError = bot.reportError;
    session.store = bot.store;
    session.utils = bot.utils;
    session.ratelimit = bot.ratelimit;
    session.telegramBot = bot;

    try {
        const newSessionString = await bot.connectAndLogin();
        fs.writeFileSync(sessionFile, newSessionString);
        session.botReady = true;
        setStatus(session, 'ready', 'Bağlandı');
    } catch (err) {
        if (err?.name === 'AbortError') return; // profile closed mid-login — not a real failure
        throw err;
    }
}

// Tears a profile's session down completely: disconnects puppeteer (never
// client.destroy() — see patchPuppeteerConnect), removes/closes its views,
// and drops it from the map. Does NOT touch the profile's registry entry or
// on-disk data — closing a tab isn't deleting the profile.
async function closeProfile(id) {
    const session = sessions.get(id);
    if (!session) return;
    session.botGeneration++; // invalidate any in-flight attempt/watchdog for this session

    if (session.pupBrowser) {
        try { session.pupBrowser.disconnect(); } catch (_) {}
        session.pupBrowser = null;
    }
    hideSplash(session);
    if (session.waView) {
        try { win.contentView.removeChildView(session.waView); } catch (_) {}
        try { session.waView.webContents.close(); } catch (_) {}
        session.waView = null;
    }
    if (session.tgView) {
        try { win.contentView.removeChildView(session.tgView); } catch (_) {}
        try { session.tgView.webContents.close(); } catch (_) {}
        session.tgView = null;
    }
    // Telegram: cancel an in-flight QR login (if any — signals AbortError,
    // caught in openTelegramProfile) and drop the MTProto connection.
    if (session.telegramAbort) {
        try { session.telegramAbort.abort(); } catch (_) {}
        session.telegramAbort = null;
    }
    if (session.telegramBot) {
        try { await session.telegramBot.client.disconnect(); } catch (_) {}
        session.telegramBot = null;
    }
    sessions.delete(id);
    if (activeProfileId === id) activeProfileId = null;
    notifications = notifications.filter(n => n.profileId !== id);
    layoutViews();
}

function activateProfile(id) {
    activeProfileId = id || null;
    layoutViews();
}

function profilesPayload() {
    return {
        activeProfileId,
        profiles: loadProfiles(DB_DIR).map(p => {
            const session = sessions.get(p.id);
            return {
                id: p.id,
                name: p.name,
                platform: p.platform || 'whatsapp',
                mode: p.connectionMode || (p.platform === 'telegram' ? 'bot' : 'both'),
                isOpen: !!session,
                status: session ? session.currentStatus : null,
            };
        }),
    };
}

function requireSession(profileId) {
    const session = sessions.get(profileId);
    if (!session || !session.store) throw new Error('Profile is not open.');
    return session;
}

// ============================
// IPC
// ============================
ipcMain.handle('ui:init', (_e, profileId) => {
    const session = profileId ? sessions.get(profileId) : null;
    return { backlog: logBuffer, status: session ? session.currentStatus : null };
});

ipcMain.handle('ui:splashAscii', () => {
    try {
        // A static shipped asset (like help.txt below), not user data — reads
        // from the app's OWN install location, not DB_DIR (see PROJECT_ROOT's
        // doc comment above), so it survives DB_DIR's move to Documents.
        return fs.readFileSync(path.join(PROJECT_ROOT, 'ascii.txt'), 'utf8');
    } catch (_) {
        return '';
    }
});

// Renderer (splash.html) calls this once its fade-out finishes — remove
// the splash layer so the real UI (topbar + WhatsApp view) shows through.
// Matched by sender webContents since several profiles can each have their
// own splash view alive at once.
ipcMain.on('ui:splashDone', (e) => {
    for (const session of sessions.values()) {
        if (session.splashView && !session.splashView.webContents.isDestroyed() && e.sender === session.splashView.webContents) {
            hideSplash(session);
            break;
        }
    }
});

// Renderer's manual "Yeniden dene" button — shown after a few seconds with
// no status change. Runs the same recovery as the auto-watchdog but without
// waiting for it or counting against its retry cap.
ipcMain.on('bot:manualRetry', (_e, profileId) => {
    const session = sessions.get(profileId);
    if (session?.manualRetryFn) session.manualRetryFn();
});

ipcMain.on('logs:toggle', (_e, open) => {
    logOpen = !!open;
    layoutViews();
});

// Invoke (not fire-and-forget) because opening needs to hand the renderer
// something to show while it hides the active WA/Telegram/Ollama view: a
// screenshot of the window taken RIGHT BEFORE that collapse, so the modal
// can show it blurred behind itself instead of just going black (that view
// is a separate native layer stacked above this page's own DOM — nothing in
// the page's own CSS can blur it, and once modalOpen collapses it there's
// nothing left there to blur even if it could).
//
// win.capturePage() alone isn't enough here — Electron defines
// BrowserWindow.prototype.capturePage as a straight passthrough to
// `this.webContents.capturePage(...)`, i.e. it only ever rasterizes this
// page's OWN DOM. The WA/Telegram/Ollama content lives in a separate
// WebContentsView stacked on top via contentView.addChildView (see
// layoutViews above) — invisible to that call.
//
// A previous version of this reached for desktopCapturer's 'window' sources
// instead (an OS-level grab of the whole composited window, same mechanism
// the screen-share picker above uses) to get around that — but
// desktopCapturer.getSources({types:['window']}) has to enumerate + thumbnail
// EVERY window on the whole desktop before it can hand back the one that's
// ours, cost roughly proportional to however many windows/apps the user has
// open, not to our own window's size. That was regularly taking multiple
// seconds (blocking the modal + the collapse behind it), AND that
// desktop-wide enumeration was perturbing every other open window's own
// occlusion/visibility state on Windows in the process — WhatsApp Web's own
// reconnect logic reacts to that, which is what was making its loading
// screen show up far more than before once this ran on every tab switch.
//
// The actual fix: capture our OWN two layers directly and composite them in
// the renderer instead — win.webContents.capturePage() for this page's own
// chrome (topbar/tab strip/status bar) plus getVisibleContentView()'s own
// capturePage() for whichever WA/Telegram/Ollama/splash view is actually
// showing. Both are single-surface captures Chromium already has in memory
// (no desktop enumeration, no touching any other window), so together
// they're fast — fast enough that grabbing them inline, right before the
// collapse below, is no longer something the user notices waiting on.
function getVisibleContentView() {
    if (ollamaActive) return ollamaView && !ollamaView.webContents.isDestroyed() ? ollamaView : null;
    if (!activeProfileId) return null;
    const session = sessions.get(activeProfileId);
    if (!session) return null;
    // Splash sits stacked above the profile's own view while it's up (see
    // showSplash/hideSplash) — that's what's actually visible, not what's
    // underneath it.
    if (session.splashView && !session.splashView.webContents.isDestroyed()) return session.splashView;
    // Mirrors layoutViews' own hideForBotMode check — a 'bot' mode profile's
    // waView sits offscreen (not actually visible) except during its
    // first-run QR scan, so there's nothing meaningful to grab from it here.
    const hideForBotMode = session.mode === 'bot' && session.currentStatus?.key !== 'qr';
    if (session.waView && !hideForBotMode && !session.waView.webContents.isDestroyed()) return session.waView;
    if (session.tgView && !session.tgView.webContents.isDestroyed()) return session.tgView;
    return null;
}

async function captureModalBackdrop() {
    if (!win || win.isDestroyed()) return null;
    try {
        const [baseImg, contentView] = [await win.webContents.capturePage(), getVisibleContentView()];
        const base = baseImg.isEmpty() ? null : baseImg.toDataURL();
        let content = null;
        if (contentView) {
            const contentImg = await contentView.webContents.capturePage();
            if (!contentImg.isEmpty()) content = contentImg.toDataURL();
        }
        return (base || content) ? { base, content } : null;
    } catch (err) {
        console.error('[NeRoBoT] Modal arka plan görüntüsü alınamadı:', err.message || err);
        return null;
    }
}

ipcMain.handle('modal:toggle', async (_e, open) => {
    // Bumped on every call — if a close() lands while an earlier open()'s
    // capture is still in flight (rare now that capture is fast, but still
    // possible), the open() below notices its generation is stale once the
    // capture resolves and bails instead of clobbering the close that
    // already happened (modalOpen=true with nothing left to ever undo it —
    // this was the "stuck behind the blur" bug with the old, slow capture).
    const gen = ++modalToggleGen;
    if (open) {
        const snapshot = await captureModalBackdrop();
        if (gen !== modalToggleGen) return null;
        modalOpen = true;
        layoutViews();
        return snapshot;
    }
    modalOpen = false;
    layoutViews();
    return null;
});

// ============================
// IPC — profiles (Home screen + tab strip)
// ============================
ipcMain.handle('profiles:list', () => profilesPayload());

ipcMain.handle('profiles:create', (_e, name, mode) => {
    const { entry } = createProfile(DB_DIR, name, mode);
    console.log(`[NeRoBoT] Yeni profil oluşturuldu: ${entry.name}`);
    return profilesPayload();
});

// ============================
// IPC — Telegram (app-wide api_id/api_hash + per-profile QR login)
// ============================
ipcMain.handle('telegram:getAppCredentials', () => {
    const { apiId, apiHash } = readTelegramAppConfig();
    return { apiId: apiId || null, hasApiHash: !!apiHash };
});

ipcMain.handle('telegram:setAppCredentials', (_e, apiId, apiHash) => {
    const id = Number(apiId);
    writeTelegramAppConfig({ apiId: Number.isFinite(id) ? id : null, apiHash: String(apiHash || '').trim() });
    return { ok: true };
});

// ============================
// IPC — app-wide config (NeRoChAt quick-popup shortcut)
// ============================
ipcMain.handle('app:getConfig', () => readAppConfig());

ipcMain.handle('app:setConfig', (_e, updates) => {
    writeAppConfig({ ...readAppConfig(), ...updates });
    return readAppConfig();
});

// ============================
// IPC — window controls (see #topbar's own minimize/maximize/close buttons
// in index.html — the window is frame: false, so these replace the native
// title bar's controls; window:maximizedChanged above tells the renderer
// which icon to show).
// ============================
ipcMain.handle('window:minimize', () => win?.minimize());
ipcMain.handle('window:maximizeToggle', () => {
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
});
ipcMain.handle('window:isMaximized', () => win?.isMaximized() ?? false);
ipcMain.handle('window:close', () => win?.close());

ipcMain.handle('telegram:createProfile', async (_e, name, mode) => {
    // The app-wide api_id/api_hash is only needed for the bot's own MTProto
    // connection (connectionMode 'bot'/'both') — a 'web'-only profile never
    // touches teleproto at all, so it shouldn't be gated on this.
    const wantsBot = mode === 'bot' || mode === 'both';
    if (wantsBot) {
        const appCreds = readTelegramAppConfig();
        if (!appCreds.apiId || !appCreds.apiHash) {
            return { ok: false, error: 'Önce Ayarlar\'dan Telegram API kimliğini (api_id/api_hash) gir.' };
        }
    }
    const { entry } = createTelegramProfile(DB_DIR, name, mode);
    console.log(`[NeRoBoT] Yeni Telegram profili oluşturuldu: ${entry.name}`);
    await openProfile(entry.id);
    return { ok: true, profileId: entry.id, ...profilesPayload() };
});

// Answers the password prompt raised by a profile's onPasswordRequired
// (see openTelegramProfile) — only meaningful while status is
// 'telegram_password' for that profile.
ipcMain.on('telegram:submitPassword', (_e, profileId, password) => {
    const session = sessions.get(profileId);
    if (session?.pendingPasswordResolve) {
        session.pendingPasswordResolve(password || '');
        session.pendingPasswordResolve = null;
    }
});

ipcMain.handle('profiles:rename', (_e, id, name) => {
    renameProfile(DB_DIR, id, name);
    const session = sessions.get(id);
    if (session) session.name = String(name || '').trim() || session.name;
    return profilesPayload();
});

// Changes an existing profile's connectionMode (Profil Yönetimi → Bağlantı
// Modu). The renderer decides when a Telegram change needs the "1 more
// session" confirm (see index.html) and, for a change that needs the bot's
// api_id/api_hash and doesn't have it yet, retries this same call once the
// credentials overlay is filled in — same shape as telegram:createProfile's
// creds gate below.
ipcMain.handle('profiles:setMode', async (_e, id, mode) => {
    const entry = loadProfiles(DB_DIR).find(p => p.id === id);
    if (!entry) return { ok: false, error: 'Profil bulunamadı.' };
    if (entry.platform === 'telegram' && (mode === 'bot' || mode === 'both')) {
        const appCreds = readTelegramAppConfig();
        if (!appCreds.apiId || !appCreds.apiHash) {
            return { ok: false, needsTelegramCreds: true, error: 'Önce Ayarlar\'dan Telegram API kimliğini (api_id/api_hash) gir.' };
        }
    }
    setProfileMode(DB_DIR, id, mode);

    const wasOpen = sessions.has(id);
    const wasActive = id === activeProfileId;
    const previousActive = activeProfileId;
    if (wasOpen) {
        await closeProfile(id);
        await openProfile(id); // always re-activates id — restore focus below if it wasn't already active
        if (previousActive !== id) activateProfile(previousActive);
    }
    return { ok: true, reopened: wasOpen, wasActive, ...profilesPayload() };
});

ipcMain.handle('profiles:delete', async (_e, id) => {
    await closeProfile(id);
    const { removed } = deleteProfile(DB_DIR, id);
    if (removed?.sessionPartition) {
        try { await electronSession.fromPartition(removed.sessionPartition).clearStorageData(); } catch (_) {}
    }
    console.log(`[NeRoBoT] Profil silindi: ${removed?.name || id}`);
    return profilesPayload();
});

ipcMain.handle('profiles:export', async (_e, id) => {
    const bundle = exportProfile(DB_DIR, id);
    if (!bundle) return { ok: false, error: 'Profil bulunamadı.' };
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Profili Dışa Aktar',
        defaultPath: `${bundle.name.replace(/[^a-zA-Z0-9-_]+/g, '_')}.nerobot-profile.json`,
        filters: [{ name: 'NeRoBoT Profili', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2));
    console.log(`[NeRoBoT] Profil dışa aktarıldı: ${bundle.name} → ${filePath}`);
    return { ok: true, filePath };
});

// Imports INTO an existing profile — overwrites its whitelist/blacklist/
// admins/settings/etc. with a previously-exported bundle. Does not touch
// the profile's identity or WhatsApp session. If that profile is currently
// open, its live session is closed and reopened so the running bot picks
// up the overwritten files instead of continuing on stale in-memory state
// (simpler and safer than mutating the live store's Sets/objects in place).
ipcMain.handle('profiles:importInto', async (_e, id) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: 'Profile İçe Aktar',
        filters: [{ name: 'NeRoBoT Profili', extensions: ['json'] }],
        properties: ['openFile'],
    });
    if (canceled || !filePaths?.[0]) return { ok: false, canceled: true, ...profilesPayload() };
    let bundle;
    try {
        bundle = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    } catch (err) {
        return { ok: false, error: 'Dosya okunamadı: ' + (err.message || err), ...profilesPayload() };
    }
    const { entry } = overwriteProfile(DB_DIR, id, bundle);
    if (!entry) return { ok: false, error: 'Profil bulunamadı.', ...profilesPayload() };

    const wasOpen = sessions.has(id);
    const wasActive = id === activeProfileId;
    const previousActive = activeProfileId;
    if (wasOpen) {
        await closeProfile(id);
        await openProfile(id); // always re-activates id — restore focus below if it wasn't already active
        if (previousActive !== id) activateProfile(previousActive);
    }

    console.log(`[${entry.name}] Profile içe aktarıldı (${bundle?.name || '(isimsiz)'} dosyasından)`);
    return { ok: true, reopened: wasOpen, wasActive, ...profilesPayload() };
});

ipcMain.handle('profile:open', async (_e, id) => {
    await openProfile(id);
    return profilesPayload();
});

ipcMain.handle('profile:close', async (_e, id) => {
    await closeProfile(id);
    return profilesPayload();
});

ipcMain.handle('profile:activate', (_e, id) => {
    activateProfile(id);
    return profilesPayload();
});

// ============================
// IPC — global settings (Genel tab) — scoped to whichever profile the
// renderer says is active.
// ============================
function pickSettings(state, keys) {
    const out = {};
    for (const key of keys) out[key] = state[key];
    return out;
}

ipcMain.handle('settings:get', (_e, profileId) => {
    // Softer than requireSession() on purpose: the splash page fetches this
    // for its help-language toggle immediately on load, which can race
    // ahead of the bot factory populating session.store — {} is a safe,
    // silent fallback (splash.html just keeps its Turkish default).
    const session = sessions.get(profileId);
    if (!session || !session.store) return {};
    return pickSettings(session.store.state, session.store.PERSISTENT_KEYS);
});

// Applies updates to the live state object (bot handlers read it on every
// message, so changes take effect immediately) and persists to settings.json.
// Values are coerced to the type of the current value; invalid numbers are
// silently dropped rather than corrupting the state.
ipcMain.handle('settings:save', (_e, profileId, updates) => {
    const session = requireSession(profileId);
    const { state, PERSISTENT_KEYS, saveSettings } = session.store;

    for (const key of PERSISTENT_KEYS) {
        if (!(key in updates)) continue;
        const current = state[key];
        const next = updates[key];

        // debugChatId is a WhatsApp chat id or null (picked from a dropdown,
        // never typed) — its default is null, not a string, so it can't go
        // through the generic string branch below (String(null) === "null").
        if (key === 'debugChatId') {
            state[key] = next || null;
        } else if (typeof current === 'boolean') {
            state[key] = !!next;
        } else if (typeof current === 'number') {
            const n = Number(next);
            if (Number.isFinite(n)) state[key] = n;
        } else {
            state[key] = String(next);
        }
    }

    saveSettings();
    console.log(`[${session.name}] Ayarlar güncellendi`);
    // Cheap enough to just always re-run — only actually changes anything
    // when preferredMicId/preferredCameraId were among `updates`.
    injectMediaDevicePrefs(session);
    return pickSettings(state, PERSISTENT_KEYS);
});

// Ayarlar → Genel → İzinler's mic/camera dropdowns — only returns real
// labels once WhatsApp's "media" permission has actually been granted
// (see setupWaView), same as any regular browser.
ipcMain.handle('wa:listMediaDevices', async (_e, profileId) => {
    const session = sessions.get(profileId);
    if (!session?.waView || session.waView.webContents.isDestroyed()) {
        return { ok: false, error: 'WhatsApp view not ready.' };
    }
    try {
        const devices = await session.waView.webContents.executeJavaScript(
            `navigator.mediaDevices.enumerateDevices().then(list => list.filter(d => d.kind === 'audioinput' || d.kind === 'videoinput').map(d => ({ deviceId: d.deviceId, kind: d.kind, label: d.label || '' })))`
        );
        return { ok: true, devices };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
});

ipcMain.handle('settings:reset', (_e, profileId) => {
    const session = requireSession(profileId);
    session.store.resetStateToDefaults();
    console.log(`[${session.name}] Ayarlar varsayılanlara döndürüldü`);
    return pickSettings(session.store.state, session.store.PERSISTENT_KEYS);
});

// Full factory reset — mirrors the !reset all settings WhatsApp command:
// wipes state back to defaults AND clears every list/override/memory, not
// just the settings.json snapshot (settings:reset above only touches state).
ipcMain.handle('settings:factoryReset', (_e, profileId) => {
    const session = requireSession(profileId);
    const store = session.store;
    store.resetStateToDefaults();
    store.whitelist.clear();      store.saveWhitelist();
    store.blacklist.clear();      store.saveBlacklist();
    store.admins.clear();         store.saveAdmins();
    store.noPrefixChats.clear();  store.saveNoPrefixChats();
    store.groupChats.clear();     store.saveGroupChats();
    for (const key in store.chatModels) delete store.chatModels[key];
    store.saveChatModels();
    for (const key in store.chatPrefixes) delete store.chatPrefixes[key];
    store.saveChatPrefixes();
    for (const key in store.chatHistories) delete store.chatHistories[key];
    session.ratelimit?.resetAllRateLimitBuckets();
    console.log(`[${session.name}] Fabrika ayarlarına tamamen sıfırlandı`);
    return pickSettings(store.state, store.PERSISTENT_KEYS);
});

// Clears every chat's AI memory (mirrors !clear all) without touching any
// other settings/lists.
ipcMain.handle('ai:clearAllMemory', (_e, profileId) => {
    const session = requireSession(profileId);
    const store = session.store;
    for (const key in store.chatHistories) delete store.chatHistories[key];
    session.ratelimit?.resetAllRateLimitBuckets();
    console.log(`[${session.name}] Tüm AI hafızası temizlendi`);
    return { ok: true };
});

ipcMain.handle('app:version', () => APP_VERSION);

// Same help.txt/parsing commands.js's !help command uses — read straight
// into the AI tab's "Yardım" sub-tab instead of round-tripping through chat.
ipcMain.handle('app:helpText', (_e, lang) => {
    try {
        const helpText = fs.readFileSync(path.join(PROJECT_ROOT, 'help.txt'), 'utf8');
        const trMatch = helpText.match(/===TR===\s*([\s\S]*?)(?====EN===|$)/);
        const enMatch = helpText.match(/===EN===\s*([\s\S]*?)$/);
        const trSection = trMatch ? trMatch[1].trim() : 'TR bölümü bulunamadı.';
        const enSection = enMatch ? enMatch[1].trim() : 'EN section not found.';
        return lang === 'en' ? enSection : trSection;
    } catch (err) {
        return `help.txt okunamadı: ${err.message || err}`;
    }
});

// ============================
// IPC — Ollama (install gate + the small built-in chat shortcut)
// ============================
function readOllamaStatus() {
    try {
        return JSON.parse(fs.readFileSync(OLLAMA_STATUS_FILE, 'utf8'));
    } catch (_) {
        return { shortcutCreated: false };
    }
}

function writeOllamaStatus(status) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(OLLAMA_STATUS_FILE, JSON.stringify(status, null, 2));
}

ipcMain.handle('ollama:checkInstalled', () => isOllamaInstalled());

// Streams progress back over 'ollama:installProgress' while the single
// `install` call is in flight, then resolves with the final result.
ipcMain.handle('ollama:install', async () => {
    const result = await installOllama((progress) => {
        if (win && !win.isDestroyed()) win.webContents.send('ollama:installProgress', progress);
    });
    if (result.ok) openOllamaApp();
    return result;
});

ipcMain.handle('ollama:getStatus', () => readOllamaStatus());

ipcMain.handle('ollama:setShortcutCreated', (_e, created) => {
    const status = readOllamaStatus();
    status.shortcutCreated = !!created;
    writeOllamaStatus(status);
    return status;
});

// Global NeRoChAt personality (system prompt) — applies to every
// conversation that doesn't set its own override (see
// ollama:setConversationPersonality below). Lives in the same
// profile-independent status file as shortcutCreated since NeRoChAt isn't
// scoped to a WA profile.
ipcMain.handle('ollama:setPersonality', (_e, personality) => {
    const status = readOllamaStatus();
    status.personality = personality || '';
    writeOllamaStatus(status);
    return status;
});

// NeRoChAt's own image-generation toggle (Ayarlar → NeRoChAt → Genel) —
// same feature as a WA profile's imageGenEnabled setting, just stored in
// this profile-independent status file since NeRoChAt isn't scoped to one.
ipcMain.handle('ollama:setImageGenEnabled', (_e, enabled) => {
    const status = readOllamaStatus();
    status.imageGenEnabled = !!enabled;
    writeOllamaStatus(status);
    return status;
});

ipcMain.handle('ollama:setImageGenProvider', (_e, provider) => {
    const status = readOllamaStatus();
    status.imageGenProvider = provider;
    writeOllamaStatus(status);
    return status;
});

// `provider` is 'openai' | 'stability' — each key lives in its own field
// (imageGenApiKeyOpenai/imageGenApiKeyStability) so switching
// imageGenProvider back and forth never overwrites the other one.
ipcMain.handle('ollama:setImageGenApiKey', (_e, provider, apiKey) => {
    const status = readOllamaStatus();
    if (provider === 'openai') status.imageGenApiKeyOpenai = apiKey || '';
    else if (provider === 'stability') status.imageGenApiKeyStability = apiKey || '';
    writeOllamaStatus(status);
    return status;
});

// Classifies whether a NeRoChAt message is asking for an image, using
// whichever model the chat window has selected — same approach and prompt
// as bot.js's WhatsApp-side classifyImageIntent() (see ai.js), just called
// directly here since NeRoChAt has no per-profile `store`/`chatHistories` of
// its own to route through project_scripts/ai.js's factory.
// `hasImage` — a photo was attached to this message — lets the classifier
// recognize "redraw/regenerate this" as an image request too (see
// IMAGE_CLASSIFY_PROMPT); ollama:describeImageForGeneration below turns that
// photo into an actual prompt once this says it's a generation request.
ipcMain.handle('ollama:classifyImageIntent', async (_e, { prompt, model, hasImage }) => {
    if (!prompt) return { image: false, prompt: '' };
    try {
        const content = hasImage ? `${prompt}\n\n[the user also attached a photo]` : prompt;
        const response = await ollamaClient.chat({
            model: await pickClassifierModel(model),
            messages: [
                { role: 'system', content: IMAGE_CLASSIFY_PROMPT },
                { role: 'user', content },
            ],
        });
        const match = response.message.content.match(/\{[\s\S]*\}/);
        if (!match) return { image: false, prompt: '' };
        const parsed = JSON.parse(match[0]);
        return {
            image: parsed.image === true,
            prompt: typeof parsed.prompt === 'string' ? parsed.prompt.slice(0, 500) : '',
        };
    } catch (_) {
        return { image: false, prompt: '' };
    }
});

// Turns an attached photo into a short text prompt via a vision-capable
// model — the selected model itself if it can see images, otherwise
// whatever IS pulled that can (see resolveVisionModel) — since imagegen.js's
// backends are text-to-image only. Same approach as ai.js's
// describeImageForGeneration (WhatsApp/Telegram side).
ipcMain.handle('ollama:describeImageForGeneration', async (_e, { model, imageBase64, extraInstruction }) => {
    try {
        const visionModel = await resolveVisionModel(model);
        if (!visionModel) return { ok: false, error: 'Görsel okuyabilen bir model yüklü değil — önce bir tane indir (örn. llava, qwen2.5vl).' };
        const response = await ollamaClient.chat({
            model: visionModel,
            messages: [
                { role: 'system', content: IMAGE_DESCRIBE_FOR_GEN_PROMPT },
                { role: 'user', content: extraInstruction || 'Describe this image.', images: [imageBase64] },
            ],
        });
        return { ok: true, description: response.message.content.trim() };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
});

// Decides, for a normal (non-generation) message with an attached photo,
// whether the selected model can just see it directly or needs it captioned
// first — same fallback ai.js's askModel does for WhatsApp/Telegram (see
// there for the full reasoning). mode 'vision': attach the image as usual.
// mode 'caption': the renderer should fold `text` into the message content
// instead of setting `images`. Always resolves 'vision' as a last resort
// (best-effort: let Ollama's own chat call sort it out) if literally nothing
// pulled has vision capability, matching this app's behavior before this
// fallback existed.
ipcMain.handle('ollama:prepareImageForChat', async (_e, { model, imageBase64 }) => {
    if (await modelHasVision(model)) return { ok: true, mode: 'vision' };
    const visionModel = await pickVisionFallbackModel(model);
    if (!visionModel) return { ok: true, mode: 'vision' };
    try {
        const response = await ollamaClient.chat({
            model: visionModel,
            messages: [
                { role: 'system', content: IMAGE_READ_FALLBACK_PROMPT },
                { role: 'user', content: 'Describe this image.', images: [imageBase64] },
            ],
        });
        return { ok: true, mode: 'caption', text: response.message.content.trim() };
    } catch (_) {
        return { ok: true, mode: 'vision' }; // captioning itself failed — fall back to attaching the raw image anyway
    }
});

// Generates an image for NeRoChAt (same free backend as the WhatsApp side,
// see project_scripts/imagegen.js) and hands the raw bytes back as base64
// for the renderer to display inline in the chat.
ipcMain.handle('ollama:generateImage', async (_e, prompt) => {
    try {
        const status = readOllamaStatus();
        const provider = status.imageGenProvider || 'pollinations';
        const apiKey = provider === 'openai' ? status.imageGenApiKeyOpenai
            : provider === 'stability' ? status.imageGenApiKeyStability
            : undefined;
        const { buffer, mimetype } = await generateImage(prompt, { provider, apiKey });
        return { ok: true, base64: buffer.toString('base64'), mimetype };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
});

// NeRoChAt's per-image download button (generated images, attached photos,
// and anything re-rendered on conversation reload — see ollama.html's
// addImageToBubble()) — same showSaveDialog pattern as profiles:export.
ipcMain.handle('ollama:saveImage', async (_e, { base64, mimetype }) => {
    const ext = (mimetype || 'image/png').split('/')[1]?.split('+')[0] || 'png';
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Görseli Kaydet',
        defaultPath: `nerobot-${Date.now()}.${ext}`,
        filters: [{ name: 'Görsel', extensions: [ext] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    try {
        fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
        return { ok: true, filePath };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
});

// Lets the renderer build the "you just made this image" follow-up request
// (see ai.js's IMAGE_ACK_NOTE) without duplicating that string in
// ui/ollama.html's own script — it can't import an ESM file directly.
ipcMain.handle('ollama:getImageAckNote', () => IMAGE_ACK_NOTE);

function readOllamaChats() {
    try {
        return JSON.parse(fs.readFileSync(OLLAMA_CHATS_FILE, 'utf8'));
    } catch (_) {
        return [];
    }
}

function writeOllamaChats(chats) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(OLLAMA_CHATS_FILE, JSON.stringify(chats, null, 2));
}

// Metadata only (id/title/updatedAt) — the sidebar list doesn't need every
// message just to render itself, newest conversation first.
ipcMain.handle('ollama:listConversations', () => {
    return readOllamaChats()
        .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
});

ipcMain.handle('ollama:getConversation', (_e, id) => {
    return readOllamaChats().find(c => c.id === id) || null;
});

// Upserts a conversation's full message list. No id yet → this is a brand
// new conversation (first message just sent); one gets minted here and
// handed back so the renderer can track it for subsequent saves.
ipcMain.handle('ollama:saveConversation', (_e, id, messages, title) => {
    const chats = readOllamaChats();
    const now = Date.now();
    let entry = id ? chats.find(c => c.id === id) : null;
    if (!entry) {
        entry = { id: id || crypto.randomUUID(), title: title || 'Yeni Sohbet', messages: [], createdAt: now };
        chats.push(entry);
    }
    entry.messages = messages;
    if (title) entry.title = title;
    entry.updatedAt = now;
    writeOllamaChats(chats);
    return { id: entry.id };
});

ipcMain.handle('ollama:deleteConversation', (_e, id) => {
    writeOllamaChats(readOllamaChats().filter(c => c.id !== id));
    return { ok: true };
});

// Per-conversation personality override (Ayarlar → NeRoChAt → Sohbet tab) —
// empty means "use the global personality" (see ollama:setPersonality
// above), same convention as a WA chat's per-chat personality override.
ipcMain.handle('ollama:setConversationPersonality', (_e, id, personality) => {
    const chats = readOllamaChats();
    const entry = chats.find(c => c.id === id);
    if (!entry) return { ok: false };
    entry.personality = personality || '';
    writeOllamaChats(chats);
    return { ok: true, personality: entry.personality };
});

// File/image attach button in NeRoChAt — picks ONE local file, and either
// hands back a base64 image (for vision models) or extracted text (PDF/
// Word/plain text), same categories bot.js already handles for WhatsApp
// media, just sourced from a file dialog instead of a WhatsApp message.
ipcMain.handle('ollama:pickFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: 'Dosya Ekle',
        properties: ['openFile'],
        filters: [
            { name: 'Desteklenen dosyalar', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'pdf', 'docx', 'doc', 'txt', 'json', 'js', 'ts', 'csv', 'xml', 'yaml', 'yml', 'md', 'log'] },
        ],
    });
    if (canceled || !filePaths[0]) return { ok: false, canceled: true };

    const filePath = filePaths[0];
    const filename = path.basename(filePath);
    const ext = path.extname(filePath);
    let buffer;
    try {
        buffer = fs.readFileSync(filePath);
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }

    if (isImageExt(ext)) {
        const IMAGE_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' };
        const mime = IMAGE_MIME[ext.toLowerCase()] || 'image/png';
        return { ok: true, type: 'image', filename, mime, base64: buffer.toString('base64') };
    }
    const result = await extractFileText(buffer, ext, filename);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, type: 'text', filename, text: result.text };
});

ipcMain.handle('ollama:listModels', async () => {
    // Unlike ollama:activateTab (which calls this same openOllamaApp() before
    // ever showing the Ollama tab), the NeRoChAt quick-popup can be the very
    // first thing in the session to touch Ollama at all — e.g. opened via its
    // shortcut before the AI tab/Ayarlar→NeRoChAt was ever visited. Nudging
    // the server here too, every call, is cheap (a no-op if it's already
    // running — see openOllamaApp's own doc) and means the popup no longer
    // depends on some other screen having opened first. A freshly-spawned
    // server needs a beat to start listening, so retry a couple times before
    // reporting no models instead of failing on that first call.
    openOllamaApp();
    for (let attempt = 0; ; attempt++) {
        try {
            const { models } = await ollamaClient.list();
            return {
                ok: true,
                models: models.map(m => m.name),
                // Ayarlar → NeRoChAt's model-management list wants size too (see
                // renderOllamaModelsList in index.html) — every other caller
                // (NeRoChAt tab's/quick-popup's model dropdowns) still just uses
                // `models` above and ignores this.
                detailed: models.map(m => ({ name: m.name, size: m.size || 0 })),
            };
        } catch (err) {
            if (attempt >= 3) return { ok: false, error: err.message || String(err) };
            await new Promise((r) => setTimeout(r, 400));
        }
    }
});

// Ayarlar → NeRoChAt → Genel's per-model "✕" button. Broadcasts the same
// 'ollama:modelsChanged' a pull does (see ollama:pullModel below) — to BOTH
// the NeRoChAt tab and the main window itself, since unlike a pull (always
// kicked off from the main window's settings) a delete's result needs to
// reach the quick-popup's model dropdown too if it's the one open.
ipcMain.handle('ollama:deleteModel', async (_e, model) => {
    try {
        await ollamaClient.delete({ model });
        if (ollamaView && !ollamaView.webContents.isDestroyed()) ollamaView.webContents.send('ollama:modelsChanged');
        if (win && !win.isDestroyed()) win.webContents.send('ollama:modelsChanged');
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
});

// Pulls a new model from the Ollama registry (NeRoChAt's model dropdown "+"
// button) — streams progress back to the CALLING window, same pattern as
// ollama:chatSend's streaming.
ipcMain.handle('ollama:pullModel', async (e, model) => {
    const sender = e.sender;
    try {
        const stream = await ollamaClient.pull({ model, stream: true });
        for await (const part of stream) {
            if (sender.isDestroyed()) return { ok: false };
            sender.send('ollama:pullProgress', { status: part.status, completed: part.completed, total: part.total });
        }
        // Whichever window kicked this off (now always the main window's
        // Ayarlar → NeRoChAt tab), both the NeRoChAt tab's AND the quick
        // popup's model dropdowns need to know a new model showed up.
        if (ollamaView && !ollamaView.webContents.isDestroyed()) {
            ollamaView.webContents.send('ollama:modelsChanged');
        }
        if (win && !win.isDestroyed()) win.webContents.send('ollama:modelsChanged');
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
});

// Streams the assistant's reply back to the CALLING window (the mini Ollama
// chat window, not the main window) over 'ollama:chatChunk', then resolves
// once the stream ends.
ipcMain.handle('ollama:chatSend', async (e, { model, messages }) => {
    const sender = e.sender;
    try {
        const stream = await ollamaClient.chat({ model, messages, stream: true });
        for await (const part of stream) {
            if (sender.isDestroyed()) return { ok: false, error: 'Pencere kapatıldı.' };
            sender.send('ollama:chatChunk', { content: part.message?.content || '', done: false });
        }
        sender.send('ollama:chatChunk', { content: '', done: true });
        return { ok: true };
    } catch (err) {
        if (!sender.isDestroyed()) sender.send('ollama:chatChunk', { content: '', done: true, error: err.message || String(err) });
        return { ok: false, error: err.message || String(err) };
    }
});

// Switches the Ollama tab on — embedded in the main window (see
// setupOllamaView/layoutViews), same "no separate OS window" treatment a
// WA profile tab gets. Ensures the local Ollama server is reachable, but
// deliberately does NOT launch Ollama's own tray/GUI app — nothing should
// visibly pop up here, same as opening a WhatsApp profile doesn't.
ipcMain.handle('ollama:activateTab', async (_e) => {
    openOllamaApp();
    const isFirstActivation = !ollamaView;
    await setupOllamaView();
    ollamaActive = true;
    activeProfileId = null; // same invariant Home relies on — no WA view stays "active" underneath
    layoutViews();
    // setupOllamaView() only actually loads ollama.html the FIRST time (it's
    // a no-op on every activation after — see its own comment); ollama.html
    // itself only ever fetches the model list once too, right after that
    // load. So on every activation OTHER than the first, nothing was ever
    // telling an already-open NeRoChAt tab that models installed/removed
    // since it was last (re)shown — e.g. from Ayarlar → NeRoChAt, or an
    // "ollama pull" run outside the app entirely — actually happened; its
    // dropdown just sat on whatever it saw once at creation. Reusing the
    // same 'ollama:modelsChanged' a pull/delete already broadcasts (see
    // ollama:pullModel/ollama:deleteModel) makes every reactivation refresh
    // it too, same as reopening the tab from scratch would.
    if (!isFirstActivation && ollamaView && !ollamaView.webContents.isDestroyed()) {
        ollamaView.webContents.send('ollama:modelsChanged');
    }
    return profilesPayload();
});

ipcMain.on('ollama:deactivateTab', () => {
    ollamaActive = false;
    layoutViews();
});

// Actually tears the view down (unlike deactivate, which just hides it) —
// closing the NeroChat tab's ✕ should free its renderer/resources exactly
// like closing a WA profile tab does (see closeProfile), not just hide it
// forever. Re-opening later (setupOllamaView) creates a fresh one.
ipcMain.on('ollama:closeTab', () => {
    if (ollamaView) {
        try { win.contentView.removeChildView(ollamaView); } catch (_) {}
        try { ollamaView.webContents.close(); } catch (_) {}
        ollamaView = null;
    }
    ollamaActive = false;
    layoutViews();
});

// ============================
// IPC — per-chat settings (Sohbet tab)
// ============================
// IDs are stored exactly as WhatsApp serializes them ("123@c.us" /
// "...@g.us"), same as the ! commands. Bare digit input gets @c.us appended
// as a convenience.
function normalizeId(raw) {
    const id = String(raw ?? '').trim();
    if (!id) return null;
    if (id.includes('@')) return id;
    if (/^\d+$/.test(id)) return `${id}@c.us`;
    return id;
}

ipcMain.handle('chats:list', async (_e, profileId) => {
    const session = sessions.get(profileId);
    if (!session || !session.client || !session.botReady) {
        return { ok: false, error: 'Bot henüz hazır değil — bağlantıyı bekle.' };
    }
    if (session.platform === 'telegram') {
        try {
            const dialogs = await session.client.getDialogs({ limit: 300 });
            return {
                ok: true,
                chats: dialogs
                    .filter(d => d.id)
                    .map(d => ({
                        id: d.id.toString(),
                        name: d.name || d.title || d.id.toString(),
                        isGroup: !!(d.isGroup || d.isChannel),
                        active: false, // Telegram has no "chat open in the pane" concept — nothing embedded to be "active" in
                    })),
            };
        } catch (err) {
            console.error(`[${session.name}] Sohbet listesi alınamadı:`, err.message || err);
            return { ok: false, error: err.message || String(err) };
        }
    }
    try {
        // NOT client.getChats(): whatsapp-web.js serializes every chat
        // INCLUDING its last message there, and that message-fetch path
        // (Msg.getMessagesById) throws a DataError on current WhatsApp Web
        // builds — one bad chat took the whole listing down. The picker only
        // needs id/name/isGroup, so read just those straight from the page's
        // Chat collection instead.
        const chats = await session.client.pupPage.evaluate(() => {
            const coll = window.require('WAWebCollections').Chat;
            // The chat currently open in the WhatsApp pane — the settings
            // panel preselects it so "configure THIS chat" is one click.
            let activeId = null;
            try {
                const active = coll.getActive
                    ? coll.getActive()
                    : coll.getModelsArray().find(c => c.active);
                activeId = active ? active.id._serialized : null;
            } catch (_) {}
            return coll.getModelsArray().map(c => ({
                id: c.id._serialized,
                name: c.formattedTitle || c.name || c.id.user,
                isGroup: c.id.server === 'g.us' || !!c.groupMetadata,
                active: activeId !== null && c.id._serialized === activeId,
                t: c.t || 0, // last-activity timestamp, newest first below
            }));
        });
        chats.sort((a, b) => b.t - a.t);
        return {
            ok: true,
            chats: chats.slice(0, 300).map(({ id, name, isGroup, active }) => ({ id, name, isGroup, active })),
        };
    } catch (err) {
        console.error(`[${session.name}] Sohbet listesi alınamadı:`, err.message || err);
        return { ok: false, error: err.message || String(err) };
    }
});

// "Bu sohbeti sor" (NeRoChAt quick popup, see index.html's #neroPopupOverlay)
// — recent messages of whichever WhatsApp chat is currently open in this
// profile's pane. Same caution as chats:list above: deliberately avoids
// whatsapp-web.js's own message-serialization helpers (getMessageModel,
// fetchMessages' id-based pagination via loadEarlierMsgs) since those go
// through the same Msg.getMessagesById path that's known to throw on
// current WhatsApp Web builds — reads raw fields straight off the chat's
// already-loaded chat.msgs collection instead (no id-based re-fetch needed
// for "recent", since WhatsApp Web already keeps a visited chat's recent
// history in memory).
//
// The renderer also uses this (with a larger limit) to populate the
// start/end message pickers for loading a specific range into context —
// see neroPopupChatRangeBar in index.html. There's still just the one
// "however much WhatsApp Web already has in memory" batch under the hood;
// the range picker slices client-side from whatever comes back here rather
// than this handler supporting a second, id-based range fetch.
ipcMain.handle('chat:recentMessages', async (_e, profileId, limit) => {
    const session = sessions.get(profileId);
    if (!session || !session.client || !session.botReady) {
        return { ok: false, error: 'Bot henüz hazır değil — bağlantıyı bekle.' };
    }
    const n = Math.max(1, Math.min(300, Number(limit) || 20));

    if (session.platform === 'telegram') {
        // No "chat open in the pane" concept for Telegram in this app (see
        // chats:list's own comment above) — nothing to auto-resolve to yet.
        return { ok: false, error: 'Telegram için bu özellik henüz desteklenmiyor.' };
    }

    try {
        return await session.client.pupPage.evaluate(async (limit) => {
            const coll = window.require('WAWebCollections').Chat;
            const active = coll.getActive ? coll.getActive() : coll.getModelsArray().find(c => c.active);
            if (!active) return { ok: false, error: 'Şu an açık bir sohbet yok.' };

            const chat = await window.WWebJS.getChat(active.id._serialized, { getAsModel: false });
            const msgs = chat.msgs.getModelsArray()
                .filter(m => !m.isNotification)
                .sort((a, b) => (a.t || 0) - (b.t || 0))
                .slice(-limit);

            return {
                ok: true,
                chatName: active.formattedTitle || active.name || active.id.user,
                messages: msgs.map(m => ({
                    fromMe: !!m.id?.fromMe,
                    author: m.id?.fromMe ? null : (m.author || null),
                    body: m.body || (m.type && m.type !== 'chat' ? `[${m.type}]` : ''),
                    t: m.t || 0,
                })),
            };
        }, n);
    } catch (err) {
        console.error(`[${session.name}] Son mesajlar okunamadı:`, err.message || err);
        return { ok: false, error: err.message || String(err) };
    }
});

// ============================
// Fix-text shortcut (see matchesFixTextShortcut/wireGlobalShortcuts above,
// configurable in Ayarlar → Uygulama as fixTextShortcut) — while a WhatsApp
// view has focus, reads whatever draft the user has typed but not sent,
// asks Ollama for a few corrected/re-toned variants, and shows them right
// under the compose box. Entirely main-process + the WA page itself — no
// renderer round-trip, unlike the NeRoChAt popup shortcut, since there's
// nothing for index.html to display here.
//
// Nothing in this codebase has ever touched WhatsApp Web's own compose box
// before (the bot always sends via client.sendMessage(), never by typing
// into the human's UI) — these selectors are a best-effort guess, not
// something proven against a live session; may need adjusting.
// ============================
const COMPOSE_BOX_SELECTORS = [
    '#main footer div[contenteditable="true"]',
    'footer div[contenteditable="true"]',
    'div[contenteditable="true"][data-tab]',
];

const FIX_TEXT_PROMPT = `You are a writing assistant. The user will give you a draft WhatsApp message (in whatever language it's written in). Return ONLY a JSON object with five keys — "plain" (same wording, just spelling/grammar/punctuation fixed, same tone), "formal" (same meaning, rewritten in a more formal/polite tone), "casual" (same meaning, rewritten in a relaxed/friendly tone), "flirty" (same meaning, rewritten in a playful/flirtatious tone), "playful" (same meaning, rewritten in a witty/humorous tone) — each a string in the same language as the input. Punctuation must be correct and consistent in every single variant, no exceptions. Never insert an apostrophe just to sound casual — if the text is Turkish, only use one where Turkish orthography actually requires it (attaching a suffix to a proper noun, a number, or an abbreviation, e.g. "Ahmet'e", "2024'te"); a random or ungrammatical apostrophe reads as fake and robotic, not human, so when in doubt leave it out entirely. Never add an emoji to any variant unless the original draft already contains at least one emoji itself — if the draft has none, none of your variants may add any either. Do not add commentary, do not change the meaning. Example: {"plain":"...","formal":"...","casual":"...","flirty":"...","playful":"..."}`;

async function readComposeBoxText(session) {
    return session.client.pupPage.evaluate((selectors) => {
        const box = selectors.map(s => document.querySelector(s)).find(Boolean);
        return box ? box.innerText.trim() : '';
    }, COMPOSE_BOX_SELECTORS);
}

// Shown the instant the shortcut fires (or auto-mode notices a pause), well
// before Ollama has replied — a bare spinner + label, replaced by
// injectFixTextOverlay's real suggestions once they're in, or removed
// outright if the request fails. Without this the whole thing looked dead
// for however long the model took to respond.
//
// Fixed black/orange styling (not theme-adaptive — same palette regardless
// of whether WhatsApp Web itself is in light or dark mode; see
// injectFixTextOverlay below for the identical palette on the real
// suggestion box).
async function injectLoadingOverlay(session) {
    return session.client.pupPage.evaluate((selectors) => {
        document.getElementById('nerobotFixTextOverlay')?.remove();
        const box = selectors.map(s => document.querySelector(s)).find(Boolean);
        if (!box) return false;

        const theme = { bg: '#000000', border: '#ff9800', sub: '#ffb74d', spinnerTrack: '#ff980055', shadow: '0 4px 16px #000c' };

        const rect = box.getBoundingClientRect();
        const overlay = document.createElement('div');
        overlay.id = 'nerobotFixTextOverlay';
        overlay.style.cssText = `position:fixed; left:${rect.left}px; width:${rect.width}px; top:${rect.top}px; transform:translateY(-100%); background:${theme.bg}; border:1px solid ${theme.border}; border-radius:8px; padding:10px 14px; z-index:99999; font-family:sans-serif; font-size:13px; color:${theme.sub}; box-shadow:${theme.shadow}; display:flex; align-items:center; gap:8px;`;
        overlay.innerHTML = `<style>@keyframes nerobotFixTextSpin{to{transform:rotate(360deg)}}</style><div style="width:14px;height:14px;border:2px solid ${theme.spinnerTrack};border-top-color:${theme.sub};border-radius:50%;animation:nerobotFixTextSpin .7s linear infinite;flex:0 0 auto;"></div><span>Düzeltmeler hazırlanıyor…</span>`;
        document.body.appendChild(overlay);

        // Typing again (or hitting Enter, which sends the message) means
        // whatever's about to show is either already stale or about to be
        // moot — close right away instead of leaving it sitting there.
        const closeOnActivity = (e) => {
            if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== 'Backspace') return;
            overlay.remove();
            box.removeEventListener('input', closeOnActivity);
            box.removeEventListener('keydown', closeOnActivity);
        };
        box.addEventListener('input', closeOnActivity);
        box.addEventListener('keydown', closeOnActivity);
        return true;
    }, COMPOSE_BOX_SELECTORS);
}

async function removeFixTextOverlay(session) {
    return session.client.pupPage.evaluate(() => {
        document.getElementById('nerobotFixTextOverlay')?.remove();
    });
}

// Cheap heuristic, not a real language detector: if the draft itself has
// non-ASCII letters (very common in Turkish — ç ğ ı ö ş ü İ) but every
// variant the model wrote back is plain ASCII, that's a strong sign the
// model ignored FIX_TEXT_PROMPT's "reply in the same language as the input"
// and defaulted to English — something smaller/local models do noticeably
// more often than the profile's actual configured (often larger, cloud)
// model. Only meaningful when the draft has something non-ASCII to compare
// against in the first place.
function looksLikeLanguageMismatch(draft, variants) {
    if (!/[^\x00-\x7F]/.test(draft)) return false;
    const values = Object.values(variants).filter(v => typeof v === 'string' && v);
    return values.length > 0 && values.every(v => !/[^\x00-\x7F]/.test(v));
}

// Same "one-off chat call, parse a JSON blob out of the reply, fail quiet"
// shape as ollama:classifyImageIntent above — this is a convenience
// shortcut, not a core bot feature, so any failure here just means no
// overlay shows up rather than an error the user has to dismiss.
async function requestTextCorrections(model, draft) {
    try {
        const response = await ollamaClient.chat({
            model,
            messages: [
                { role: 'system', content: FIX_TEXT_PROMPT },
                { role: 'user', content: draft },
            ],
        });
        const match = response.message.content.match(/\{[\s\S]*\}/);
        if (!match) return null;
        const parsed = JSON.parse(match[0]);
        if (!parsed.plain && !parsed.formal && !parsed.casual && !parsed.flirty && !parsed.playful) return null;
        return parsed;
    } catch (err) {
        console.error('[fixText] Ollama error:', err.message || err);
        return null;
    }
}

// Runs through pickClassifierModel (ai.js) same as classifyImageIntent
// does, gated behind fixTextUseLocalModel (Ayarlar → Uygulama, default on)
// — the profile's actual configured model is often a cloud/metered one
// (this app's own default, minimax-m3:cloud, included), and this rewrite
// isn't the real reply the user reads, just a convenience side-feature, so
// it prefers whatever's already pulled locally instead of spending that
// allowance (and a local model is also just plain faster to reach — no
// network round-trip). If the local attempt comes back empty, or
// (heuristically) wrote English back for a non-English draft, retries once
// against the actual configured model instead of settling for a bad
// result — a small/local model is more likely to ignore the
// "same language as the input" instruction than the user's real pick.
async function getTextCorrections(session, draft) {
    const preferredModel = session.store?.state?.aiModel;
    if (!preferredModel) return null;

    const useLocal = readAppConfig().fixTextUseLocalModel !== false;
    const model = useLocal ? await pickClassifierModel(preferredModel) : preferredModel;

    let result = await requestTextCorrections(model, draft);
    if (useLocal && model !== preferredModel && (!result || looksLikeLanguageMismatch(draft, result))) {
        result = (await requestTextCorrections(preferredModel, draft)) || result;
    }
    return result;
}

// Injects a small suggestion box anchored just above the compose box.
// Clicking a row writes that variant into the box — see insertIntoComposeBox
// below for why that's more than a one-liner. Dismisses on an outside click
// or after 20s so a stale, ignored overlay never lingers indefinitely.
async function injectFixTextOverlay(session, variants) {
    return session.client.pupPage.evaluate((variants, selectors) => {
        document.getElementById('nerobotFixTextOverlay')?.remove();
        const box = selectors.map(s => document.querySelector(s)).find(Boolean);
        if (!box) return false;

        const theme = { bg: '#000000', border: '#ff9800', text: '#ffffff', hoverBg: '#ff980033', shadow: '0 4px 16px #000c' };

        // Re-finds the compose box fresh at click time instead of reusing
        // the reference captured when the overlay was built — WhatsApp Web
        // can swap out that node (chat switch, a message just sent) between
        // the two, and focusing/writing into a detached node silently does
        // nothing, which is exactly the "picking a suggestion does nothing"
        // symptom this replaces.
        //
        // A plain select-all + execCommand('insertText') is the whole thing
        // — it's a single, atomic native edit that WhatsApp's own React/
        // Lexical editor observes and reconciles against on its own. An
        // earlier version of this also manually wrote .textContent as a
        // "fallback" on top of that, which was the actual cause of the
        // draft showing up duplicated (WhatsApp's editor already reconciled
        // its own copy from the execCommand edit, then the manual write
        // added a second, untracked copy next to it) — so that fallback is
        // gone, not added back.
        function insertIntoComposeBox(text) {
            const liveBox = selectors.map(s => document.querySelector(s)).find(Boolean);
            if (!liveBox) return;
            liveBox.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, text);
        }

        const rect = box.getBoundingClientRect();
        const overlay = document.createElement('div');
        overlay.id = 'nerobotFixTextOverlay';
        overlay.style.cssText = `position:fixed; left:${rect.left}px; width:${rect.width}px; top:${rect.top}px; transform:translateY(-100%); background:${theme.bg}; border:1px solid ${theme.border}; border-radius:8px; padding:6px; z-index:99999; font-family:sans-serif; font-size:13px; color:${theme.text}; box-shadow:${theme.shadow};`;

        const rows = [
            ['plain', 'Düzeltilmiş'],
            ['formal', 'Resmi'],
            ['casual', 'Samimi'],
            ['flirty', 'Flörtöz'],
            ['playful', 'Esprili'],
        ];
        for (const [key, label] of rows) {
            if (!variants[key]) continue;
            const row = document.createElement('div');
            row.style.cssText = 'padding:8px 10px; border-radius:6px; cursor:pointer; margin-bottom:2px;';
            row.innerHTML = `<b>${label}:</b> ${variants[key]}`;
            row.onmouseenter = () => row.style.background = theme.hoverBg;
            row.onmouseleave = () => row.style.background = 'transparent';
            row.onclick = () => {
                insertIntoComposeBox(variants[key]);
                overlay.remove();
            };
            overlay.appendChild(row);
        }

        document.body.appendChild(overlay);
        // Dismiss on an outside click, or on typing/Enter (see
        // closeOnActivity below) — no forced timeout otherwise: once these
        // suggestions are up, they were worth generating, so they stay put
        // until the user actually does something instead of vanishing on
        // their own while still being read.
        const dismiss = (e) => { if (!overlay.contains(e.target)) { overlay.remove(); document.removeEventListener('mousedown', dismiss); } };
        setTimeout(() => document.addEventListener('mousedown', dismiss), 0);

        // Typing again, or hitting Enter (which sends the message), means
        // these suggestions are for a draft that's already changed or gone
        // — close instead of leaving stale options sitting there. Also
        // fires from insertIntoComposeBox's own execCommand above (that's a
        // real 'input' event too), which is harmless — the row's onclick
        // already removes the overlay itself, this is just a no-op second
        // removal in that case.
        const closeOnActivity = (e) => {
            if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== 'Backspace') return;
            overlay.remove();
            box.removeEventListener('input', closeOnActivity);
            box.removeEventListener('keydown', closeOnActivity);
        };
        box.addEventListener('input', closeOnActivity);
        box.addEventListener('keydown', closeOnActivity);
        return true;
    }, variants, COMPOSE_BOX_SELECTORS);
}

async function handleFixTextShortcut(session) {
    if (!session.client || !session.botReady) return;
    const draft = await readComposeBoxText(session);
    if (!draft) return;
    await injectLoadingOverlay(session);
    const variants = await getTextCorrections(session, draft);
    if (!variants) {
        await removeFixTextOverlay(session);
        return;
    }
    // Only bail here if the message is actually gone (sent, or cleared) —
    // an earlier version compared the draft for an *exact* match instead,
    // which any harmless WhatsApp-side re-render (not necessarily the user
    // typing at all) could nudge just enough to trip, quietly dropping a
    // perfectly good result and leaving the loading spinner's disappearance
    // as the only thing that ever happened — exactly the "it thinks, then
    // does nothing and closes" symptom. If the user genuinely kept typing,
    // the overlay's own close-on-activity listener (see injectFixTextOverlay)
    // hides it the instant they type again anyway, so there's no need to
    // pre-emptively guess "did they change it" here at all.
    const currentDraft = await readComposeBoxText(session);
    if (!currentDraft) {
        await removeFixTextOverlay(session);
        return;
    }
    await injectFixTextOverlay(session, variants);
}

// "Otomatik Düzeltme" (Ayarlar → Uygulama, fixTextAutoMode) — same
// suggestion flow as the shortcut, just triggered by a typing pause instead
// of a keypress. No page→Node callback wiring (no precedent for that
// anywhere in this codebase, e.g. exposeFunction) — plain polling instead,
// same idiom every other pupPage.evaluate call here already uses. Every
// tick, each open WhatsApp session's draft is compared to what it was last
// tick: unchanged across two consecutive ticks reads as "stopped typing"
// (a ~1.5-3s pause depending on where in the interval the last keystroke
// landed), and a draft is only ever suggested-for once, not on every idle
// tick after that.
const FIX_TEXT_AUTO_POLL_MS = 1500;
setInterval(async () => {
    if (!readAppConfig().fixTextAutoMode) return;
    for (const session of sessions.values()) {
        if (session.platform === 'telegram' || !session.client || !session.botReady) continue;
        try {
            const draft = await readComposeBoxText(session);
            const auto = session._fixTextAuto || (session._fixTextAuto = { lastSeen: '', lastSuggested: '' });
            if (!draft) {
                auto.lastSeen = '';
                continue;
            }
            if (draft === auto.lastSeen && draft !== auto.lastSuggested) {
                auto.lastSuggested = draft;
                await handleFixTextShortcut(session);
            } else {
                auto.lastSeen = draft;
            }
        } catch (_) {}
    }
}, FIX_TEXT_AUTO_POLL_MS);

// ============================
// IPC — notification panel (see pushNotification above) + its quick-reply
// ============================
ipcMain.handle('notif:list', () => notifications);

ipcMain.handle('notif:markRead', (_e, ids) => {
    const idSet = new Set(ids);
    notifications = notifications.filter(n => !idSet.has(n.id));
    return notifications;
});

ipcMain.handle('notif:markProfileRead', (_e, profileId) => {
    notifications = notifications.filter(n => n.profileId !== profileId);
    return notifications;
});

// The notification panel's inline reply box — same sendText every ! command
// and AI reply already goes through (session.utils, returned by createBot/
// createTelegramBot — see bot.js/telegram-bot.js), just triggered by hand
// instead of a command/AI response.
ipcMain.handle('chat:send', async (_e, profileId, chatId, text) => {
    const session = sessions.get(profileId);
    if (!session || !session.utils) return { ok: false, error: 'Bot henüz hazır değil — bağlantıyı bekle.' };
    try {
        await session.utils.sendText(chatId, text);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
});

// A chat can be known under two IDs (@lid and @c.us) — read and write
// against every known form so entries stored under either keep working.
async function chatIdForms(session, chatId) {
    return session.utils.idVariants(chatId);
}

async function chatSnapshot(session, chatId) {
    const store = session.store;
    const ids = await chatIdForms(session, chatId);
    const has = set => ids.some(id => set.has(id));
    const get = obj => ids.map(id => obj[id]).find(v => v !== undefined) || '';
    // A custom personality is chatHistories[id][0] (the system-role entry) —
    // '' means "no override, using the global systemPrompt", mirroring how
    // Personality's "chat" subcommand and resetSingleChatSetting() treat it.
    const personalityId = ids.find(id => store.chatHistories[id]);
    return {
        model: get(store.chatModels),
        prefix: get(store.chatPrefixes),
        noPrefix: has(store.noPrefixChats),
        group: has(store.groupChats),
        whitelisted: has(store.whitelist),
        blacklisted: has(store.blacklist),
        hasMemory: ids.some(id => !!store.chatHistories[id]),
        personality: personalityId ? store.chatHistories[personalityId][0].content : '',
        // Only one chat can hold the fixed-chat lock at a time — this reads
        // back true only for whichever chat state.activeChatId currently is.
        fixed: store.state.fixedMode && ids.includes(store.state.activeChatId),
    };
}

ipcMain.handle('chat:get', (_e, profileId, chatId) => chatSnapshot(requireSession(profileId), chatId));

ipcMain.handle('chat:set', async (_e, profileId, chatId, updates) => {
    const session = requireSession(profileId);
    const store = session.store;
    const ids = await chatIdForms(session, chatId);
    // Enabling stores the ID the UI is using; disabling/overwriting clears
    // EVERY known form, so a stale @c.us entry can't linger next to the
    // @lid one (or vice versa).
    const setMembership = (set, on) => {
        ids.forEach(id => set.delete(id));
        if (on) set.add(chatId);
    };

    // A chat can't be both whitelisted and blacklisted — turning one on
    // while the other already holds this chat needs the caller to say
    // `force` (the UI asks the user to confirm first); otherwise bail out
    // with a conflict marker and leave everything untouched.
    if (updates.whitelisted === true && !updates.force && ids.some(id => store.blacklist.has(id))) {
        return { ...(await chatSnapshot(session, chatId)), conflict: 'blacklist' };
    }
    if (updates.blacklisted === true && !updates.force && ids.some(id => store.whitelist.has(id))) {
        return { ...(await chatSnapshot(session, chatId)), conflict: 'whitelist' };
    }

    if ('noPrefix' in updates) {
        setMembership(store.noPrefixChats, updates.noPrefix);
        store.saveNoPrefixChats();
    }
    if ('group' in updates) {
        setMembership(store.groupChats, updates.group);
        store.saveGroupChats();
    }
    if ('whitelisted' in updates) {
        if (updates.whitelisted) {
            ids.forEach(id => store.blacklist.delete(id));
            store.saveBlacklist();
        }
        setMembership(store.whitelist, updates.whitelisted);
        store.saveWhitelist();
    }
    if ('blacklisted' in updates) {
        if (updates.blacklisted) {
            ids.forEach(id => store.whitelist.delete(id));
            store.saveWhitelist();
        }
        setMembership(store.blacklist, updates.blacklisted);
        store.saveBlacklist();
    }
    if ('model' in updates) {
        const model = String(updates.model).trim();
        ids.forEach(id => delete store.chatModels[id]);
        if (model) store.chatModels[chatId] = model;
        store.saveChatModels();
    }
    if ('prefix' in updates) {
        const prefix = String(updates.prefix).trim();
        ids.forEach(id => delete store.chatPrefixes[id]);
        if (prefix) store.chatPrefixes[chatId] = prefix;
        store.saveChatPrefixes();
    }
    if ('personality' in updates) {
        const text = String(updates.personality).trim();
        const existingId = ids.find(id => store.chatHistories[id]);
        if (!text) {
            // Empty → drop the custom personality, fall back to global
            // (matches resetSingleChatSetting('personality')), but keep the
            // rest of this chat's memory intact — only its system entry
            // stops being a per-chat override.
            if (existingId) store.chatHistories[existingId][0].content = store.state.systemPrompt;
        } else if (existingId) {
            store.chatHistories[existingId][0].content = text;
        } else {
            store.chatHistories[chatId] = [{ role: 'system', content: text }];
        }
    }
    if ('fixed' in updates) {
        if (updates.fixed) {
            store.state.fixedMode = true;
            store.state.activeChatId = chatId;
        } else if (store.state.fixedMode && ids.includes(store.state.activeChatId)) {
            store.state.fixedMode = false;
            store.state.activeChatId = null;
        }
        // fixedMode/activeChatId are intentionally not persisted (runtime-only)
    }
    if (updates.clearMemory) {
        ids.forEach(id => delete store.chatHistories[id]);
    }

    console.log(`[${session.name}] Sohbet ayarı güncellendi: ${chatId}`);
    return chatSnapshot(session, chatId);
});

// ============================
// IPC — list management (Listeler tab)
// ============================
function getListRegistry(session) {
    const store = session.store;
    return {
        whitelist: { set: store.whitelist, save: store.saveWhitelist },
        blacklist: { set: store.blacklist, save: store.saveBlacklist },
        admins:    { set: store.admins, save: store.saveAdmins },
        noprefix:  { set: store.noPrefixChats, save: store.saveNoPrefixChats },
        group:     { set: store.groupChats, save: store.saveGroupChats },
    };
}

// Attach display names to stored list IDs. Names come from the open chat
// collection; a stored @c.us entry is matched through its @lid alias (and
// vice versa). Purely cosmetic — on any failure the plain IDs still show.
async function namedListEntries(session, ids) {
    const result = ids.map(id => ({ id, name: '' }));
    if (!session.client || !session.botReady) return result;
    try {
        const chats = await session.client.pupPage.evaluate(() =>
            window.require('WAWebCollections').Chat.getModelsArray()
                .map(c => ({ id: c.id._serialized, name: c.formattedTitle || c.name || '' })));
        const names = Object.fromEntries(chats.map(c => [c.id, c.name]));
        for (const entry of result) {
            for (const v of await chatIdForms(session, entry.id)) {
                if (names[v]) { entry.name = names[v]; break; }
            }
        }
    } catch (_) {}
    return result;
}

ipcMain.handle('lists:get', (_e, profileId, name) => {
    const session = requireSession(profileId);
    const entry = getListRegistry(session)[name];
    return entry ? namedListEntries(session, [...entry.set]) : [];
});

// whitelist and blacklist are mutually exclusive — maps each to the other
// so lists:add can check/clear the opposite list.
const CROSS_LIST = { whitelist: 'blacklist', blacklist: 'whitelist' };

ipcMain.handle('lists:add', async (_e, profileId, name, rawId, force) => {
    const session = requireSession(profileId);
    const registry = getListRegistry(session);
    const entry = registry[name];
    if (!entry) return { entries: [], conflict: null };
    const id = normalizeId(rawId);
    if (id) {
        // Skip if the same chat is already listed under its other ID form
        // (@lid vs @c.us) — one entry per chat is enough now that every
        // lookup is alias-aware.
        const ids = await chatIdForms(session, id);
        if (!ids.some(v => entry.set.has(v))) {
            const crossName = CROSS_LIST[name];
            const cross = crossName ? registry[crossName] : null;
            if (cross && ids.some(v => cross.set.has(v))) {
                if (!force) {
                    return { entries: await namedListEntries(session, [...entry.set]), conflict: crossName };
                }
                ids.forEach(v => cross.set.delete(v));
                cross.save();
            }
            entry.set.add(id);
            entry.save();
            console.log(`[${session.name}] Listeye eklendi (${name}): ${id}`);
        }
    }
    return { entries: await namedListEntries(session, [...entry.set]), conflict: null };
});

ipcMain.handle('lists:remove', async (_e, profileId, name, id) => {
    const session = requireSession(profileId);
    const entry = getListRegistry(session)[name];
    if (!entry) return [];
    // Remove every known form of the ID, not just the exact string shown.
    const ids = await chatIdForms(session, id);
    let removed = false;
    for (const v of ids) removed = entry.set.delete(v) || removed;
    if (removed) {
        entry.save();
        console.log(`[${session.name}] Listeden silindi (${name}): ${id}`);
    }
    return namedListEntries(session, [...entry.set]);
});

// Empties an entire list in one go — mirrors !whitelist reset / !blacklist
// reset / !admin reset (noprefix/group don't have a command-level reset
// today, but exposing "clear all" for every list here is harmless reuse of
// the same handler).
ipcMain.handle('lists:clear', (_e, profileId, name) => {
    const session = requireSession(profileId);
    const entry = getListRegistry(session)[name];
    if (!entry) return [];
    entry.set.clear();
    entry.save();
    console.log(`[${session.name}] Liste tamamen temizlendi: ${name}`);
    return namedListEntries(session, [...entry.set]);
});

// For the WhatsApp-info tab — both known ID forms (@c.us / @lid) of a chat,
// so the user can copy either into the Listeler tab.
ipcMain.handle('chat:idVariants', (_e, profileId, chatId) => {
    const session = requireSession(profileId);
    return chatIdForms(session, chatId);
});

// ============================
// Auto-update — checked once at every startup, BEFORE the window opens (see
// app.whenReady() below), against this repo's GitHub Releases (see
// package.json's build.publish + release.js, which is what actually
// uploads a new version there). Two separate timeouts, same reasoning as
// installOllama's (see ollama-installer.js): a stalled network must never
// leave the app stuck on a blank screen forever — 15s just to learn WHETHER
// a newer version exists (give up and open normally if that's slow/
// unreachable), up to 5 minutes to actually download one once we know it's
// there (give up and open the CURRENT version if THAT stalls instead).
// Gated on app.isPackaged in app.whenReady() below: there's no installed
// NSIS app for electron-updater to update in place during a dev run (`npm
// start`), and no bundled app-update.yml outside a real build either.
// ============================
autoUpdater.autoDownload = false; // this file drives download/install by hand, below

function checkForUpdate() {
    return new Promise((resolve, reject) => {
        autoUpdater.once('update-available', () => resolve(true));
        autoUpdater.once('update-not-available', () => resolve(false));
        autoUpdater.once('error', reject);
        autoUpdater.checkForUpdates().catch(reject);
    });
}

function downloadAndInstallUpdate() {
    return new Promise((resolve, reject) => {
        autoUpdater.once('update-downloaded', () => {
            // true = silent (no NSIS UI), true = relaunch NeRoBoT once the
            // update's applied — "kapatıp güncelleyip öyle açsın kendini"
            // (close it, update it, then open itself).
            autoUpdater.quitAndInstall(true, true);
            resolve();
        });
        autoUpdater.once('error', reject);
        autoUpdater.downloadUpdate();
    });
}

// Resolves true if an update was found, downloaded, and quitAndInstall()
// was called — the caller should stop right there, the app's on its way
// out. Resolves false if there's nothing new, or the check/download
// failed/timed out for any reason — the caller should just continue
// starting up normally on the CURRENT version either way, never block on
// this longer than the timeouts above allow.
async function checkAndApplyUpdate() {
    let hasUpdate;
    try {
        hasUpdate = await Promise.race([
            checkForUpdate(),
            new Promise((resolve) => setTimeout(() => resolve(false), 15000)),
        ]);
    } catch (err) {
        console.error('[NeRoBoT] Güncelleme kontrolü başarısız, normal açılışa devam ediliyor:', err.message || err);
        return false;
    }
    if (!hasUpdate) return false;

    try {
        await Promise.race([
            downloadAndInstallUpdate(),
            new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Güncelleme indirme zaman aşımına uğradı.')), 5 * 60 * 1000)),
        ]);
        return true;
    } catch (err) {
        console.error('[NeRoBoT] Güncelleme indirilemedi, mevcut sürümle devam ediliyor:', err.message || err);
        return false;
    }
}

// ============================
// App lifecycle
// ============================
app.whenReady().then(async () => {
    // Headless hook for the NSIS installer's best-effort Ollama install
    // (see build/installer.nsh's customInstall macro — Exec, not ExecWait,
    // so a slow/absent network or a stuck install HERE can never stall the
    // main installer window). Safe to no-op: if this fails or is skipped,
    // the in-app "AI Bot" toggle / Ollama tile gate (renderer's
    // ensureOllamaOrPrompt) prompts the user to install it later anyway.
    // installOllama() has its own internal timeouts now (see
    // ollama-installer.js), but this outer race is a second safety net so
    // THIS headless process specifically can never outlive its usefulness
    // sitting in the background, even if some future change to that
    // function reintroduces a hang.
    if (process.argv.includes('--install-ollama')) {
        await Promise.race([
            installOllama(),
            new Promise((resolve) => setTimeout(resolve, 3 * 60 * 1000)),
        ]);
        app.quit();
        return;
    }

    // See checkAndApplyUpdate's own doc above — only meaningful for a real
    // installed build (app.isPackaged), and skipped for TEST_MODE (headless
    // test runs shouldn't ever quit-and-relaunch themselves).
    if (app.isPackaged && !TEST_MODE) {
        const updating = await checkAndApplyUpdate();
        if (updating) return; // quitAndInstall() already tore the app down
    }

    await createWindow();
    patchPuppeteerConnect();
    devToolsPort = await getDevToolsPort();
    // No auto-start — the renderer opens on the Home screen and the user
    // picks (or creates) a profile to open.
});

app.on('window-all-closed', () => app.quit());
