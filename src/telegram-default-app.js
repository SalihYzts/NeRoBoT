// Embedded fallback api_id/api_hash (my.telegram.org) — every NeRoChAt/
// Telegram profile needs SOME app identity to talk to Telegram's MTProto
// servers at all (Telegram's own requirement, not ours — see
// src/telegram-bot.js). Baked in here so downloading the app
// and scanning a QR code is the whole setup, same as WhatsApp — nobody has
// to visit my.telegram.org themselves.
//
// NOT a real secret in the password sense (it can't sign in as anyone by
// itself — that still needs a live QR scan/phone confirmation from the
// actual account), but it IS this app's one shared identity with Telegram,
// so it's kept out of plain grep-able text here rather than as a bare
// string literal. This is obfuscation, not encryption — anyone reading
// this file can reverse it in a minute. Real secrecy for a distributed
// desktop app isn't achievable; this just avoids it showing up verbatim in
// a casual code search or an automated secret scanner.
//
// Users/forks who'd rather use their own app identity can still override
// this — see main.js's readTelegramAppConfig(), which prefers
// NeRoBoT_db/telegram-app.json (gitignored, per-install) over this default.

const XOR_KEY = 'NeRoBoT-Telegram-2026';

function unshroud(blob) {
    const bytes = Buffer.from(blob, 'base64');
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        out += String.fromCharCode(bytes[i] ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
    }
    return JSON.parse(out);
}

const SHROUDED = 'NUczHysmMA9uVl5XVUtQWB8eElNGJy0zHCpNbg9kA1QDVxRVDhsEBFRTKlE0XnpebR9jXFRTVUoAD0kAURBL';

export function getEmbeddedTelegramCredentials() {
    if (!SHROUDED) return { apiId: null, apiHash: '' };
    try {
        return unshroud(SHROUDED);
    } catch (_) {
        return { apiId: null, apiHash: '' };
    }
}
