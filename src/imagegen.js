// Image generation backends for the AI bot's "draw me a picture" requests —
// Chat providers have no image-generation model, so these get routed here
// instead (see ai.js's classifyImageIntent() for how a message gets flagged
// as an image request, and bot.js's handleAiMessage for where the two paths
// split). Pollinations needs no API key; OpenAI/Stability AI do — see
// src/config.js's imageGenApiKeyOpenai/imageGenApiKeyStability. ComfyUI is
// the user's own local server: no key, but an address + a checkpoint
// (imageGenComfyEndpoint/imageGenComfyModel).

// Pollinations.ai: https://image.pollinations.ai/prompt/{prompt} returns
// the generated image directly as the HTTP response body. Anonymous use is
// rate-limited (roughly one request per 15s) but otherwise free and
// key-less.
const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt/';

// Image generation can legitimately take a while, but none of these three
// providers had any timeout at all — a stalled upstream connection used to
// hang the whole request (and the "thinking..." reply) indefinitely.
const REQUEST_TIMEOUT_MS = 120_000;

async function generateWithPollinations(prompt, { model = 'flux', width = 1024, height = 1024 } = {}) {
    const url = `${POLLINATIONS_BASE}${encodeURIComponent(prompt)}` +
        `?model=${encodeURIComponent(model)}&width=${width}&height=${height}&nologo=true`;

    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) {
        throw new Error(`Pollinations request failed (HTTP ${res.status})`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const mimetype = res.headers.get('content-type') || 'image/jpeg';
    return { buffer, mimetype };
}

async function generateWithOpenAI(prompt, apiKey) {
    if (!apiKey) throw new Error('OpenAI API anahtarı girilmemiş.');
    const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'dall-e-3',
            prompt,
            n: 1,
            size: '1024x1024',
            response_format: 'b64_json',
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(`OpenAI: ${json?.error?.message || `HTTP ${res.status}`}`);
    }
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI yanıtında görsel verisi yok.');
    return { buffer: Buffer.from(b64, 'base64'), mimetype: 'image/png' };
}

async function generateWithStability(prompt, apiKey) {
    if (!apiKey) throw new Error('Stability AI API anahtarı girilmemiş.');
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('output_format', 'png');
    const res = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'image/*',
        },
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Stability AI: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, mimetype: res.headers.get('content-type') || 'image/png' };
}

// ============================
// ComfyUI (local)
// ============================
// ComfyUI has no "text in, image out" endpoint — it runs node graphs. So we
// send the same minimal txt2img graph its own default workflow uses
// (checkpoint → two text encodes → empty latent → KSampler → VAE decode →
// preview), queue it on /prompt, wait on /history and fetch the bytes from
// /view. PreviewImage instead of SaveImage: the result comes back to the
// chat, it doesn't need to pile up in the user's ComfyUI output folder.
export const COMFY_DEFAULT_ENDPOINT = 'http://127.0.0.1:8188';
// First load of an SDXL/Flux model on a laptop GPU with RAM to spare takes
// a minute; with the rest of the desktop pushing it into swap, 3-4 minutes
// was measured. The job may also wait behind the user's own queue — far
// longer than the hosted providers above ever need.
const COMFY_TIMEOUT_MS = 600_000;
const COMFY_POLL_MS = 1000;
// CheckpointLoaderSimple lists every .safetensors in models/checkpoints,
// audio/pose/video ones included. They stay pickable, but "auto" (no model
// chosen) skips them.
const COMFY_NON_IMAGE_CKPT = /audio|ace[_-]?step|sdpose|svd|video|wan2/i;
const COMFY_NEGATIVE = 'lowres, worst quality, low quality, blurry, jpeg artifacts, watermark, text, signature, bad anatomy, deformed';

function comfyBase(endpoint) {
    return String(endpoint || COMFY_DEFAULT_ENDPOINT).trim().replace(/\/+$/, '');
}

async function comfyFetch(endpoint, pathname, init = {}) {
    const url = comfyBase(endpoint) + pathname;
    let res;
    try {
        res = await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(15_000) });
    } catch (err) {
        if (err.name === 'TimeoutError' || err.name === 'AbortError') throw err;
        throw new Error(`ComfyUI'ye ulaşılamadı (${comfyBase(endpoint)}). ComfyUI açık mı?`);
    }
    return res;
}

