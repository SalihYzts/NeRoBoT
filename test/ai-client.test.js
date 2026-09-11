// Canlı entegrasyon testleri — gerçek bir sunucu olmadan yalnızca ayrıştırıcı
// (parser) kanıtlanır; protokol varsayımını yalnızca çalışan bir sunucu
// kanıtlar. Sunucu yoksa test kendini ATLAR (skip) — ama DİKKAT: atlanmış test
// "geçti" demek değildir, "koşmadı" demektir. Raporda ayrıca belirtilmeli.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { createAiClient, probeConnection } from '../src/ai-client.js';
import { LOCAL_RUNTIMES, resolveConnection, normalizeEndpoint,
         migrateLegacyStatus } from '../src/ai-provider.js';

const OLLAMA = { aiConnectionMode: 'local', aiLocalRuntime: 'ollama' };

let live = false;
let localModel = null;

before(async () => {
    const probe = await probeConnection(OLLAMA);
    live = probe.online;
    if (!live) {
        console.log(`[bilgi] canlı sunucu yok (${probe.error}) — canlı testler ATLANIYOR`);
        return;
    }
    // Gerçekten yerel (indirilmiş) bir model seç: bulut proxy'li kayıtların
    // size'ı birkaç KB'dir, gerçek ağırlıklar onlarca MB'dan başlar.
    const real = probe.models.find((m) => typeof m.size === 'number' && m.size > 1_000_000);
    localModel = real?.name || probe.models[0]?.name || null;
    console.log(`[bilgi] canlı sunucu var, ${probe.models.length} model, test modeli: ${localModel}`);
});

describe('ai-provider — saf birim testleri (sunucu gerekmez)', () => {
    test('adres sonundaki eğik çizgi temizlenir', () => {
        assert.equal(normalizeEndpoint('http://127.0.0.1:1234/'), 'http://127.0.0.1:1234');
        assert.equal(normalizeEndpoint('http://h:1///'), 'http://h:1');
        assert.equal(normalizeEndpoint('  http://h:1  '), 'http://h:1');
    });

    test('varsayılan mod yereldir ve bilinmeyen sağlayıcı ilk kayda düşer', () => {
        const conn = resolveConnection({});
        assert.equal(conn.mode, 'local');
        assert.equal(conn.dialect, 'ollama');
        const bogus = resolveConnection({ aiConnectionMode: 'local', aiLocalRuntime: 'yok-boyle-bir-sey' });
        assert.equal(bogus.providerId, LOCAL_RUNTIMES[0].id);
    });

    test('OpenAI-uyumlu bir yerel çalışma zamanı openai lehçesi ve kendi portunu alır', () => {
        const conn = resolveConnection({ aiConnectionMode: 'local', aiLocalRuntime: 'lmstudio' });
        assert.equal(conn.dialect, 'openai');
        assert.match(conn.baseUrl, /1234$/);
        assert.equal(conn.canPull, false, 'LM Studio bu uygulamadan model indirmez');
    });

    test('anahtarsız bulut sağlayıcısı eksik anahtarı BİLDİRİR', () => {
        const conn = resolveConnection({ aiConnectionMode: 'api', aiCloudProvider: 'openai' });
        assert.equal(conn.missingKey, true);
        const withKey = resolveConnection({
            aiConnectionMode: 'api', aiCloudProvider: 'openai',
            aiApiKeys: { openai: 'test-anahtar' },
        });
        assert.equal(withKey.missingKey, false);
        assert.equal(withKey.dialect, 'openai');
    });

    test('anahtarlar sağlayıcı başına ayrı — biri diğerine SIZMAZ', () => {
        // Tek ortak alan kullanılırsa Groq anahtarı OpenAI'ye gönderilirdi.
        const settings = {
            aiConnectionMode: 'api',
            aiApiKeys: { groq: 'groq-anahtari', openai: 'openai-anahtari' },
        };
        const groq = resolveConnection({ ...settings, aiCloudProvider: 'groq' });
        const openai = resolveConnection({ ...settings, aiCloudProvider: 'openai' });
        assert.equal(groq.apiKey, 'groq-anahtari');
        assert.equal(openai.apiKey, 'openai-anahtari');
        // Anahtarı olmayan üçüncü sağlayıcı, diğerlerinin anahtarını ALMAZ.
        const together = resolveConnection({ ...settings, aiCloudProvider: 'together' });
        assert.equal(together.apiKey, '');
        assert.equal(together.missingKey, true);
    });

    test('eski tek-anahtar ayarı Ollama Cloud altına göç eder, başkasına değil', () => {
        const migrated = migrateLegacyStatus({
            ollamaConnectionMode: 'api',
            ollamaCloudApiKey: 'eski-anahtar',
        });
        assert.equal(migrated.aiConnectionMode, 'api');
        assert.equal(migrated.aiCloudProvider, 'ollama-cloud');
        assert.equal(migrated.aiApiKeys['ollama-cloud'], 'eski-anahtar');
        // Eski alanlar temizlenmeli, yoksa iki kaynak doğruluk çakışır.
        assert.equal(migrated.ollamaCloudApiKey, undefined);
        assert.equal(migrated.aiApiKey, undefined);
        // Başka bir sağlayıcı o anahtarı devralmamalı.
        const openai = resolveConnection({ ...migrated, aiCloudProvider: 'openai' });
        assert.equal(openai.apiKey, '');
    });

    test('model indirmeyi desteklemeyen sağlayıcı SESSİZ kalmaz, açık hata verir', async () => {
        const client = createAiClient({ aiConnectionMode: 'local', aiLocalRuntime: 'lmstudio' });
        await assert.rejects(
            () => client.pull({ model: 'herhangi' }),
            /desteklemiyor/,
            'indirme desteklenmiyorsa net bir hata beklenir');
    });

    test('anahtar gerektiren sağlayıcıda çağrı, çözümü söyleyen hata verir', async () => {
        const client = createAiClient({ aiConnectionMode: 'api', aiCloudProvider: 'openai' });
        await assert.rejects(
            () => client.chat({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'selam' }] }),
            /API anahtarı gerektiriyor/);
    });
});

