// No more `import ollama from 'ollama'` — every call below takes the
// resolved client (local daemon or Ollama Cloud API, see
// src/ollama-client.js's getOllamaClient) as an explicit
// parameter instead, so this file never assumes which one is in use.

// How much of a chat's history actually gets sent to the model on every
// request. Previously this was "the entire raw array, forever" — fine for
// a short chat, but it grows unbounded for a long-running one (slower
// requests, eventually blows past the model's context window). Now:
//   - the most recent RECENT_KEEP messages are always included (so replies
//     stay coherent turn-to-turn), PLUS
//   - up to RELEVANT_TOPK older messages that are semantically closest to
//     the CURRENT prompt (embedding cosine similarity) — e.g. something
//     mentioned 40 messages ago that's actually relevant again now.
// If embeddings aren't available (embed model not pulled, or
// vectorMemoryEnabled is off), this quietly degrades to a plain
// MAX_PLAIN_HISTORY-sized recency window instead — never crashes, never
// blocks the AI from responding.
const RECENT_KEEP = 6;
const RELEVANT_TOPK = 6;
const MAX_PLAIN_HISTORY = 30;

// Hard cap on how much of a chat's history is kept in memory at all (well
// above what selectContext ever actually sends — see above). Without this,
// chatHistories[userId] — including each message's cached _embedding vector
// — grows for as long as the process runs, unbounded, for every distinct
// user/chat ever seen.
const MAX_STORED_HISTORY = 200;

// Classifies a single message as an image-generation request or not, using
// the profile's own chat model — no extra service/cost, since it's the same
// local Ollama call the profile already has. See classifyImageIntent() below.
// Exported so main.js's NeRoChAt-side image flow (app/main.js's
// 'ollama:classifyImageIntent'/'ollama:generateImage' handlers) uses the
// exact same wording instead of a copy that could quietly drift out of sync.
export const IMAGE_CLASSIFY_PROMPT =
    'You classify a single chat message. Reply with ONLY compact JSON and ' +
    'nothing else: {"image": true or false, "prompt": "short English ' +
    'image-generation prompt, only if image is true, else empty string"}. ' +
    'Set "image" to true if the user is clearly asking to have a ' +
    'picture/image/drawing/photo/logo/artwork generated or drawn for them — ' +
    'this also includes asking to redraw/regenerate/recreate/remake an image ' +
    'they just attached (e.g. "draw this again", "regenerate it", "make a ' +
    'new version"), which a "[the user also attached a photo]" note at the ' +
    'end of the message will tell you about; in that specific case leave ' +
    '"prompt" empty, it will be filled in separately from the photo itself. ' +
    'Do not set "image" true for general conversation, questions, or a bare ' +
    'request to read/describe/analyze an attached image with no request to ' +
    'redraw/regenerate it.';

// Used when an image-generation request came with a photo attached (e.g.
// "regenerate this") instead of plain text — turns that photo into a short
// text prompt via the profile's own vision-capable model first, since the
// image backends (imagegen.js) are text-to-image only. See
// describeImageForGeneration() below.
export const IMAGE_DESCRIBE_FOR_GEN_PROMPT =
    'Describe this image in one short, vivid sentence suitable as a prompt ' +
    'for an image-generation AI — the visual subject, style, colors, and ' +
    'composition. Reply with ONLY the description, nothing else.';

// Used when the model actually being talked to has no vision capability at
// all (see modelHasVision/resolveVisionModel below) — a fuller description
// than IMAGE_DESCRIBE_FOR_GEN_PROMPT's one-liner, since here it's standing
// in for the model actually seeing the image in a real conversation, not
// just seeding a generation prompt.
export const IMAGE_READ_FALLBACK_PROMPT =
    'Describe this image in detail — objects, people, visible text, colors, ' +
    'setting, and mood, anything relevant — as if explaining it to someone ' +
    'who cannot see it themselves. Reply with ONLY the description, nothing else.';

// Per-model vision support (Ollama's show() capabilities list, e.g.
// ["completion","vision","tools"]) rarely if ever changes for a given
// model/tag, so it's cheap to cache for the life of the process instead of
// re-querying Ollama on every single image sent.
const visionCapabilityCache = new Map();

export async function modelHasVision(modelName, ollamaClient) {
    if (!modelName) return false;
    if (visionCapabilityCache.has(modelName)) return visionCapabilityCache.get(modelName);
    try {
        const info = await ollamaClient.show({ model: modelName });
        const has = Array.isArray(info.capabilities) && info.capabilities.includes('vision');
        visionCapabilityCache.set(modelName, has);
        return has;
    } catch (_) {
        // Unreachable/unknown model — assume it can, so a transient show()
        // failure doesn't silently reroute to a fallback for a model that
        // was actually fine; this matches this app's behavior before this
        // capability check existed at all (attach the image, let Ollama's
        // own chat call be the one that succeeds or fails).
        return true;
    }
}

