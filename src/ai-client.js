// AI istemcisi — eski `ollama` npm paketinin YERİNE, aynı çağrı şekliyle.
//
// Neden elle: paketin sunduğu yüzeyin bu uygulamada kullanılan kısmı altı
// metottan ibaret (chat, list, show, embed, pull, delete). Onu fetch ile
// yazmak, uygulamayı tek bir satıcının SDK'sına bağlı olmaktan çıkarıyor:
// artık aynı kod Ollama, LM Studio, llama.cpp, vLLM, OpenAI, OpenRouter,
// Groq, Together ya da OpenAI-uyumlu herhangi bir şeyle çalışıyor.
//
// KONTRAT KORUNDU (bilinçli karar): metot adları, argüman şekli ve dönüş
// şekli eski SDK'nınkiyle birebir aynı —
//     chat({ model, messages, stream })  → { message: { content } }
//     list()                             → { models: [{ name, size }] }
//     show({ model })                    → { capabilities: [...] }
//     embed({ model, input })            → { embeddings: [[...]] }
//     pull({ model, stream })            → async iterable { status, completed, total }
//     delete({ model })                  → void
// Böylece src/ai.js, src/commands.js ve app/main.js'teki onlarca çağrı
// yerinin hiçbiri değişmek zorunda kalmadı (bkz. skill: "kontratları
// adaptörleri silmeden önce yeniden yaz").
import { resolveConnection, describeConnectionProblem } from './ai-provider.js';
import { findCliAgent, resolveAgentPath, runCliAgent, describeCliAgentLimits } from './ai-agents.js';

const REQUEST_TIMEOUT_MS = 300_000; // uzun üretimler için geniş; yine de sonsuz değil

// ============================
// Lehçe farkları — sadece bu dört şey
// ============================
function modelsUrl(dialect, base) {
    return dialect === 'ollama' ? `${base}/api/tags` : `${base}/v1/models`;
}

function chatUrl(dialect, base) {
    return dialect === 'ollama' ? `${base}/api/chat` : `${base}/v1/chat/completions`;
}

function embedUrl(dialect, base) {
    return dialect === 'ollama' ? `${base}/api/embed` : `${base}/v1/embeddings`;
}

function buildChatBody(dialect, { model, messages, stream }) {
    if (dialect === 'ollama') {
        return { model, messages: messages.map(toOllamaMessage), stream: !!stream };
    }
    return {
        model,
        messages: messages.map(toOpenAiMessage),
        stream: !!stream,
    };
}

// Ollama görselleri mesajdaki `images: [base64]` alanıyla alır; OpenAI şekli
// ise içerik parçalarıyla (image_url + data: URL). Bu dönüşüm olmadan
// görsel gönderimi OpenAI-uyumlu sunucularda sessizce kaybolurdu.
function toOllamaMessage(m) {
    return m.images?.length
        ? { role: m.role, content: m.content, images: m.images }
        : { role: m.role, content: m.content };
}

function toOpenAiMessage(m) {
    if (!m.images?.length) return { role: m.role, content: m.content };
    return {
        role: m.role,
        content: [
            { type: 'text', text: m.content },
            ...m.images.map((b64) => ({
                type: 'image_url',
                image_url: { url: b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}` },
            })),
        ],
    };
}

// İKİ Ollama şeklini de oku: /api/generate `response` döner, /api/chat
// `message.content` döner. Yalnızca birini okuyan kod, diğer uç noktaya
// bakıldığı gün HATA değil BOŞ DİZE döndürür — sonra bu, çok aşağıda
// "model hiçbir şey döndürmedi" olarak görünür.
function readReplyText(dialect, payload) {
    if (dialect === 'ollama') {
        return payload?.message?.content ?? payload?.response ?? '';
    }
    return payload?.choices?.[0]?.message?.content ?? '';
}

function readModelList(dialect, payload) {
    if (dialect === 'ollama') {
        return (payload?.models || []).map((m) => ({
            name: m.name,
            size: m.size,
            details: m.details,
            modified_at: m.modified_at,
        }));
    }
    // OpenAI şekli boyut bildirmez — `size: undefined`, çağıran taraf bunu
    // "bilinmiyor" olarak ele alır (bkz. ai.js's isLocallyStored).
    return (payload?.data || []).map((m) => ({ name: m.id, size: undefined }));
}

function authHeaders(conn) {
    if (!conn.apiKey) return {};
    const scheme = 'Bearer';
    return { Authorization: `${scheme} ${conn.apiKey}` };
}

async function request(conn, url, { method = 'POST', body, stream = false, signal } = {}) {
    const problem = describeConnectionProblem(conn);
    if (problem) throw new Error(problem);

    let res;
    try {
        res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders(conn),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (err) {
        // Hata mesajı ÇÖZÜMÜ içermeli — çıplak "fetch failed" kullanıcıya
        // hiçbir şey söylemiyor.
        const hint = conn.mode === 'local'
            ? (conn.startHint ? ` ${conn.startHint}` : '')
            : '';
        throw new Error(`${conn.label} adresine ulaşılamıyor (${conn.baseUrl}).${hint}`);
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        let detail = text.slice(0, 300);
        try {
            const parsed = JSON.parse(text);
            detail = parsed?.error?.message || parsed?.error || detail;
        } catch (_) {}
        if (res.status === 401 || res.status === 403) {
            throw new Error(`${conn.label}: API anahtarı geçersiz veya yetkisiz (HTTP ${res.status}).`);
        }
        if (res.status === 402) {
            throw new Error(`${conn.label}: bu model ücretli bir plan gerektiriyor (HTTP 402).`);
        }
        throw new Error(`${conn.label}: HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
    }

    return stream ? res : res.json();
}

// Ollama satır-satır JSON (NDJSON), OpenAI ise SSE ("data: {...}") akıtır.
// İkisini de tek bir { message: { content } } parça akışına çeviriyoruz —
// çağıran kod (app/main.js'in chatSend'i) farkı görmez.
async function* streamChat(conn, res) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line) continue;

            if (conn.dialect === 'openai') {
                if (!line.startsWith('data:')) continue;
                const data = line.slice(5).trim();
                if (data === '[DONE]') return;
                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed?.choices?.[0]?.delta?.content;
                    if (delta) yield { message: { content: delta } };
                } catch (_) {}
            } else {
                try {
                    const parsed = JSON.parse(line);
                    const chunk = parsed?.message?.content ?? parsed?.response;
                    if (chunk) yield { message: { content: chunk } };
                    if (parsed?.done) return;
                } catch (_) {}
            }
        }
    }
}