describe('ai-client — canlı sunucuya karşı', () => {
    test('list() gerçek modelleri döndürür ve şekli eski SDK ile aynıdır', async (t) => {
        if (!live) return t.skip('canlı sunucu yok');
        const client = createAiClient(OLLAMA);
        const { models } = await client.list();
        assert.ok(Array.isArray(models) && models.length > 0, 'model listesi boş');
        // Eski SDK kontratı: her kayıt `name` taşır (çağıran kod buna bakıyor).
        for (const m of models) assert.equal(typeof m.name, 'string');
    });

    test('chat() gerçek bir yanıt metni döndürür', async (t) => {
        if (!live || !localModel) return t.skip('canlı sunucu/model yok');
        const client = createAiClient(OLLAMA);
        const res = await client.chat({
            model: localModel,
            messages: [{ role: 'user', content: 'Sadece "tamam" yaz, başka hiçbir şey yazma.' }],
        });
        // Kontrat: { message: { content } } — eski SDK ile birebir.
        assert.equal(typeof res.message.content, 'string');
        assert.ok(res.message.content.trim().length > 0, 'model boş yanıt döndürdü');
        console.log(`    → model yanıtı: ${JSON.stringify(res.message.content.slice(0, 60))}`);
    });

    test('chat({ stream: true }) parça parça akıtır', async (t) => {
        if (!live || !localModel) return t.skip('canlı sunucu/model yok');
        const client = createAiClient(OLLAMA);
        const stream = await client.chat({
            model: localModel,
            messages: [{ role: 'user', content: 'Bire kadar say.' }],
            stream: true,
        });
        let chunks = 0;
        let text = '';
        for await (const part of stream) {
            chunks++;
            text += part.message.content;
            if (chunks > 400) break;
        }
        assert.ok(chunks > 0, 'hiç parça gelmedi');
        assert.ok(text.length > 0, 'akıştan metin çıkmadı');
        console.log(`    → ${chunks} parça, ${text.length} karakter`);
    });

    test('show() yetenek listesi döndürür (ollama lehçesi)', async (t) => {
        if (!live || !localModel) return t.skip('canlı sunucu/model yok');
        const client = createAiClient(OLLAMA);
        const info = await client.show({ model: localModel });
        assert.ok(info && typeof info === 'object');
        // ai.js's modelHasVision bu alana bakıyor — varsa dizi olmalı.
        if (info.capabilities !== undefined) assert.ok(Array.isArray(info.capabilities));
    });

    test('ulaşılamayan adres, çözümü söyleyen bir hata verir', async () => {
        // Kapalı olduğu kesin bir port — canlı sunucudan bağımsız çalışır.
        const client = createAiClient({
            aiConnectionMode: 'local', aiLocalRuntime: 'custom',
            aiLocalEndpoint: 'http://127.0.0.1:9',
        });
        await assert.rejects(
            () => client.list(),
            (err) => {
                assert.match(err.message, /ulaşılamıyor/);
                return true;
            });
    });
});
