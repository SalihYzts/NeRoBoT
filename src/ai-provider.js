// AI sağlayıcı kaydı (registry) — bu uygulamada bir model sağlayıcısının
// adı, adresi ve protokol detayı YALNIZCA burada ve src/ai-client.js'te
// geçer. İş mantığı (src/ai.js, src/bot.js, app/main.js …) bir YETENEK
// ister; hangi sağlayıcının onu karşıladığını bilmez.
//
// Neden böyle: uygulama önceden doğrudan `ollama` npm paketine bağlıydı, bu
// yüzden "yerel model" demek zorunlu olarak "Ollama" demekti. Oysa yerel
// çalışma zamanı diye tek bir şey yok — kullanıcı LM Studio, llama.cpp'nin
// sunucusu, vLLM ya da henüz var olmayan OpenAI-uyumlu bir şey çalıştırıyor
// olabilir. Aynı şekilde bulut tarafı da Ollama Cloud'a mahkûm değil.
//
// Yeni bir araç eklemek = buraya BİR SATIR eklemek. Çağıran kod hiç
// değişmez. (bkz. test/provider-abstraction.test.js — bunu koruyan testler)
import { CLI_AGENTS, findCliAgent } from './ai-agents.js';

// ============================
// Lehçeler (dialect)
// ============================
// Yerel/uzak çıkarım sunucuları büyük ölçüde OpenAI'nin HTTP şekline
// yakınsadı. Ollama kendi yerel API'siyle istisna (OpenAI-uyumlu bir yüzey
// de sunuyor ama kendi dokümanı/kullanıcıları native olanı kullanıyor).
// Dolayısıyla eksen ARAÇ değil LEHÇE'dir: sadece dört şey değişir —
// modelsUrl, chatUrl, gövde şekli, yanıt okuma. Gerisi lehçeden bağımsızdır.
// Üçüncü lehçe 'cli': HTTP adresi yok, BİR SÜREÇ çalıştırılır (Claude Code,
// Hermes, Codex …). Bunlar model değil AJAN — kendi oturumu, kendi araçları
// ve kendi kimlik doğrulaması var, o yüzden kullanıcı ayrıca anahtar girmez.
// Bkz. src/ai-agents.js.
export const DIALECTS = ['ollama', 'openai', 'cli'];

// ============================
// Yerel çalışma zamanları
// ============================
// `custom: true` olan kayıt kaçış kapısıdır: kullanıcı kendi adresini girer.
// Bu, henüz var olmayan araçları da soğurur — listeye eklenmeyi beklemez.
export const LOCAL_RUNTIMES = [
    {
        id: 'ollama',
        label: 'Ollama',
        dialect: 'ollama',
        defaultEndpoint: 'http://127.0.0.1:11434',
        // Ollama modelleri kendisi indirir; diğerlerinde model yönetimi
        // kullanıcının kendi arayüzünde olur (bkz. capabilities.canPull).
        canPull: true,
        startHint: 'Ollama çalışmıyor gibi. Terminalde: ollama serve',
    },
    {
        id: 'lmstudio',
        label: 'LM Studio',
        dialect: 'openai',
        defaultEndpoint: 'http://127.0.0.1:1234',
        canPull: false,
        startHint: 'LM Studio içinde Developer sekmesinden yerel sunucuyu başlat.',
    },
    {
        id: 'llamacpp',
        label: 'llama.cpp (llama-server)',
        dialect: 'openai',
        defaultEndpoint: 'http://127.0.0.1:8080',
        canPull: false,
        startHint: 'Örnek: llama-server -m model.gguf --port 8080',
    },
    {
        id: 'vllm',
        label: 'vLLM',
        dialect: 'openai',
        defaultEndpoint: 'http://127.0.0.1:8000',
        canPull: false,
        startHint: 'Örnek: vllm serve <model> --port 8000',
    },
    {
        id: 'custom',
        label: 'Diğer (OpenAI-uyumlu)',
        dialect: 'openai',
        custom: true,
        defaultEndpoint: '',
        canPull: false,
        startHint: 'Sunucunun adresini yaz (örn. http://127.0.0.1:5000).',
    },
];

