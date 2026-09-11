// Bilgisayarda KURULU CLI ajanlarını bulur ve sağlayıcı olarak sunar.
//
// Neden ayrı bir "lehçe": Ollama/LM Studio/OpenAI bir HTTP adresine istek
// atar; Claude Code, Hermes, Codex gibi araçlar ise BİR SÜREÇ olarak çalışır
// (stdin/argv → stdout). İkisini aynı istemcide `dialect: 'cli'` ile
// ayırıyoruz, böylece iş mantığı (src/ai.js, bot.js …) hangisinin
// kullanıldığını yine bilmek zorunda kalmıyor.
//
// Ayrıca bunlar "model" değil AJAN: kendi oturum yönetimi, kendi araçları ve
// kendi kimlik doğrulaması var. Avantajı — kullanıcı ayrıca API anahtarı
// girmez, zaten giriş yapmış olduğu aracı kullanır.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Her kayıt: nasıl çalıştırılır + tek-seferlik (non-interactive) istek için
// hangi argümanlar gerekir. Yeni bir ajan eklemek = buraya bir satır.
//
// `args(prompt)` DAİMA argv dizisi döndürür — komut satırı string'i değil.
// Böylece kullanıcı metni kabuk tarafından yorumlanmaz (enjeksiyon riski yok).
export const CLI_AGENTS = [
    {
        id: 'claude-code',
        label: 'Claude Code (CLI)',
        bin: 'claude',
        // Kurulumu PATH'te olmayabilir; sürüm klasörlerine de bakılır.
        searchDirs: () => [
            path.join(os.homedir(), '.config', 'Claude', 'claude-code'),
            path.join(os.homedir(), '.claude', 'local'),
        ],
        versioned: true, // altında <sürüm>/<bin> yapısı var
        args: (prompt) => ['-p', prompt],
        docUrl: 'https://github.com/anthropics/claude-code',
    },
    {
        id: 'hermes',
        label: 'Hermes (CLI)',
        bin: 'hermes',
        searchDirs: () => [
            path.join(os.homedir(), '.hermes', 'hermes-agent', 'venv', 'bin'),
            path.join(os.homedir(), '.local', 'bin'),
        ],
        versioned: false,
        // -z: tek istek, -t '': araç yükleme (uzun sürer, sohbet için gereksiz)
        args: (prompt) => ['-z', prompt, '-t', ''],
        docUrl: 'https://github.com/NousResearch/hermes',
    },
    {
        id: 'codex',
        label: 'OpenAI Codex (CLI)',
        bin: 'codex',
        searchDirs: () => [path.join(os.homedir(), '.local', 'bin')],
        versioned: false,
        args: (prompt) => ['exec', prompt],
        docUrl: 'https://github.com/openai/codex',
    },
    {
        id: 'opencode',
        label: 'OpenCode (CLI)',
        bin: 'opencode',
        searchDirs: () => [path.join(os.homedir(), '.opencode', 'bin')],
        versioned: false,
        args: (prompt) => ['run', prompt],
        docUrl: 'https://github.com/sst/opencode',
    },
    {
        id: 'gemini',
        label: 'Gemini CLI',
        bin: 'gemini',
        searchDirs: () => [path.join(os.homedir(), '.local', 'bin')],
        versioned: false,
        args: (prompt) => ['-p', prompt],
        docUrl: 'https://github.com/google-gemini/gemini-cli',
    },
];

export function findCliAgent(id) {
    return CLI_AGENTS.find((a) => a.id === id) || null;
}

function isExecutable(p) {
    try {
        fs.accessSync(p, fs.constants.X_OK);
        return fs.statSync(p).isFile();
    } catch (_) {
        return false;
    }
}

// PATH'te ara — `which` çağırmadan, senkron ve platformdan bağımsız.
function fromPath(bin) {
    const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
        if (!dir) continue;
        for (const ext of exts) {
            const candidate = path.join(dir, bin + ext);
            if (isExecutable(candidate)) return candidate;
        }
    }
    return null;
}

