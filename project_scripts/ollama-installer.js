// Ollama presence check + silent download/install for Windows. Shared by
// two callers (see app/main.js): the in-app "AI Bot" toggle / Ollama
// shortcut tile gate, and the NeRoBoT installer's best-effort attempt
// (headless `--install-ollama` run, triggered from build/installer.nsh).
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execAsync = promisify(exec);

const DOWNLOAD_URL = 'https://ollama.com/download/OllamaSetup.exe';
// Installer adds this to PATH, but OUR already-running process's env won't
// see that until restart — so checks/launches also fall back to this known
// path instead of relying on PATH alone.
const KNOWN_EXE = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
    'Programs', 'Ollama', 'ollama.exe',
);

export async function isOllamaInstalled() {
    if (fs.existsSync(KNOWN_EXE)) return true;
    try {
        await execAsync('ollama --version');
        return true;
    } catch {
        return false;
    }
}

function downloadTo(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        const request = https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close();
                fs.unlink(destPath, () => {});
                downloadTo(res.headers.location, destPath, onProgress).then(resolve, reject);
                return;
            }
            if (res.statusCode !== 200) {
                file.close();
                fs.unlink(destPath, () => {});
                reject(new Error(`İndirme başarısız: HTTP ${res.statusCode}`));
                return;
            }
            const total = parseInt(res.headers['content-length'] || '0', 10);
            let received = 0;
            res.on('data', (chunk) => {
                received += chunk.length;
                if (onProgress && total) onProgress(received / total);
            });
            res.pipe(file);
            file.on('finish', () => file.close(() => resolve()));
        });
        request.on('error', (err) => {
            file.close();
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

// Downloads the official Windows installer and runs it silently
// (Inno Setup-based — /VERYSILENT suppresses all UI, /SUPPRESSMSGBOXES
// auto-answers any prompt, /NORESTART skips a reboot even if requested).
// Resolves { ok: true } on success, { ok: false, error } otherwise — never
// throws, since both call sites (IPC handler and the headless installer
// hook) want to keep going either way.
export async function installOllama(onProgress) {
    if (process.platform !== 'win32') {
        return { ok: false, error: 'Otomatik Ollama kurulumu şu an yalnızca Windows\'ta destekleniyor.' };
    }
    if (await isOllamaInstalled()) return { ok: true, alreadyInstalled: true };

    const tmpPath = path.join(os.tmpdir(), `OllamaSetup-${Date.now()}.exe`);
    try {
        onProgress?.({ phase: 'downloading', percent: 0 });
        await downloadTo(DOWNLOAD_URL, tmpPath, (frac) => onProgress?.({ phase: 'downloading', percent: frac }));

        onProgress?.({ phase: 'installing', percent: null });
        await new Promise((resolve, reject) => {
            const child = spawn(tmpPath, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { stdio: 'ignore', windowsHide: true });
            child.on('error', reject);
            child.on('exit', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Ollama kurulumu ${code} koduyla sonlandı.`));
            });
        });

        onProgress?.({ phase: 'done', percent: 1 });
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message || String(err) };
    } finally {
        fs.unlink(tmpPath, () => {});
    }
}

// Makes sure the local Ollama API (127.0.0.1:11434) is reachable —
// fire-and-forget, no error if it's already running (the spawned `serve`
// just fails to bind the port and exits, harmlessly, since nothing here
// waits on it). Deliberately never launches Ollama's own tray/GUI app
// ("ollama app.exe") — that would pop up a visible window/tray icon, and
// nothing in NeRoBoT should do that (the WhatsApp views are fully
// embedded; this should be too). `windowsHide` stops even the CLI's own
// console window from flashing on screen.
export function openOllamaApp() {
    if (!fs.existsSync(KNOWN_EXE)) return false;
    // NOTE: `detached: true` is deliberately NOT set here — on Windows,
    // combining it with `windowsHide` is a known bad pairing (Node opens a
    // new console for the detached process group before windowsHide can
    // suppress it, so a console window flashes anyway). Without `detached`,
    // `windowsHide: true` alone reliably spawns with no window at all.
    const child = spawn(KNOWN_EXE, ['serve'], {
        stdio: 'ignore',
        windowsHide: true,
    });
    child.unref();
    return true;
}