// ============================
// Bulut sağlayıcıları
// ============================
// Hepsi anahtar ister ve hepsi OpenAI şekline uyar (Ollama Cloud hariç, o
// kendi lehçesini konuşur). Yeni sağlayıcı = bir satır.
export const CLOUD_PROVIDERS = [
    {
        id: 'openai',
        label: 'OpenAI',
        dialect: 'openai',
        baseUrl: 'https://api.openai.com',
        needsKey: true,
        keyHint: 'platform.openai.com/api-keys',
        keyUrl: 'https://platform.openai.com/api-keys',
    },
    {
        id: 'openrouter',
        label: 'OpenRouter (çok sağlayıcı)',
        dialect: 'openai',
        baseUrl: 'https://openrouter.ai/api',
        needsKey: true,
        keyHint: 'openrouter.ai/keys',
        keyUrl: 'https://openrouter.ai/keys',
    },
    {
        id: 'groq',
        label: 'Groq',
        dialect: 'openai',
        baseUrl: 'https://api.groq.com/openai',
        needsKey: true,
        keyHint: 'console.groq.com/keys',
        keyUrl: 'https://console.groq.com/keys',
    },
    {
        id: 'together',
        label: 'Together AI',
        dialect: 'openai',
        baseUrl: 'https://api.together.xyz',
        needsKey: true,
        keyHint: 'api.together.xyz/settings/api-keys',
        keyUrl: 'https://api.together.xyz/settings/api-keys',
    },
    {
        id: 'ollama-cloud',
        label: 'Ollama Cloud',
        dialect: 'ollama',
        baseUrl: 'https://ollama.com',
        needsKey: true,
        keyHint: 'ollama.com → Settings → Keys',
        keyUrl: 'https://ollama.com/settings/keys',
    },
    {
        id: 'custom',
        label: 'Diğer (OpenAI-uyumlu)',
        dialect: 'openai',
        baseUrl: '',
        needsKey: true,
        custom: true,
        keyHint: 'Sağlayıcının kendi panelinden',
        keyUrl: null,
    },
];

export function findLocalRuntime(id) {
    return LOCAL_RUNTIMES.find((r) => r.id === id) || LOCAL_RUNTIMES[0];
}

export function findCloudProvider(id) {
    return CLOUD_PROVIDERS.find((p) => p.id === id) || CLOUD_PROVIDERS[0];
}

// "Nasıl anahtar alınır?" bağlantılarının açılmasına izin verilen alan
// adları — sağlayıcı bilgisinin bir parçası olduğu için burada duruyor,
// main.js'te değil. Yeni sağlayıcı eklenince buraya da bir satır gerekir.
export const ALLOWED_EXTERNAL_HOSTS = [
    'ollama.com',
    'platform.openai.com',
    'openrouter.ai',
    'console.groq.com',
    'api.together.xyz',
    'lmstudio.ai',
    'github.com',
];

// v4.4.30 ve öncesinde ayarlar tek bir sağlayıcıyı varsayan adlarla
// saklanıyordu (ollamaConnectionMode / ollamaCloudApiKey). Bu, eski dosyayı
// bir kez yeni şemaya taşır — kimse ayarlarını kaybetmesin. Şema bilgisi
// olduğu için registry'de duruyor.
// Anahtarlar SAĞLAYICI BAŞINA saklanır (aiApiKeys[providerId]) — tıpkı bu
// uygulamanın görsel üretim anahtarlarını imageGenApiKeyOpenai/Stability
// diye ayrı tutması gibi. Tek bir ortak alan kullanmak, sağlayıcı
// değiştirince bir sağlayıcının anahtarını DİĞERİNE göndermek demekti.
export function apiKeyFor(settings, providerId) {
    return (settings.aiApiKeys && settings.aiApiKeys[providerId]) || '';
}

export function migrateLegacyStatus(status) {
    if (status.ollamaConnectionMode !== undefined && status.aiConnectionMode === undefined) {
        status.aiConnectionMode = status.ollamaConnectionMode;
    }
    // Eski tek-anahtar alanları HER ZAMAN Ollama Cloud'a aitti — başka bir
    // sağlayıcıya taşımak o anahtarı yanlış yere göndermek olurdu.
    const legacyKey = status.ollamaCloudApiKey ?? status.aiApiKey;
    if (legacyKey) {
        status.aiApiKeys = status.aiApiKeys || {};
        if (!status.aiApiKeys['ollama-cloud']) status.aiApiKeys['ollama-cloud'] = legacyKey;
        if (status.aiCloudProvider === undefined) status.aiCloudProvider = 'ollama-cloud';
    }
    delete status.ollamaConnectionMode;
    delete status.ollamaCloudApiKey;
    delete status.aiApiKey;
    return status;
}

