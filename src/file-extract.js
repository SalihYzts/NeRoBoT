// Local-file text extraction for NeRoChAt's file/image attach button.
// Mirrors the WhatsApp bot's own media-handling in bot.js (same PDF/Word/
// plain-text logic), just for a file picked from disk instead of a
// WhatsApp media message — kept as its own module so this doesn't need to
// touch the already-working bot.js code path.
import mammoth from 'mammoth';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// pdf-parse v2 exposes a PDFParse class (pdf.js based) instead of the old
// v1 callable function — see https://github.com/mehmet-kozan/pdf-parse
const { PDFParse } = require('pdf-parse');

const MAX_CHARS = 30_000;

export function isImageExt(ext) {
    return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext.toLowerCase());
}

// Returns { ok, text } or { ok: false, error }. `ext` includes the leading
// dot (path.extname's format); `mime` may be empty (extension is the
// primary signal here, unlike bot.js which mostly has to trust WhatsApp's
// reported mimetype).
export async function extractFileText(buffer, ext, filename) {
    const lower = ext.toLowerCase();
    try {
        if (lower === '.pdf') {
            const parser = new PDFParse({ data: buffer });
            try {
                const result = await parser.getText();
                return { ok: true, text: `[PDF içeriği: ${filename}]\n${result.text.trim()}` };
            } finally {
                await parser.destroy();
            }
        }
        if (lower === '.docx' || lower === '.doc') {
            const result = await mammoth.extractRawText({ buffer });
            return { ok: true, text: `[Word belgesi içeriği: ${filename}]\n${result.value.trim()}` };
        }
        // Plain text-ish files (txt, json, js, ts, csv, xml, yaml, md, log…)
        const text = buffer.toString('utf8');
        const trimmed = text.length > MAX_CHARS
            ? text.slice(0, MAX_CHARS) + `\n\n[... ${text.length - MAX_CHARS} karakter kırpıldı]`
            : text;
        return { ok: true, text: `[Dosya içeriği: ${filename}]\n${trimmed}` };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    }
}
