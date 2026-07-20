import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Registry of WhatsApp "profiles" (accounts) + the one-time migration of a
// pre-multi-profile install's flat NeRoBoT_db/*.json files into the first
// profile. Every function here takes an absolute `dbDir` (NeRoBoT_db/) —
// no cwd dependence, same spirit as config.js's per-profile store.

const REGISTRY_FILE = 'profiles.json';
const PROFILES_SUBDIR = 'profiles';
// Where a Telegram profile's teleproto StringSession is saved — see
// createTelegramProfile below and app/main.js's Telegram profile lifecycle.
export const TELEGRAM_SESSION_FILE = 'telegram-session.txt';

// Files config.js's createProfileStore reads/writes for one profile —
// listed here once so migration and export/import stay in sync with it.
const PROFILE_DATA_FILES = {
    whitelist:     'whitelist.json',
    blacklist:     'blacklist.json',
    admin:         'admin.json',
    noprefix:      'noprefix.json',
    groupchat:     'groupchat.json',
    settings:      'settings.json',
    chatmodels:    'chatmodels.json',
    chatprefixes:  'chatprefixes.json',
};

function registryPath(dbDir) {
    return path.join(dbDir, REGISTRY_FILE);
}

function profileDir(dbDir, id) {
    return path.join(dbDir, PROFILES_SUBDIR, id);
}

function readRegistry(dbDir) {
    try {
        return JSON.parse(fs.readFileSync(registryPath(dbDir), 'utf8'));
    } catch {
        return null;
    }
}

function writeRegistry(dbDir, profiles) {
    fs.mkdirSync(dbDir, { recursive: true });
    fs.writeFileSync(registryPath(dbDir), JSON.stringify(profiles, null, 2));
}

// Moves the legacy flat NeRoBoT_db/*.json files (if any) into a new first
// profile, keeping the EXISTING Electron session partition name
// (`persist:nerobot-wa`) so the already-logged-in WhatsApp session survives
// the upgrade without a QR re-scan. Only ever runs once — subsequent
// startups find profiles.json and skip straight past this.
function migrateLegacyProfile(dbDir) {
    const hasLegacyData = Object.values(PROFILE_DATA_FILES)
        .some(file => fs.existsSync(path.join(dbDir, file)));

    const id = crypto.randomUUID();
    const dir = profileDir(dbDir, id);
    fs.mkdirSync(dir, { recursive: true });

    if (hasLegacyData) {
        for (const file of Object.values(PROFILE_DATA_FILES)) {
            const from = path.join(dbDir, file);
            if (fs.existsSync(from)) {
                fs.renameSync(from, path.join(dir, file));
            }
        }
    }

    const profiles = [{
        id,
        name: 'NeRoBoT',
        createdAt: Date.now(),
        platform: 'whatsapp',
        sessionPartition: 'persist:nerobot-wa',
    }];
    writeRegistry(dbDir, profiles);
    return profiles;
}

// Returns the profile list, migrating a legacy flat install into the first
// profile (once) or seeding an empty registry (fresh install) if needed.
// Every entry predating multi-platform support has no `platform` field at
// all — backfilled to 'whatsapp' here rather than in a one-time migration,
// so nothing needs to touch every caller of loadProfiles() to stay correct.
// Same story for `connectionMode` (predates the Bot/Web/Both split): a
// WhatsApp profile that predates it always had both the view and the bot
// (there was no other option), so it backfills to 'both'; a Telegram
// profile that predates it only ever had the headless bot (no embedded
// view existed yet), so it backfills to 'bot' — both preserve exactly what
// that profile already did before this field existed.
export function loadProfiles(dbDir) {
    const existing = readRegistry(dbDir);
    const profiles = existing || migrateLegacyProfile(dbDir);
    for (const p of profiles) {
        if (!p.platform) p.platform = 'whatsapp';
        if (!p.connectionMode) p.connectionMode = p.platform === 'telegram' ? 'bot' : 'both';
    }
    return profiles;
}

function saveProfiles(dbDir, profiles) {
    writeRegistry(dbDir, profiles);
    return profiles;
}

export function createProfile(dbDir, name, mode) {
    const profiles = loadProfiles(dbDir);
    const id = crypto.randomUUID();
    fs.mkdirSync(profileDir(dbDir, id), { recursive: true });
    const entry = {
        id,
        name: String(name || 'NeRoBoT').trim() || 'NeRoBoT',
        createdAt: Date.now(),
        platform: 'whatsapp',
        sessionPartition: `persist:nerobot-wa-${id}`,
        // 'bot' | 'web' | 'both' — see app/main.js's openProfile(). For
        // WhatsApp this only ever gates whether bot.js's message listeners
        // are attached; the embedded page itself always exists either way
        // (whatsapp-web.js needs it to drive the session at all), so 'bot'
        // and 'both' behave identically here.
        connectionMode: mode === 'bot' || mode === 'web' ? mode : 'both',
    };
    profiles.push(entry);
    saveProfiles(dbDir, profiles);
    return { profiles, entry };
}