// The checkpoints ComfyUI can load, straight from the loader node's own
// input schema — the same list its "Load Checkpoint" dropdown shows.
export async function listComfyModels(endpoint) {
    const res = await comfyFetch(endpoint, '/object_info/CheckpointLoaderSimple');
    if (!res.ok) throw new Error(`ComfyUI: HTTP ${res.status}`);
    const json = await res.json();
    const names = json?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
    return Array.isArray(names) ? names : [];
}

// SD 1.x/2.x checkpoints were trained at 512 and produce tiled/duplicated
// subjects at 1024; everything newer (SDXL, Pony, Illustrious …) wants 1024.
// The file name is all we have to go on.
function comfySize(model) {
    return /(^|[^a-z])(sd[-_ ]?1|v1[-_]5|sd15|sd[-_ ]?2)/i.test(model) ? 512 : 1024;
}

function comfyTxt2ImgGraph(prompt, model) {
    const size = comfySize(model);
    return {
        '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model } },
        '6': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['4', 1] } },
        '7': { class_type: 'CLIPTextEncode', inputs: { text: COMFY_NEGATIVE, clip: ['4', 1] } },
        '5': { class_type: 'EmptyLatentImage', inputs: { width: size, height: size, batch_size: 1 } },
        '3': { class_type: 'KSampler', inputs: {
            seed: Math.floor(Math.random() * 2 ** 48), steps: 25, cfg: 6.5,
            sampler_name: 'euler_ancestral', scheduler: 'normal', denoise: 1,
            model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0],
        } },
        '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
        '9': { class_type: 'PreviewImage', inputs: { images: ['8', 0] } },
    };
}

// ComfyUI's 400 body is { error: {message, details}, node_errors: {id: {errors: [...]}} }.
function comfyErrorText(json) {
    const nodeErr = Object.values(json?.node_errors || {})[0]?.errors?.[0];
    const e = nodeErr || json?.error;
    if (!e) return null;
    return [e.message, e.details].filter(Boolean).join(': ');
}

// A user's own graph, exported from ComfyUI with "Export (API)" — the way
// to use anything the built-in checkpoint graph can't drive (Flux, SD3,
// diffusion_models + separate CLIP/VAE, LoRAs, upscalers …). `%prompt%` in
// any text input becomes the request; seeds are re-rolled so the same
// request doesn't return the same picture every time.
const COMFY_PROMPT_TOKEN = '%prompt%';
const COMFY_SEED_KEYS = new Set(['seed', 'noise_seed']);

function comfyCustomGraph(workflowJson, prompt) {
    let graph;
    try {
        graph = JSON.parse(workflowJson);
    } catch (_) {
        throw new Error('ComfyUI iş akışı geçerli bir JSON değil.');
    }
    // The UI's normal "Save" format has a nodes[] array instead of
    // id → {class_type, inputs}; the server can't run that one.
    const nodes = graph && typeof graph === 'object' && !Array.isArray(graph.nodes) ? Object.values(graph) : [];
    if (!nodes.length || !nodes.every(n => n && typeof n.class_type === 'string')) {
        throw new Error('ComfyUI iş akışı API biçiminde değil — ComfyUI\'de Workflow → Export (API) ile dışa aktar.');
    }
    let hasToken = false;
    for (const node of nodes) {
        for (const [key, value] of Object.entries(node.inputs || {})) {
            if (typeof value === 'string' && value.includes(COMFY_PROMPT_TOKEN)) {
                node.inputs[key] = value.split(COMFY_PROMPT_TOKEN).join(prompt);
                hasToken = true;
            } else if (COMFY_SEED_KEYS.has(key) && typeof value === 'number') {
                node.inputs[key] = Math.floor(Math.random() * 2 ** 48);
            }
        }
    }
    if (!hasToken) throw new Error(`ComfyUI iş akışında ${COMFY_PROMPT_TOKEN} yok — istem kutusuna ${COMFY_PROMPT_TOKEN} yaz.`);
    return graph;
}