// Scans whatever's currently pulled for a vision-capable model to caption
// images with, when the profile's own model can't see them (see
// resolveVisionModel below). Prefers a genuinely local one first — same
// quota-saving spirit as pickClassifierModel — then any vision-capable
// model at all, cloud or not, rather than giving up.
export async function pickVisionFallbackModel(excludeModel, ollamaClient) {
    try {
        const { models } = await ollamaClient.list();
        const candidates = models.filter(m => m.name !== excludeModel);
        for (const localOnly of [true, false]) {
            for (const m of candidates) {
                if (localOnly && !isLocallyStored(m)) continue;
                if (await modelHasVision(m.name, ollamaClient)) return m.name;
            }
        }
    } catch (_) {}
    return null;
}

// `preferredModel` if it can already see images itself, otherwise whatever
// pickVisionFallbackModel finds — null if nothing pulled supports vision at
// all. Used both by askModel's inline fallback below and by
// describeImageForGeneration (the "redraw this attached photo" flow).
export async function resolveVisionModel(preferredModel, ollamaClient) {
    if (await modelHasVision(preferredModel, ollamaClient)) return preferredModel;
    return pickVisionFallbackModel(preferredModel, ollamaClient);
}

// Folded straight into the user turn's own content (not a separate system
// message — some models only reliably honor the FIRST system message in a
// request and ignore/ merge later ones, which was silently dropping this
// note and leaving the model insisting it can't generate images even though
// it just "saw" one go out). Embedding it in the same message the model is
// actually replying to is far more consistently followed. See
// describeGeneratedImage() below — never persisted anywhere the user can see.
// Exported for the same reason as IMAGE_CLASSIFY_PROMPT above.
export const IMAGE_ACK_NOTE =
    '\n\n[You just generated and sent the user a real image for this ' +
    'request — it has already been delivered. Reply naturally and briefly ' +
    'in your own voice, as if you drew/created it yourself. Never say you ' +
    "can't generate images, and never mention any external tool, model, or " +
    'service — you made this one.]';

// Ollama's own cloud-hosted models (run on ollama.com's infrastructure
// against a metered allowance, not on this machine) are USUALLY tagged with
// a "...cloud" tag — e.g. "minimax-m3:cloud" (this app's own default
// model), "gpt-oss:120b-cloud". Name-only, no API call needed — but not
// fully reliable (see isLocallyStored below): a community-published model
// can silently proxy to a cloud backend under an ordinary-looking tag (e.g.
// "selfamol/shogun-waka:latest" isn't tagged "cloud" at all but is one —
// its ollama.list() `size` is a couple KB, not real model weights). Kept as
// a cheap fallback for when only a bare name is on hand, with no
// corresponding ollama.list() entry to check size on.
export function isCloudModel(name) {
    const tag = String(name || '').split(':')[1] || '';
    return tag === 'cloud' || tag.endsWith('-cloud');
}

// The actually-reliable local/cloud signal: a real local model's on-disk
// weights are always at least tens of MB; a cloud-routed one's ollama.list()
// entry is just a small manifest pointer, however its tag reads.
const MIN_LOCAL_MODEL_BYTES = 1_000_000;
function isLocallyStored(modelListEntry) {
    return typeof modelListEntry?.size === 'number' && modelListEntry.size >= MIN_LOCAL_MODEL_BYTES;
}

// For classification-only calls — not the real reply the user reads, just
// an internal "is this an image-gen request?" check (see
// classifyImageIntent below) — prefer whatever's already pulled locally
// over the profile's actual (often cloud/metered) chat model, so this
// purely internal check doesn't spend any of that allowance. Falls back to
// the preferred model itself if it's already local (or its size can't be
// checked at all), or if nothing local is pulled.
export async function pickClassifierModel(preferredModel, ollamaClient) {
    try {
        const { models } = await ollamaClient.list();
        const preferredEntry = models.find(m => m.name === preferredModel);
        if (preferredEntry && isLocallyStored(preferredEntry)) return preferredModel;
        const local = models.find(isLocallyStored);
        if (local) return local.name;
    } catch (_) {}
    return preferredModel;
}

function cosineSimilarity(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom ? dot / denom : 0;
}

