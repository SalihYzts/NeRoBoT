// Mimari koruma testleri — Ollama'ya olan SATICI KİLİDİNİN geri gelmesini
// engeller. Yeni bir sağlayıcı/çalışma zamanı eklemek bu testleri
// değiştirmemeli; bir yere yeniden "ollama" sabitlemek ise BOZMALI.
//
// Neden isimleri raporluyor: "expected [8 items] to equal []" hiçbir şey
// öğretmez. Hangi dosyada kaldığını yazan bir liste, iş ilerledikçe kısalan
// canlı bir kontrol listesidir.
//
// Kasıtlı iki kör nokta (bkz. ai-provider-integration skill'i):
//   1) YORUMLAR ihlal değildir — "Ollama artık özel değil" diye bir not
//      bırakmak dokümantasyondur; onu yasaklamak gelecekteki bakımcıyı
//      açıklamayı silmeye zorlar.
//   2) Satıcının ADI değil, ADAPTÖRÜ yasaklanır. "ollama" kelimesi meşru
//      yerlerde geçer: registry'deki bir lehçe/sağlayıcı kaydı, kullanıcıya
//      gösterilen "Ollama" etiketi, kurulum yardımı. Yasaklanan şey, iş
//      mantığının doğrudan o satıcıya bağlanmasıdır.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Registry'nin KENDİSİ satıcıya özgü bilgi taşımak zorundadır (lehçe, varsayılan
// port, etiket) — yasak olan, o bilginin başka yere sızmasıdır. Bu testin
// kendisi de muaf: yasakladığı desenleri kaynak metin olarak içeriyor.
const REGISTRY_FILES = new Set([
    path.join('src', 'ai-provider.js'),
    path.join('src', 'ai-client.js'),
    path.join('test', 'provider-abstraction.test.js'),
    // Ollama'yı KURAN yardımcı — doğası gereği o araca özgü ve opsiyonel
    // (yalnızca Windows'ta, yalnızca kullanıcı Ollama'yı seçtiyse çalışır;
    // bkz. main.js's selectedRuntimeIsOllama). Bir sağlayıcıyı kurabilmek
    // ile ona BAĞIMLI olmak farklı şeyler.
    path.join('src', 'ollama-installer.js'),
    // CLI ajan kaydı: araç adlarını ve çalıştırma argümanlarını taşımak
    // zorunda (registry ailesinden).
    path.join('src', 'ai-agents.js'),
]);

// UYGULAMA kodunu tarar. scripts/ bilerek DIŞARIDA: orası yayın/changelog
// gibi geliştirici araçları, kullanıcıya giden uygulama değil. Oradaki model
// çağrısı da tek bir araca çivili değil (NEROBOT_AI_URL/NEROBOT_AI_MODEL ile
// değiştirilebiliyor), ama varsayılan bir adres taşıdığı için bu testin
// kapsamına almak yanıltıcı olurdu — kapsamı dürüstçe söylemek, testi
// gevşetmekten iyidir.
function sourceFiles() {
    const out = [];
    const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', 'logo', '.claude', 'scripts']);
    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith('.') && entry.name !== '.github') continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (skipDirs.has(entry.name)) continue;
                walk(full);
                continue;
            }
            if (!/\.(js|cjs|mjs|html)$/.test(entry.name)) continue;
            out.push({ path: path.relative(ROOT, full), body: fs.readFileSync(full, 'utf8') });
        }
    })(ROOT);
    return out;
}