// Ollama'nın indirme akışı: { status, completed, total }. Diğer lehçelerde
// model indirme YOKTUR (kullanıcı kendi arayüzünden yönetir) — bu yüzden
// yeteneği açıkça reddediyoruz, sessizce boş akış döndürmüyoruz.
async function* streamPull(conn, res) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line) continue;
            try { yield JSON.parse(line); } catch (_) {}
        }
    }
}

// CLI ajanı tek bir metin alır (mesaj dizisi değil). Sohbet geçmişini
// okunabilir düz metne çeviriyoruz; sistem istemi başa alınıyor çünkü
// ajanların çoğu ilk satırı yönerge olarak okuyor.
function flattenMessages(messages = []) {
    const parts = [];
    for (const m of messages) {
        if (!m?.content) continue;
        const role = m.role === 'assistant' ? 'Asistan'
            : m.role === 'system' ? 'Yönerge' : 'Kullanıcı';
        parts.push(`${role}: ${m.content}`);
    }
    // Son satırı yanıtlaması gerektiğini belirt — yoksa bazı ajanlar tüm
    // dökümü özetlemeye çalışıyor.
    parts.push('Asistan:');
    return parts.join('\n\n');
}

// Akış isteyen çağıranlar (main.js's chatSend) için: tek parçalı akış.
// Ajan kelime kelime akıtmıyor; yanıtın tamamı tek seferde geliyor.
async function* singleChunkStream(text) {
    if (text) yield { message: { content: text } };
}