// Per-profile AI chat. Wrapped in a factory so each profile's memory
// (chatHistories) and model overrides never mix with another profile's —
// two different WhatsApp accounts talking to the same contact must not
// merge into one conversation.
export function createAi({ store, utils }) {
    const { state, chatHistories, chatModels } = store;
    const { mapGetAny, getOllamaClient } = utils;

    // Only warn once per profile run — an unpulled embed model would
    // otherwise log the same warning on every single message.
    let embedUnavailableWarned = false;

    // Serializes askModel() calls per userId/memoryKey. Without this, two
    // messages from the same user (or two group members sharing one
    // memoryKey — see bot.js's handleAiMessage) arriving close together
    // would both read chatHistories[userId], then both push/await/push
    // concurrently — interleaved writes can reorder history, and an error
    // in one call would pop() the OTHER call's message off the end. Chains
    // each new call onto the previous one for the same key so only one
    // runs against that chat's history at a time; unrelated keys never wait
    // on each other.
    const memoryLocks = new Map(); // userId → tail promise of the lock chain
    function withMemoryLock(userId, fn) {
        const prev = memoryLocks.get(userId) || Promise.resolve();
        const run = prev.then(fn, fn);
        const tracked = run.catch(() => {});
        memoryLocks.set(userId, tracked);
        tracked.finally(() => {
            if (memoryLocks.get(userId) === tracked) memoryLocks.delete(userId);
        });
        return run;
    }

    async function embed(text) {
        if (!state.vectorMemoryEnabled) return null;
        try {
            const res = await getOllamaClient().embed({ model: state.embedModel, input: text });
            return res.embeddings?.[0] || null;
        } catch (err) {
            if (!embedUnavailableWarned) {
                embedUnavailableWarned = true;
                console.warn(`[AI] Vektör hafıza kullanılamıyor (embed modeli "${state.embedModel}" bulunamıyor olabilir) — bu profil için basit (son mesajlara dayalı) hafızaya dönülüyor. Denemek için: ollama pull ${state.embedModel}`);
            }
            return null;
        }
    }

    // Picks which of a chat's stored messages actually go to the model this
    // turn. `full` is chatHistories[userId] with the new user message
    // already pushed onto the end.
    function selectContext(full, latestEmbedding) {
        const system = full[0];
        const latest = full[full.length - 1];
        const rest = full.slice(1, -1);

        if (!latestEmbedding || rest.length <= RECENT_KEEP) {
            return [system, ...rest.slice(-MAX_PLAIN_HISTORY), latest];
        }

        const recent = rest.slice(-RECENT_KEEP);
        const olderCandidates = rest.slice(0, -RECENT_KEEP).filter(m => m._embedding);
        const topRelevant = new Set(
            olderCandidates
                .map(m => ({ m, score: cosineSimilarity(m._embedding, latestEmbedding) }))
                .sort((a, b) => b.score - a.score)
                .slice(0, RELEVANT_TOPK)
                .map(x => x.m)
        );
        // Keep whatever made the cut in ORIGINAL chronological order (not
        // relevance order) — the model reads a conversation, not a ranked list.
        const relevantInOrder = rest.filter(m => topRelevant.has(m));
        return [system, ...relevantInOrder, ...recent, latest];
    }

    // Strips internal bookkeeping (the cached _embedding vector) before
    // handing messages to Ollama's chat API, which only expects
    // role/content/images.
    function toApiMessages(messages) {
        return messages.map(({ role, content, images }) =>
            images ? { role, content, images } : { role, content });
    }

    // Same idea as describeImageForGeneration below, just for reading rather
    // than generating: a one-off captioning call to a vision-capable model.
    async function describeImageForReading(model, imageBase64) {
        const response = await getOllamaClient().chat({
            model,
            messages: [
                { role: 'system', content: IMAGE_READ_FALLBACK_PROMPT },
                { role: 'user', content: 'Describe this image.', images: [imageBase64] },
            ],
        });
        return response.message.content.trim();
    }

    function askModel(userId, prompt, images = [], extraInstruction = null) {
        return withMemoryLock(userId, () => askModelLocked(userId, prompt, images, extraInstruction));
    }

    async function askModelLocked(userId, prompt, images = [], extraInstruction = null) {
        if (!chatHistories[userId]) {
            chatHistories[userId] = [
                { role: 'system', content: state.systemPrompt }
            ];
        }

        // Use this chat's model override if one is set, otherwise fall back
        // to the global/main model. The override may be stored under either ID
        // form (@lid or @c.us) — mapGetAny checks both. Resolved up front
        // (rather than after building userMessage, as before) because the
        // image handling right below needs to know it first.
        const modelToUse = (await mapGetAny(chatModels, userId)) || state.aiModel;

        // `images` should be an array of base64 strings (no data: prefix) —
        // the format Ollama expects for vision-capable models. If
        // modelToUse can't actually see images, caption them ourselves with
        // whatever vision-capable model IS pulled and fold that description
        // into the text instead — keeps "what's in this picture?" (and, via
        // describeImageForGeneration, "redraw this") working even on a
        // text-only chat model, rather than the image being silently
        // dropped or rejected by Ollama.
        let content = prompt;
        let attachImages = null;
        if (images.length > 0) {
            if (await modelHasVision(modelToUse, getOllamaClient())) {
                attachImages = images;
            } else {
                const visionModel = await pickVisionFallbackModel(modelToUse, getOllamaClient());
                if (visionModel) {
                    const captions = await Promise.all(images.map(img => describeImageForReading(visionModel, img)));
                    content = `${prompt}\n\n[Attached image — description: ${captions.join(' | ')}]`;
                } else {
                    attachImages = images; // no vision model available anywhere — best effort, same as before this fallback existed
                }
            }
        }

        const userMessage = { role: 'user', content };
        if (attachImages) userMessage.images = attachImages;

        const latestEmbedding = await embed(prompt);
        if (latestEmbedding) userMessage._embedding = latestEmbedding;
        chatHistories[userId].push(userMessage);

        try {
            const context = selectContext(chatHistories[userId], latestEmbedding);
            const apiMessages = toApiMessages(context);
            if (extraInstruction) apiMessages.push({ role: 'system', content: extraInstruction });
            const response = await getOllamaClient().chat({
                model: modelToUse,
                messages: apiMessages
            });

            const assistantMessage = { role: 'assistant', content: response.message.content };
            const replyEmbedding = await embed(response.message.content);
            if (replyEmbedding) assistantMessage._embedding = replyEmbedding;
            chatHistories[userId].push(assistantMessage);

            // Trim oldest non-system messages once the stored history grows
            // past the cap — index 0 is always the system prompt, so drop
            // starting at index 1.
            const hist = chatHistories[userId];
            if (hist.length > MAX_STORED_HISTORY) {
                hist.splice(1, hist.length - MAX_STORED_HISTORY);
            }

            return response.message.content;

        } catch (err) {
            // Roll back the user message on error to keep history clean
            chatHistories[userId].pop();

            // Re-throw with context so the caller can route this to the
            // debug channel instead of the active chat.
            const wrapped = new Error(`AI failed to respond.\nModel: ${modelToUse}\nReason: ${err.message || err}`);
            wrapped.cause = err;
            throw wrapped;
        }
    }

    // Errors/parse failures just mean "not an image request" — this must
    // never block the normal reply path a message would otherwise take.
    // `hasImage` — a photo came attached with this message — lets the
    // classifier recognize "regenerate/redraw this" as an image request too
    // (see IMAGE_CLASSIFY_PROMPT); the actual attached-image case is handled
    // by describeImageForGeneration() below, this function only decides intent.
    async function classifyImageIntent(prompt, hasImage = false) {
        if (!prompt) return { image: false, prompt: '' };
        try {
            const content = hasImage ? `${prompt}\n\n[the user also attached a photo]` : prompt;
            const response = await getOllamaClient().chat({
                model: await pickClassifierModel(state.aiModel, getOllamaClient()),
                messages: [
                    { role: 'system', content: IMAGE_CLASSIFY_PROMPT },
                    { role: 'user', content },
                ],
            });
            const match = response.message.content.match(/\{[\s\S]*\}/);
            if (!match) return { image: false, prompt: '' };
            const parsed = JSON.parse(match[0]);
            return {
                image: parsed.image === true,
                prompt: typeof parsed.prompt === 'string' ? parsed.prompt.slice(0, 500) : '',
            };
        } catch (_) {
            return { image: false, prompt: '' };
        }
    }

    // Turns an attached photo into a short text prompt (via the profile's
    // model if it can see images itself, otherwise whatever vision-capable
    // model IS pulled — see resolveVisionModel) so it can be handed to
    // imagegen.js, which only takes text — used when classifyImageIntent()
    // above says the user is asking to redraw/regenerate an image they just
    // sent, not merely read/describe it. `extraInstruction` is whatever they
    // typed alongside the photo (e.g. "make it more colorful"), folded in as
    // extra guidance.
    async function describeImageForGeneration(imageBase64, extraInstruction) {
        const visionModel = await resolveVisionModel(state.aiModel, getOllamaClient());
        if (!visionModel) {
            throw new Error('No vision-capable model is available to read the attached image — pull one (e.g. llava, qwen2.5vl) first.');
        }
        const response = await getOllamaClient().chat({
            model: visionModel,
            messages: [
                { role: 'system', content: IMAGE_DESCRIBE_FOR_GEN_PROMPT },
                { role: 'user', content: extraInstruction || 'Describe this image.', images: [imageBase64] },
            ],
        });
        return response.message.content.trim();
    }

    // Asks the chat model to react to an image it "just made" (really made
    // by imagegen.js, see bot.js) — reuses askModel() as-is so this turn
    // gets logged into the same chat history like any other exchange, and
    // future turns naturally see "I made this" from the model's own reply.
    function describeGeneratedImage(userId, prompt) {
        return askModel(userId, `${prompt}${IMAGE_ACK_NOTE}`, []);
    }

    return { askModel, classifyImageIntent, describeImageForGeneration, describeGeneratedImage };
}
