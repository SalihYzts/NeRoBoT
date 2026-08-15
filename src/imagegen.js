// Image generation backends for the AI bot's "draw me a picture" requests —
// Ollama itself has no image-generation model, so these get routed here
// instead (see ai.js's classifyImageIntent() for how a message gets flagged
// as an image request, and bot.js's handleAiMessage for where the two paths
// split). Pollinations needs no API key; OpenAI/Stability AI do — see
// src/config.js's imageGenApiKeyOpenai/imageGenApiKeyStability.

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

// `opts.provider`: 'pollinations' (default, no key) | 'openai' | 'stability'.
// `opts.apiKey` only matters for the latter two.
export async function generateImage(prompt, opts = {}) {
    const provider = opts.provider || 'pollinations';
    if (provider === 'openai') return generateWithOpenAI(prompt, opts.apiKey);
    if (provider === 'stability') return generateWithStability(prompt, opts.apiKey);
    return generateWithPollinations(prompt, opts);
}