// Telegram profiles also get a session partition now (used by the embedded
// web.telegram.org view for connectionMode 'web'/'both' — see
// setupTelegramView in app/main.js). The bot's own login (teleproto's
// StringSession) is separate either way, and still lives in this profile's
// own directory as a portable file (TELEGRAM_SESSION_FILE, written by
// main.js after a successful QR login) — the two logins are independent
// MTProto connections, not something a partition and a session file could
// share even if they were unified.
export function createTelegramProfile(dbDir, name, mode) {
    const profiles = loadProfiles(dbDir);
    const id = crypto.randomUUID();
    fs.mkdirSync(profileDir(dbDir, id), { recursive: true });
    const entry = {
        id,
        name: String(name || 'Telegram').trim() || 'Telegram',
        createdAt: Date.now(),
        platform: 'telegram',
        sessionPartition: `persist:nerobot-tg-${id}`,
        connectionMode: mode === 'web' || mode === 'both' ? mode : 'bot',
    };
    profiles.push(entry);
    saveProfiles(dbDir, profiles);
    return { profiles, entry };
}

// Changing an existing profile's connectionMode (Profil Yönetimi in the
// settings drawer, see app/main.js's profiles:setMode) — just updates the
// registry; the caller is responsible for closing/reopening the profile's
// live session (if any) so the new mode actually takes effect, same as any
// other on-disk setting a running session wouldn't otherwise notice.
export function setProfileMode(dbDir, id, mode) {
    const profiles = loadProfiles(dbDir);
    const entry = profiles.find(p => p.id === id);
    if (!entry) return profiles;
    if (['bot', 'web', 'both'].includes(mode)) entry.connectionMode = mode;
    saveProfiles(dbDir, profiles);
    return profiles;
}

export function renameProfile(dbDir, id, name) {
    const profiles = loadProfiles(dbDir);
    const entry = profiles.find(p => p.id === id);
    if (!entry) return profiles;
    entry.name = String(name || '').trim() || entry.name;
    saveProfiles(dbDir, profiles);
    return profiles;
}

// Removes the profile's registry entry and its on-disk data directory
// (which for a Telegram profile also deletes its saved login session file,
// logging it out locally — but NOT on Telegram's servers; the caller
// should call client.logOut() first if a full remote logout is wanted).
// Does NOT touch a WhatsApp profile's Electron session partition — the
// caller (main.js, which owns the `session` module) must clear that itself
// using the returned entry's `sessionPartition`, and must make sure the
// profile's tab/session is already closed before calling this.
export function deleteProfile(dbDir, id) {
    const profiles = loadProfiles(dbDir);
    const idx = profiles.findIndex(p => p.id === id);
    if (idx === -1) return { profiles, removed: null };
    const [removed] = profiles.splice(idx, 1);
    saveProfiles(dbDir, profiles);
    fs.rmSync(profileDir(dbDir, id), { recursive: true, force: true });
    return { profiles, removed };
}

// Bundles a profile's config (not its WhatsApp session — that lives in the
// Electron partition, not a portable file) into one plain object suitable
// for JSON.stringify to a user-chosen file.
export function exportProfile(dbDir, id) {
    const profiles = loadProfiles(dbDir);
    const entry = profiles.find(p => p.id === id);
    if (!entry) return null;
    const dir = profileDir(dbDir, id);
    const data = {};
    for (const [key, file] of Object.entries(PROFILE_DATA_FILES)) {
        const filePath = path.join(dir, file);
        try {
            data[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
            data[key] = null;
        }
    }
    return { name: entry.name, exportedAt: Date.now(), data };
}

// Overwrites an EXISTING profile's config/lists with a previously-exported
// bundle — the profile's identity (id, name, WhatsApp session/partition)
// is untouched, only its whitelist/blacklist/admins/settings/etc. files are
// replaced. If that profile currently has a live session, the caller
// (main.js) is responsible for reloading/restarting it so the running bot
// picks up the overwritten data instead of stale in-memory state.
export function overwriteProfile(dbDir, id, bundle) {
    const profiles = loadProfiles(dbDir);
    const entry = profiles.find(p => p.id === id);
    if (!entry) return { profiles, entry: null };
    const dir = profileDir(dbDir, id);
    const data = bundle?.data || {};
    for (const [key, file] of Object.entries(PROFILE_DATA_FILES)) {
        if (data[key] !== undefined && data[key] !== null) {
            fs.writeFileSync(path.join(dir, file), JSON.stringify(data[key], null, 2));
        }
    }
    return { profiles, entry };
}

export function getProfileDir(dbDir, id) {
    return profileDir(dbDir, id);
}