// Sürümlü kurulumlarda (ör. .../claude-code/2.1.260/claude) EN YENİ sürümü
// seç — sürüm klasörleri sayısal olarak karşılaştırılır, alfabetik değil
// (yoksa "2.1.9" > "2.1.260" olurdu).
function fromVersionedDir(dir, bin) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
        return null;
    }
    const versions = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort((a, b) => {
            const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
            const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const d = (pb[i] || 0) - (pa[i] || 0);
                if (d) return d;
            }
            return 0;
        });
    for (const v of versions) {
        const candidate = path.join(dir, v, bin);
        if (isExecutable(candidate)) return candidate;
    }
    return null;
}

// Tek bir ajanın yolunu çöz (bulunamazsa null).
export function resolveAgentPath(agent) {
    const onPath = fromPath(agent.bin);
    if (onPath) return onPath;
    for (const dir of agent.searchDirs()) {
        const hit = agent.versioned
            ? fromVersionedDir(dir, agent.bin)
            : (isExecutable(path.join(dir, agent.bin)) ? path.join(dir, agent.bin) : null);
        if (hit) return hit;
    }
    return null;
}

// Kurulu olanları listele — UI bu listeyi gösterir. Kurulu OLMAYANLAR da
// döner (installed: false) ama gizlenmez: "neden X yok?" sorusunu
// engellemek için görünür kalıp sebebini söylemesi daha iyi.
export function detectCliAgents() {
    return CLI_AGENTS.map((agent) => {
        const binPath = resolveAgentPath(agent);
        return {
            id: agent.id,
            label: agent.label,
            installed: !!binPath,
            binPath: binPath || null,
            docUrl: agent.docUrl,
        };
    });
}

// ============================
// Yetenek sınırları — AÇIKÇA bildiriliyor
// ============================
// Bir CLI ajanı sohbet edebilir ama şunları YAPAMAZ. Bunları sessizce
// yutmak yerine adlandırıyoruz ki UI kullanıcıya söyleyebilsin:
//   embed  — vektör hafıza için gömme üretmiyor (ai.js zaten gömme
//            başarısız olursa son-mesajlara dayalı hafızaya düşüyor)
//   vision — görsel gönderilemiyor (metin arayüzü)
//   pull   — model indirme/silme yok (ajan kendi modelini yönetir)
//   models — seçilecek model listesi yok (ajanın kendi ayarı geçerli)
export const CLI_AGENT_LIMITS = ['embed', 'vision', 'pull', 'models'];

export function describeCliAgentLimits() {
    return 'CLI ajanları metin sohbeti yapar; vektör hafıza, görsel okuma ve ' +
        'model indirme bu modda çalışmaz (ajan kendi modelini ve oturumunu yönetir).';
}

const AGENT_TIMEOUT_MS = 180_000; // ajanlar yavaş olabilir; sonsuz değil

// Tek-seferlik istek: süreci çalıştır, stdout'u topla.
// Kullanıcı metni argv ile geçer (kabuk yok) — enjeksiyon riski yoktur.
export function runCliAgent(agent, binPath, prompt, { cwd, signal } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(binPath, agent.args(prompt), {
            cwd: cwd || os.tmpdir(), // repo köküne yazmasın diye nötr bir dizin
            shell: false,
            signal,
            env: { ...process.env },
        });

        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`${agent.label} zaman aşımına uğradı (${AGENT_TIMEOUT_MS / 1000}s).`));
        }, AGENT_TIMEOUT_MS);

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(new Error(`${agent.label} çalıştırılamadı: ${err.message}`));
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            const text = stdout.trim();
            if (code !== 0 && !text) {
                reject(new Error(
                    `${agent.label} ${code} koduyla çıktı${stderr ? ` — ${stderr.trim().slice(0, 300)}` : ''}`));
                return;
            }
            resolve(text);
        });

        // stdin'i kapat: bazı ajanlar açık stdin'de etkileşimli moda kayıp
        // beklemeye geçiyor (ve süreç hiç bitmiyor).
        child.stdin.end();
    });
}