// Kullanıcının girdiği adresin sonundaki eğik çizgiyi atar — yoksa
// "http://host:1//v1/models" gibi adresler üretilir.
export function normalizeEndpoint(endpoint) {
    return String(endpoint || '').trim().replace(/\/+$/, '');
}

// ============================
// Çözümleme (resolve)
// ============================
// Kaydedilmiş ayarları, ai-client.js'in ihtiyaç duyduğu somut bağlantıya
// çevirir. `mode`: 'local' (bir adresteki sunucu) | 'api' (bulut sağlayıcı).
//
// DİKKAT — bir yerel adres yerel HESAPLAMA anlamına gelmez: Ollama'nın
// "*-cloud" etiketli modelleri aynı 127.0.0.1:11434 üzerinden kendi
// sunucularında koşar. Bu yüzden eksen "isteğin nereye gönderildiği"dir,
// "ağırlıkların nerede çalıştığı" değil.
export function resolveConnection(settings = {}) {
    const mode = ['api', 'agent'].includes(settings.aiConnectionMode)
        ? settings.aiConnectionMode : 'local';

    // Kurulu bir CLI ajanı: adres/anahtar yok, bir süreç çalıştırılır.
    // Yetenek sınırları AÇIKÇA bildirilir (gömme/görsel/model indirme yok) —
    // sessizce boş sonuç döndürmek yerine çağıran taraf bunu bilsin.
    if (mode === 'agent') {
        const agent = findCliAgent(settings.aiAgentId) || CLI_AGENTS[0];
        return {
            mode,
            dialect: 'cli',
            baseUrl: '',
            apiKey: '',
            providerId: agent.id,
            label: agent.label,
            needsKey: false,
            canPull: false,
            canEmbed: false,
            canVision: false,
            hasModelList: false,
            missingKey: false,
            missingEndpoint: false,
            startHint: `${agent.label} kurulu değilse: ${agent.docUrl}`,
        };
    }

    if (mode === 'api') {
        const provider = findCloudProvider(settings.aiCloudProvider);
        const baseUrl = normalizeEndpoint(
            provider.custom ? settings.aiCloudBaseUrl : provider.baseUrl);
        return {
            mode,
            dialect: provider.dialect,
            baseUrl,
            apiKey: apiKeyFor(settings, provider.id),
            providerId: provider.id,
            label: provider.label,
            needsKey: provider.needsKey,
            canPull: false,
            canEmbed: true,
            canVision: true,
            hasModelList: true,
            missingKey: provider.needsKey && !apiKeyFor(settings, provider.id),
            missingEndpoint: !baseUrl,
            keyHint: provider.keyHint,
        };
    }

    const runtime = findLocalRuntime(settings.aiLocalRuntime);
    const baseUrl = normalizeEndpoint(settings.aiLocalEndpoint || runtime.defaultEndpoint);
    return {
        mode,
        dialect: runtime.dialect,
        baseUrl,
        apiKey: settings.aiLocalApiKey || '', // bazı yerel sunucular token isteyebilir
        providerId: runtime.id,
        label: runtime.label,
        needsKey: false,
        canPull: runtime.canPull === true,
        canEmbed: true,
        canVision: true,
        hasModelList: true,
        missingKey: false,
        missingEndpoint: !baseUrl,
        startHint: runtime.startHint,
    };
}

// Bağlantı kullanılabilir mi, değilse NEDEN — hata mesajı çözümü içermeli.
export function describeConnectionProblem(conn) {
    if (conn.mode === 'agent') return null; // kurulu olup olmadığı ayrıca denetlenir
    if (conn.missingEndpoint) {
        return conn.mode === 'api'
            ? `${conn.label} için adres girilmemiş.`
            : `${conn.label} için sunucu adresi girilmemiş.`;
    }
    if (conn.missingKey) {
        return `${conn.label} bir API anahtarı gerektiriyor (${conn.keyHint}).`;
    }
    return null;
}
