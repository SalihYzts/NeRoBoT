```
                                                                                                      
                                                                                                      
                                                                                                      
        :                                                                                          :  
        -                                                  -                                     :-:: 
   - ::::    :   : --     -          :                  -                              :       ::::   
     : ::::: -   ::::::         :::::::::::: :          ::::::::::::::-    :     : :::::::::::::: ::  
    :- ::::: --- -::::: : : -    - ::::::::::::      :    :::::::::::::::        :  ::::::::.::::-    
  ---- ::::::::  ::::::           ::::: :::::::-     -     :::::  - ::::         - : -- :::::   :     
       :.:.:.:.:  ...::       : :  :..::   ::.:: :   .  :   ..:     :::.   :::. :::    ::.::          
       :::::::::  ..:: -:::::::::: ::.::   ::::  ::::::::::::::: -:-::::- -:::::::::-   ::.:          
    :  ::.: :::::::::: .:::   :::: ::::::.:::: ::::   ::::.-:.::::::::   ::::-   ::::  :::::          
    -   :::   :::::::: :: :::::::: .:::::::::   :::    -::: :: : : ::::: :::     :::    ::::          
    -: :::::  ::-::::: .:::.::.::: :::.::::::  :::::   :::. ::::    ::.: ::::    :::   -:::: -        
   ::  :::::   : ::::: .:::        :::::- :::   ::::   :::.:.:::    :::: ::::   ::::   -:::: -        
        ::::      ::::  :  ::::::  : ::: - -::: ::-:::::::: ::   :: ::::  :::::::::::  :::::::        
       :::::     :::::  :::.::::   :::::   :.::: -::::::   .::::::::::.-  : :.:::. :   ::::: :        
    -- --:::     : :-:      : :    : ::     : ::- :  :    - -       -: :     :   : :   -:::::-        
     : :::-:        ::    : :      ::::     : - ::   :      :          :           :     : :::        
     ::   :                                      ::         :          :                    :         
      :                                                     -                               :         
                                   -                                                         -        
                                                                                                      
                                                                                                      
                                                                                                    
```

