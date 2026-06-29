import ollama from 'ollama';
import { state, chatHistories, chatModels } from './config.js';

export async function askModel(userId, prompt, images = []) {
    if (!chatHistories[userId]) {
        chatHistories[userId] = [
            { role: 'system', content: state.systemPrompt }
        ];
    }

    // Temporarily add user message
    // `images` should be an array of base64 strings (no data: prefix) —
    // this is the format Ollama expects for vision-capable models.
    const userMessage = { role: 'user', content: prompt };
    if (images.length > 0) {
        userMessage.images = images;
    }
    chatHistories[userId].push(userMessage);

    // Use this chat's model override if one is set, otherwise fall back
    // to the global/main model.
    const modelToUse = chatModels[userId] || state.aiModel;

    try {
        const response = await ollama.chat({
            model: modelToUse,
            messages: chatHistories[userId]
        });

        chatHistories[userId].push({ role: 'assistant', content: response.message.content });

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