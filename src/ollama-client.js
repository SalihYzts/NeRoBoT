import { Ollama } from 'ollama';

// Which Ollama instance every ai/bot/main-process call actually talks to —
// the profile's usual local daemon (http://127.0.0.1:11434, this package's
// own default) or Ollama's hosted cloud API (an account + API key from
// ollama.com, no local install at all). Every ollama.chat()/list()/embed()/
// etc. call in this codebase used to import the package's fixed singleton
// directly; they all now call getOllamaClient(status) instead, so switching
// modes (see app/main.js's readOllamaStatus/ollamaConnectionMode, and the
// Ayarlar → NeRoChAt "Bağlantı" section in index.html) only ever needs to
// change WHICH client instance is returned here, never the shape of any
// individual call.
//
// Electron-agnostic on purpose, like every other src/*.js file
// — `status` is handed in by the caller (main.js's readOllamaStatus(), or
// that same value threaded through utils.getOllamaClient() for the
// per-profile bot code in ai.js/commands.js) rather than this module
// reading any file/Electron API itself.
//
// UNVERIFIED ASSUMPTION (no live network access to confirm while writing
// this): Ollama Cloud's actual host is https://ollama.com and it accepts a
// plain "Authorization: Bearer <key>" header, same shape as this package's
// own hardcoded https://ollama.com/api/web_fetch reference (src/browser.ts)
// suggests. If real testing shows a different host/header, this is the
// only place that needs to change.
const localClient = new Ollama(); // identical to importing the package's own default singleton
let cloudClient = null;
let cloudClientKey = null;

export function getOllamaClient(status) {
    if (status?.ollamaConnectionMode === 'api' && status?.ollamaCloudApiKey) {
        if (cloudClientKey !== status.ollamaCloudApiKey) {
            cloudClient = new Ollama({
                host: 'https://ollama.com',
                headers: { Authorization: `Bearer ${status.ollamaCloudApiKey}` },
            });
            cloudClientKey = status.ollamaCloudApiKey;
        }
        return cloudClient;
    }
    return localClient;
}