// ============================
// İstemci
// ============================
export function createAiClient(settings = {}) {
    const conn = resolveConnection(settings);
    const base = conn.baseUrl;

    return {
        // Hangi sağlayıcıya bağlı olduğumuz — UI durum satırı için.
        connection: conn,

        async chat({ model, messages, stream = false, signal } = {}) {
            // CLI ajanı: HTTP yok, süreç var. Kontrat aynı kalıyor —
            // çağıran kod (ai.js, main.js) farkı görmüyor.
            if (conn.dialect === 'cli') {
                const agent = findCliAgent(conn.providerId);
                const binPath = agent && resolveAgentPath(agent);
                if (!binPath) {
                    throw new Error(
                        `${conn.label} bu bilgisayarda bulunamadı. Kurulum: ${agent?.docUrl || '-'}`);
                }
                // Ajan tek bir metin alır; sohbet geçmişini düz metne çeviriyoruz
                // (ajanın kendi oturum hafızası bizim geçmişimizden bağımsız).
                const text = await runCliAgent(agent, binPath, flattenMessages(messages), { signal });
                if (stream) return singleChunkStream(text);
                return { message: { content: text } };
            }

            const url = chatUrl(conn.dialect, base);
            const body = buildChatBody(conn.dialect, { model, messages, stream });
            if (stream) {
                const res = await request(conn, url, { body, stream: true, signal });
                return streamChat(conn, res);
            }
            const payload = await request(conn, url, { body, signal });
            return { message: { content: readReplyText(conn.dialect, payload) } };
        },

        async list() {
            // Ajanın seçilecek model listesi yoktur; kendi modelini kullanır.
            // Boş liste döndürmek "sunucu boş" gibi görünürdü, o yüzden tek
            // bir sanal kayıt: UI bir şey göstermek zorunda.
            if (conn.dialect === 'cli') {
                return { models: [{ name: conn.label, size: undefined }] };
            }
            const payload = await request(conn, modelsUrl(conn.dialect, base), { method: 'GET' });
            return { models: readModelList(conn.dialect, payload) };
        },

        // Yetenek sorgusu (ör. "vision") yalnızca Ollama lehçesinde var.
        // Diğerlerinde bilinmiyor demek YANLIŞ olurdu — çağıran taraf
        // (ai.js's modelHasVision) hata durumunda "olabilir" varsayıyor, o
        // yüzden burada boş yetenek listesi değil, açık bir hata veriyoruz.
        async show({ model } = {}) {
            if (conn.dialect === 'cli') {
                throw new Error(`${conn.label} model yetenek bilgisi sunmuyor.`);
            }
            if (conn.dialect !== 'ollama') {
                throw new Error(`${conn.label} model yetenek bilgisi sunmuyor.`);
            }
            return request(conn, `${base}/api/show`, { body: { model } });
        },

        async embed({ model, input } = {}) {
            // Gömme yok → ai.js zaten son-mesajlara dayalı hafızaya düşüyor.
            if (conn.dialect === 'cli') {
                throw new Error(`${conn.label} gömme (vektör hafıza) desteklemiyor. ${describeCliAgentLimits()}`);
            }
            const url = embedUrl(conn.dialect, base);
            if (conn.dialect === 'ollama') {
                const payload = await request(conn, url, { body: { model, input } });
                return { embeddings: payload?.embeddings || [] };
            }
            const payload = await request(conn, url, { body: { model, input } });
            return { embeddings: (payload?.data || []).map((d) => d.embedding) };
        },

        async pull({ model, stream = false } = {}) {
            if (!conn.canPull) {
                throw new Error(
                    `${conn.label} bu uygulamadan model indirmeyi desteklemiyor — ` +
                    'modeli kendi arayüzünden/komut satırından ekle.');
            }
            const res = await request(conn, `${base}/api/pull`, {
                body: { model, stream: true },
                stream: true,
            });
            const iterator = streamPull(conn, res);
            if (stream) return iterator;
            // akış istenmediyse sonuna kadar tüket
            let last = null;
            for await (const chunk of iterator) last = chunk;
            return last;
        },

        async delete({ model } = {}) {
            if (!conn.canPull) {
                throw new Error(`${conn.label} bu uygulamadan model silmeyi desteklemiyor.`);
            }
            return request(conn, `${base}/api/delete`, { method: 'DELETE', body: { model } });
        },
    };
}

// Sunucu ayakta mı + hangi modeller var? UI'ın bağlantı bölümü için.
// "Ulaşılamıyor" ile "ulaşılıyor ama model yok" AYRI durumlar — ikisi farklı
// mesaj hak ediyor, çünkü çözümleri farklı.
export async function probeConnection(settings = {}) {
    const conn = resolveConnection(settings);

    // CLI ajanı: "sunucu ayakta mı" sorusu anlamsız — "kurulu mu" sorulur.
    if (conn.dialect === 'cli') {
        const agent = findCliAgent(conn.providerId);
        const binPath = agent && resolveAgentPath(agent);
        if (!binPath) {
            return {
                online: false, models: [], label: conn.label,
                error: `${conn.label} bu bilgisayarda bulunamadı. Kurulum: ${agent?.docUrl || '-'}`,
            };
        }
        return {
            online: true,
            models: [{ name: conn.label, size: undefined }],
            label: conn.label,
            note: `${binPath} — ${describeCliAgentLimits()}`,
        };
    }

    const problem = describeConnectionProblem(conn);
    if (problem) return { online: false, models: [], error: problem, label: conn.label };

    try {
        const res = await fetch(modelsUrl(conn.dialect, conn.baseUrl), {
            headers: authHeaders(conn),
            signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) {
            return {
                online: false,
                models: [],
                label: conn.label,
                error: `${conn.label}: HTTP ${res.status}`,
            };
        }
        const payload = await res.json();
        return { online: true, models: readModelList(conn.dialect, payload), label: conn.label };
    } catch (_) {
        return {
            online: false,
            models: [],
            label: conn.label,
            error: conn.mode === 'local'
                ? `${conn.label} adresine ulaşılamıyor (${conn.baseUrl}). ${conn.startHint || ''}`.trim()
                : `${conn.label} adresine ulaşılamıyor (${conn.baseUrl}).`,
        };
    }
}