**NeRoBoT** is a bot that lets you use AI models powered by [Ollama](https://ollama.com/) through **WhatsApp**. It is built using the `whatsapp-web.js` library.

Developer: **TheSalHeLP**

---
## Documentation
- [Türkçe README](READMETR.md)
- Türkçe README dosyasına ulaşmak için.
---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Commands](#commands)
- [Default Configuration](#default-configuration)
- [Troubleshooting](#troubleshooting)
- [Security Notes](#security-notes)
- [License](#license)

---

## Features

- Local AI Support — Use any model you want through Ollama, including vision models
- Chat Memory — Separate context per chat/user, with optional shared-memory group mode
- Image & File Reading — Reads images (vision), PDF, Word, and plain-text/code files and feeds them to the model
- Whitelist System — Prevent unwanted people from using the bot
- Admin Panel — Only authorized users can run management commands, with a confirmation gate on destructive actions
- Personality — Change the bot's system prompt globally or per chat
- Customizable Prefixes — Main, debug, and ignore prefixes can all be changed
- No-Prefix Mode — Let the bot respond to every message in a chat without needing a prefix
- Fixed Chat Mode — Lock the bot to a single chat
- Rate Limiting — Per-user token-bucket limiter to prevent spam/abuse
- Debug Channel — Forward errors and new-message notifications to a separate chat
- Info Command — View the entire system status in a single message
- Bilingual Help — Help menu available in Turkish and English

---

## Requirements

Make sure you have the following installed before getting started:

- **Node.js** >= 18.x
- **npm** >= 9.x
- **Ollama** (latest)
- **Google Chrome** (latest)
- **Operating System:** Windows / Linux / macOS

---

## Project Structure

```
nerobot/
├── NeRoBoT.js                      # Entry point — WhatsApp client & message routing
├── package.json
├── project_scripts/
│   ├── ai.js                       # Ollama integration
│   ├── config.js                   # State, settings persistence, file paths
│   ├── commands.js                 # All !commands
│   ├── ratelimit.js                # Token-bucket rate limiter
│   └── utils.js                    # Message sending helpers
└── NeRoBoT_db/
    ├── ascii.txt                   # Startup banner
    ├── help.txt                    # Help menu text (TR/EN)
    ├── chatmodels.json             # Per-chat model overrides (committed)
    ├── settings.json               # Generated at runtime
    ├── whitelist.json              # Generated at runtime
    ├── admin.json                  # Generated at runtime
    ├── noprefix.json               # Generated at runtime
    └── groupchat.json              # Generated at runtime
```

The `NeRoBoT_db/*.json` runtime files are created automatically on first run and are **not** committed to git (see `.gitignore`).

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/SalihYzts/NeRoBoT.git
cd nerobot
```

### 2. Install Dependencies

```bash
npm install
```



### 3. Install Ollama and Pull a Model

Download and install Ollama from [ollama.com](https://ollama.com/), then pull the model you want to use:

```bash
ollama pull minimax-m3:cloud
ollama pull llama3.2
ollama pull mistral
ollama pull gemma2
```

### 4. Configuration

<details>
<summary><b>Chrome Path Setting</b></summary>

The Chrome executable path is currently **hardcoded for Windows** in `project_scripts/config.js`:

```javascript
export const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
```

If you are on Linux or macOS, edit this line and point it to your local Chrome/Chromium binary, for example:

- Linux: `/usr/bin/google-chrome`
- macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

> ⚠️ This value is not read from an environment variable yet — it must be edited directly in the source for now.

</details>

<details>
<summary><b>Configuration Files Are Automatic</b></summary>

`project_scripts/config.js` creates `settings.json`, `whitelist.json`, `admin.json`, `noprefix.json`, and `groupchat.json` automatically on first run if they don't already exist. You don't need to create them manually.

</details>

### 5. Start the Bot

```bash
node NeRoBoT.js
```

> **Note:** The Chrome window will open visibly (`headless: false`). The QR code will appear in the terminal.

### 6. Connect to WhatsApp

1. Scan the QR code in the terminal with your phone
2. WhatsApp > Settings > Linked Devices > Link a Device

---

## Commands

All commands use the **debug prefix** (`!` by default) followed by the command name, and most support subcommands (e.g. `!admin add`).

<details>
<summary><b>Admin Management</b></summary>

| Command | Description |
|---|---|
| `!admin` / `!admin list` | Shows the admin list. |
| `!admin add [ID]` | Adds this chat or the given ID to admins. |
| `!admin remove [ID]` | Removes from the admin list. |
| `!admin reset` | Clears the entire admin list. *(Requires confirmation.)* |

</details>

<details>
<summary><b>Whitelist Management</b></summary>

| Command | Description |
|---|---|
| `!whitelist` / `!whitelist list` | Shows the whitelist. |
| `!whitelist add [ID]` | Adds to the whitelist. |
| `!whitelist remove [ID]` | Removes from the whitelist. |
| `!whitelist reset` | Clears the entire whitelist. *(Requires confirmation.)* |
| `!whitelist control` | Enables/disables the new-chat whitelist gate. |

</details>

<details>
<summary><b>AI Management</b></summary>

| Command | Description |
|---|---|
| `!aichat` | Enables/disables AI chat. |
| `!model [name]` | Shows current model + installed Ollama models, or changes the model. |
| `!personality` | Shows this chat's active personality and the global personality. |
| `!personality chat <text>` | Sets this chat's personality only. |
| `!personality global <text>` | Sets the global personality (applies to new/cleared chats). |
| `!think` | Shows think-message status and text. |
| `!think on` / `!think off` | Enables/disables the "thinking..." message. |
| `!think <text>` | Updates the think-message text. |
| `!replymode` | Toggles quoted-reply mode for AI responses. |
| `!media` | Shows image/file reading status. |
| `!media image` | Toggles image reading (vision). |
| `!media file` | Toggles file reading (PDF, Word, TXT, JSON, JS...). |
| `!aierror <text>` | Shows or updates the message shown to users on AI failure. |

</details>

<details>
<summary><b>Rate Limiting</b></summary>

| Command | Description |
|---|---|
| `!ratelimit` | Shows current rate limit settings. |
| `!ratelimit on` / `!ratelimit off` | Enables/disables rate limiting. |
| `!ratelimit tokens <n>` | Sets the max burst token count. |
| `!ratelimit refill <sec>` | Sets the token refill interval in seconds. |
| `!ratelimit warn <sec>` | Sets the warning cooldown in seconds. |
| `!ratelimit message <text>` | Updates the warning text shown to rate-limited users. |

</details>

<details>
<summary><b>Memory</b></summary>

| Command | Description |
|---|---|
| `!clear` | Clears this chat's memory. |
| `!clear <ID>` | Clears a specific chat's memory. |
| `!clear all` | Clears all chat memories. *(Requires confirmation.)* |

</details>

<details>
<summary><b>System Settings</b></summary>

| Command | Description |
|---|---|
| `!prefix` | Shows current prefixes. |
| `!prefix main <p>` | Changes the main (user-facing) prefix. |
| `!prefix debug <p>` | Changes the debug/command prefix. |
| `!prefix ignore <p>` | Changes the ignore prefix (no-prefix chats only). |
| `!fixedchat` | Locks the bot to this chat, or releases it. |
| `!noprefix` | Toggles no-prefix mode for this chat. |
| `!groupchat` | Toggles shared-memory mode for this group. |
| `!groupchat [ID]` | Toggles shared-memory mode for the given group ID. |
| `!groupchat list` | Lists all groups with shared-memory mode enabled. |
| `!debugchat` | Sets this chat as the debug channel. |

</details>

<details>
<summary><b>Info and Help</b></summary>

| Command | Description |
|---|---|
| `!info` | Quick status overview. |
| `!info chat` | This chat's details. |
| `!info ai` | AI & rate limit settings. |
| `!info system` | Prefixes, whitelist, debug channel info. |
| `!help` | Shows the help menu. |
| `!helplang tr` / `!helplang en` | Changes the help language. |

</details>

> 💡 Run any command with no arguments to see its usage, e.g. `!admin`, `!prefix`, `!ratelimit`.

---

## Default Configuration

<details>
<summary><b>Configuration Details</b></summary>

| Variable | Default Value |
|---|---|
| Main Prefix | `.` |
| Debug Prefix | `!` |
| Ignore Prefix | `/` |
| AI Model | `minimax-m3:cloud` |
| System Prompt | `Your name is NeRoBoT. You were created by Salih Yazıtaş.` |
| Help Language | `en` (English) |
| AI Chat | Enabled |
| Whitelist Control | Disabled |
| Fixed Chat | Disabled |
| Rate Limiting | Enabled (3 burst tokens, 1 per 15s refill) |
| Reply Mode | Enabled |
| Image / File Reading | Enabled |
| Debug Channel | None |

</details>

---

## Troubleshooting

<details>
<summary><b>npm install fails with a Puppeteer/Chrome error</b></summary>

Puppeteer keeps a cached copy of Chrome under your user folder. If that cache is corrupted (folder exists but the executable inside is missing), `npm install` will fail. Fix it by deleting the cache and running `npm install` again:

- **Windows:** delete 
- **Linux / macOS:** delete 

</details>

<details>
<summary><b>Chrome not found error</b></summary>

Check the `CHROME_PATH` value in `project_scripts/config.js`. On Linux it is usually `/usr/bin/google-chrome`, on macOS `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

</details>

<details>
<summary><b>ECONNREFUSED 127.0.0.1:11434</b></summary>

Ollama is not running. Run `ollama serve` in your terminal, or open the Ollama app.

</details>

<details>
<summary><b>QR code does not appear</b></summary>

Check the terminal output. Sometimes an error message is shown instead of the QR code. Make sure Chrome is up to date.

</details>

<details>
<summary><b>Bot does not reply to messages</b></summary>

- Is AI Chat enabled? → `!aichat`
- Is whitelist control enabled and you're not on the list? → `!whitelist add`
- Is fixed chat mode enabled and you're not in that chat? → `!fixedchat`
- Are you rate limited? → `!ratelimit`

</details>

<details>
<summary><b>Bot keeps asking for QR code</b></summary>

The `.wwebjs_auth/` folder may have been deleted. Back it up locally (do not commit it).

</details>

---

## Security Notes

> This bot uses a personal WhatsApp account. Keep the following in mind:

<details>
<summary><b>Details</b></summary>

- Never upload the generated `project_scripts/whitelist.json`, `project_scripts/admin.json`, `project_scripts/settings.json`, `project_scripts/noprefix.json`, or `project_scripts/groupchat.json` to GitHub — they are already excluded via `.gitignore`.
- Do not use the bot in non-anonymous public groups.
- Anyone added as an admin can change bot-wide settings — only grant admin to people you trust.

</details>

---

## License

This project is for personal use. Please use it in compliance with WhatsApp's [Terms of Service](https://www.whatsapp.com/legal/terms-of-service).

---

## Acknowledgements

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js/)
- [Ollama](https://ollama.com/)
- [Puppeteer](https://pptr.dev/)
- [qrcode-terminal](https://www.npmjs.com/package/qrcode-terminal)

---

<p align="center">
  <sub>Made by <b>Salih Yazıtaş</b></sub>
</p>