async function generateWithComfy(prompt, { endpoint, model, workflow } = {}) {
    const deadline = Date.now() + COMFY_TIMEOUT_MS;
    let graph;
    if (workflow && workflow.trim()) {
        graph = comfyCustomGraph(workflow, prompt);
    } else {
        let ckpt = model;
        if (!ckpt) {
            const models = await listComfyModels(endpoint);
            ckpt = models.find(m => !COMFY_NON_IMAGE_CKPT.test(m)) || models[0];
            if (!ckpt) throw new Error('ComfyUI\'de hiç checkpoint yok (models/checkpoints boş).');
        }
        graph = comfyTxt2ImgGraph(prompt, ckpt);
    }

    const queued = await comfyFetch(endpoint, '/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: graph, client_id: 'nerobot' }),
    });
    const queuedJson = await queued.json().catch(() => null);
    if (!queued.ok || !queuedJson?.prompt_id) {
        throw new Error(`ComfyUI: ${comfyErrorText(queuedJson) || `HTTP ${queued.status}`}`);
    }
    const id = queuedJson.prompt_id;

    // /history/{id} stays {} until the job has finished (or failed).
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, COMFY_POLL_MS));
        // While a big model loads, ComfyUI's web server can stall past a
        // single request's timeout — that's "not done yet", not a failure.
        const res = await comfyFetch(endpoint, `/history/${encodeURIComponent(id)}`).catch(() => null);
        if (!res?.ok) continue;
        const entry = (await res.json().catch(() => null))?.[id];
        if (!entry) continue;
        if (entry.status?.status_str === 'error') {
            const msg = entry.status.messages?.find(([type]) => type === 'execution_error')?.[1];
            throw new Error(`ComfyUI: ${msg?.exception_message?.trim() || 'üretim başarısız oldu.'}`);
        }
        // A custom graph can have several image outputs (a preview of the
        // raw result next to an upscaled save, say) — the last one is the
        // end of the chain.
        const image = Object.values(entry.outputs || {}).flatMap(o => o.images || []).at(-1);
        if (!image) {
            if (entry.status?.completed) throw new Error('ComfyUI yanıtında görsel yok.');
            continue;
        }
        const qs = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || '', type: image.type || 'temp' });
        const view = await comfyFetch(endpoint, `/view?${qs}`);
        if (!view.ok) throw new Error(`ComfyUI görseli veremedi (HTTP ${view.status}).`);
        return { buffer: Buffer.from(await view.arrayBuffer()), mimetype: view.headers.get('content-type') || 'image/png' };
    }
    // Leave the user's queue clean — a job we've given up on shouldn't keep
    // the GPU busy afterwards. Both calls are scoped to this prompt_id: the
    // delete only touches pending jobs, and /interrupt with a prompt_id is a
    // no-op unless that exact job is the one running.
    const json = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
    comfyFetch(endpoint, '/queue', { ...json, body: JSON.stringify({ delete: [id] }) }).catch(() => {});
    comfyFetch(endpoint, '/interrupt', { ...json, body: JSON.stringify({ prompt_id: id }) }).catch(() => {});
    throw new Error('ComfyUI zamanında yanıt vermedi.');
}

// `opts.provider`: 'pollinations' (default, no key) | 'openai' | 'stability'
// | 'comfyui'. `opts.apiKey` only matters for openai/stability,
// `opts.comfyEndpoint`/`opts.comfyModel`/`opts.comfyWorkflow` only for
// comfyui (a non-empty workflow wins over the model).
export async function generateImage(prompt, opts = {}) {
    const provider = opts.provider || 'pollinations';
    if (provider === 'openai') return generateWithOpenAI(prompt, opts.apiKey);
    if (provider === 'stability') return generateWithStability(prompt, opts.apiKey);
    if (provider === 'comfyui') {
        return generateWithComfy(prompt, { endpoint: opts.comfyEndpoint, model: opts.comfyModel, workflow: opts.comfyWorkflow });
    }
    return generateWithPollinations(prompt, opts);
}

// The generateImage() options for a settings object — a WA/Telegram
// profile's state and NeRoChAt's status file both carry the same
// imageGen* keys, so all three call sites read them through here.
export function imageGenOptions(settings) {
    const provider = settings.imageGenProvider || 'pollinations';
    return {
        provider,
        apiKey: provider === 'openai' ? settings.imageGenApiKeyOpenai
            : provider === 'stability' ? settings.imageGenApiKeyStability
            : undefined,
        comfyEndpoint: settings.imageGenComfyEndpoint,
        comfyModel: settings.imageGenComfyModel,
        comfyWorkflow: settings.imageGenComfyWorkflow,
    };
}