// Yorumları (ve HTML yorumlarını) çıkarır — bkz. yukarıdaki 1. kör nokta.
function withoutComments(body) {
    return body
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

function offenders(predicate, { allow = REGISTRY_FILES } = {}) {
    return sourceFiles()
        .filter((f) => !allow.has(f.path))
        // Testler eski alan adlarını ANMAK zorundadır: göçün çalıştığını
        // doğrulamanın başka yolu yok. Yasak ÜRÜN kodu için geçerli.
        .filter((f) => !/\.(test|mjs)$|\.test\.js$/.test(f.path))
        .filter((f) => predicate(withoutComments(f.body), f))
        .map((f) => f.path);
}

describe('AI sağlayıcı soyutlaması — satıcı kilidi koruması', () => {
    test('hiçbir dosya "ollama" npm paketini import etmiyor', () => {
        // Tüm dosyalar dahil: registry bile SDK'ya bağlı olmamalı, HTTP konuşur.
        const bad = sourceFiles()
            .filter((f) => /from\s+['"]ollama['"]|require\(\s*['"]ollama['"]\s*\)/.test(withoutComments(f.body)))
            .map((f) => f.path);
        assert.deepEqual(bad, [], `"ollama" paketini import eden dosyalar: ${bad.join(', ')}`);
    });

    test('package.json bağımlılıklarında "ollama" yok', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        assert.ok(!('ollama' in deps), '"ollama" paketi hâlâ package.json bağımlılığı');
    });

    test('11434 portu registry dışında hiçbir yerde sabitlenmemiş', () => {
        const bad = offenders((body) => body.includes('11434'));
        assert.deepEqual(bad, [], `11434 portu geçen dosyalar: ${bad.join(', ')}`);
    });

    test('ollama.com/ollama API yolları registry dışında geçmiyor', () => {
        // /api/tags, /api/generate, ollama.com — protokol detayları.
        const bad = offenders((body) => /ollama\.com|\/api\/tags|\/api\/generate|\/api\/pull|\/api\/show/.test(body));
        assert.deepEqual(bad, [], `Ollama protokol yolu geçen dosyalar: ${bad.join(', ')}`);
    });

    test('iş mantığı tek bir satıcıyı ima eden isim taşımıyor (getOllamaClient vb.)', () => {
        // Kavramı yasaklıyoruz: "ollama istemcisi" diye bir şey olmamalı,
        // "ai istemcisi" olmalı. Satıcının adı registry'de + etiketlerde kalır.
        const bad = offenders((body) =>
            /getOllamaClient|resolveOllamaClient|currentOllamaClient|ollamaConnectionMode|ollamaCloudApiKey/.test(body));
        assert.deepEqual(bad, [], `Satıcıya bağlı isim kullanan dosyalar: ${bad.join(', ')}`);
    });

    test('registry en az iki lehçe ve bir OpenAI-uyumlu kaçış kapısı sunuyor', async () => {
        const mod = await import(path.join(ROOT, 'src', 'ai-provider.js'));
        const runtimes = mod.LOCAL_RUNTIMES;
        assert.ok(Array.isArray(runtimes) && runtimes.length >= 2,
            'LOCAL_RUNTIMES en az iki çalışma zamanı içermeli');

        const dialects = new Set(runtimes.map((r) => r.dialect));
        assert.ok(dialects.has('ollama') && dialects.has('openai'),
            `iki lehçe de gerekli, bulunan: ${[...dialects].join(', ')}`);

        // "Diğer (OpenAI-uyumlu)" — henüz var olmayan araçları soğurur.
        assert.ok(runtimes.some((r) => r.custom === true),
            'kullanıcının kendi adresini girebileceği genel bir kayıt şart');
    });

    test('her çalışma zamanı kaydı kendi lehçesini ve varsayılan portunu bildiriyor', async () => {
        const { LOCAL_RUNTIMES } = await import(path.join(ROOT, 'src', 'ai-provider.js'));
        for (const rt of LOCAL_RUNTIMES) {
            assert.ok(rt.id, 'her kaydın id\'si olmalı');
            assert.ok(rt.label, `${rt.id}: etiket yok`);
            assert.ok(['ollama', 'openai'].includes(rt.dialect), `${rt.id}: bilinmeyen lehçe ${rt.dialect}`);
            if (!rt.custom) assert.ok(rt.defaultEndpoint, `${rt.id}: varsayılan adres yok`);
        }
    });

    test('CLI ajanları üçüncü bir lehçe olarak kayıtlı ve yetenek sınırları BİLDİRİLİYOR', async () => {
        const { CLI_AGENTS, CLI_AGENT_LIMITS } = await import(path.join(ROOT, 'src', 'ai-agents.js'));
        assert.ok(Array.isArray(CLI_AGENTS) && CLI_AGENTS.length >= 2,
            'en az iki CLI ajanı kayıtlı olmalı');
        for (const a of CLI_AGENTS) {
            assert.ok(a.id && a.label && a.bin, `${a.id}: eksik alan`);
            assert.equal(typeof a.args, 'function', `${a.id}: args() yok`);
            // args DAİMA dizi döndürmeli — kabuk string'i enjeksiyon riski.
            const argv = a.args('deneme');
            assert.ok(Array.isArray(argv), `${a.id}: args() dizi döndürmeli`);
            assert.ok(argv.includes('deneme'), `${a.id}: istem argv'de geçmeli`);
        }
        // Sınırlar sessizce yutulmuyor, adlandırılıyor.
        for (const limit of ['embed', 'vision', 'pull', 'models']) {
            assert.ok(CLI_AGENT_LIMITS.includes(limit), `sınır bildirilmemiş: ${limit}`);
        }
    });

    test('ajan modu adres/anahtar İSTEMEZ ve yeteneklerini doğru bildirir', async () => {
        const { resolveConnection } = await import(path.join(ROOT, 'src', 'ai-provider.js'));
        const conn = resolveConnection({ aiConnectionMode: 'agent', aiAgentId: 'hermes' });
        assert.equal(conn.dialect, 'cli');
        assert.equal(conn.needsKey, false);
        assert.equal(conn.missingKey, false);
        assert.equal(conn.missingEndpoint, false, 'ajan modunda adres beklenmemeli');
        assert.equal(conn.canEmbed, false, 'ajan gömme yapamaz — bunu bildirmeli');
        assert.equal(conn.hasModelList, false);
        assert.equal(conn.canPull, false);
    });

    test('bulut sağlayıcıları anahtar gerektirdiğini bildiriyor', async () => {
        const { CLOUD_PROVIDERS } = await import(path.join(ROOT, 'src', 'ai-provider.js'));
        assert.ok(Array.isArray(CLOUD_PROVIDERS) && CLOUD_PROVIDERS.length >= 2,
            'en az iki bulut sağlayıcısı olmalı (tek bir satıcıya bağlı kalmamak için)');
        for (const p of CLOUD_PROVIDERS) {
            assert.equal(typeof p.needsKey, 'boolean', `${p.id}: needsKey bildirilmemiş`);
            // 'custom' kaydı bilerek adressizdir: adresi kullanıcı girer.
            if (!p.custom) assert.ok(p.baseUrl, `${p.id}: baseUrl yok`);
            assert.ok(['ollama', 'openai'].includes(p.dialect), `${p.id}: bilinmeyen lehçe`);
        }
    });
});
