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

**NeRoBoT** is a Windows desktop app that runs local-AI-powered bots on top of **WhatsApp** and **Telegram** — multiple accounts/platforms at once, each fully isolated — plus a standalone AI chat (**NeRoChAt**) that isn't tied to any chat account at all. Everything runs on [Ollama](https://ollama.com/) models on your own machine.

Developer: **Salih Yazıtaş**

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
- [Building & Releasing](#building--releasing)
- [Commands](#commands)
- [Default Configuration](#default-configuration)
- [Troubleshooting](#troubleshooting)
- [Security Notes](#security-notes)
- [License](#license)

---

## Features

**App**
- Multi-Profile — run several WhatsApp accounts and/or Telegram accounts side by side, each with its own login, settings, whitelist, admins, and AI memory
- Notification Panel — a bell icon collects every profile's incoming messages (newest first), with an inline quick-reply box so you can answer without switching tabs; a profile's tab pulses until you've read its messages
- NeRoChAt — a full, general-purpose AI chat tab (separate from any WhatsApp/Telegram bot), with saved conversations, image attachments, and AI image generation
- NeRoChAt Quick Popup — a configurable global keyboard shortcut (default `Ctrl+Shift+K`) opens a small floating AI chat on top of whatever you're doing; "Ask about this chat" lets you pick a start/end message range from that WhatsApp chat's recent history to pull in as context
- Fix-Text Shortcut — a configurable global keyboard shortcut (default `Ctrl+Shift+J`) while composing a WhatsApp message suggests spelling-corrected, formal, and casual rewrites right under the compose box; an optional "Otomatik Düzeltme" mode suggests them automatically after a typing pause, with no shortcut needed
- Auto-Update — checks GitHub Releases on every launch and updates itself silently (download → install → relaunch) before the window even opens
- Persistent Sessions — scan each profile's QR code once; logins survive restarts

**Bot (per WhatsApp/Telegram profile)**
- Local AI Support — use any model pulled through Ollama, including vision models
- Chat Memory — separate context per chat/user, with optional shared-memory group mode
- Image & File Reading — reads images (vision), PDF, Word, and plain-text/code files and feeds them to the model
- AI Image Generation — generates images on request and sends them back into the chat
- Whitelist / Blacklist — allow or block specific chats from using the bot
- Admin Panel — only authorized users can run management commands, with a confirmation gate on destructive actions
- Personality — change the bot's system prompt globally or per chat
- Customizable Prefixes — main, debug, and ignore prefixes can all be changed
- No-Prefix Mode — let the bot respond to every message in a chat (or every chat) without needing a prefix
- Fixed Chat Mode — lock the bot to a single chat
- Rate Limiting — per-user token-bucket limiter to prevent spam/abuse
- Debug Channel — forward errors and new-message notifications to a separate chat
- Info Command — view the entire system status in a single message
- Bilingual Help — help menu available in Turkish and English

---

## Requirements

**Just want to use the app?** Nothing to install beyond the app itself — see [Installation](#installation) below. [Ollama](https://ollama.com/) is only needed once you turn on AI features, and the installer offers to set it up for you.

**Building/running from source:**

- **Node.js** >= 18.x
- **npm** >= 9.x
- **Windows** (the packaged installer/auto-update are Windows-only for now; running from source works cross-platform)

> Chrome is **not** required — the app ships with its own browser engine (Electron).

---

## Project Structure

```
nerobot/
├── package.json
├── NeRoBoT_App.bat / .sh           # Launches the desktop app (Windows / Linux)
├── NeRoBoT_Kurulum.bat / .sh       # First-time setup for a source checkout (npm install + icons)
├── NeRoBoT_Derle.bat / .sh         # Builds a versioned installer locally (no publishing)
├── NeRoBoT_Yayinla.bat / .sh       # Pushes source + pushes a version tag (see below)
├── .github/workflows/release.yml   # CI that builds Windows .exe + Linux .AppImage on tag push and publishes them
├── packaging/arch/                 # Arch Linux pacman package — see Installation
│   ├── PKGBUILD
│   ├── nerobot.desktop
│   └── nerobot.png
├── app/
│   ├── main.js                     # Electron main — windows, embedded WhatsApp/Telegram views,
│   │                                #   profile/session management, auto-update, all IPC
│   ├── preload.cjs                 # Renderer ↔ main bridge
│   └── ui/
│       ├── index.html              # Top bar, tab strip, notification panel, settings, quick popup
│       └── ollama.html             # NeRoChAt's own full-tab window
├── src/
│   ├── bot.js                      # WhatsApp client & message routing
│   ├── telegram-bot.js             # Telegram client & message routing (mirrors bot.js)
│   ├── ai.js                       # Ollama integration (chat, vision, image-intent classification)
│   ├── imagegen.js                 # AI image generation backend
│   ├── config.js                   # Per-profile state/settings persistence
│   ├── profiles.js                 # Multi-profile registry (create/rename/delete/export/import)
│   ├── commands.js                 # All !commands
│   ├── ratelimit.js                # Token-bucket rate limiter
│   ├── utils.js / telegram-utils.js
│   ├── file-extract.js             # PDF/Word/text extraction for the AI to read
│   └── ollama-installer.js         # Detects/silently installs Ollama on Windows
├── scripts/                        # Dev-only tooling, not shipped in the packaged app
│   ├── build.js                    # Behind NeRoBoT_Derle.bat / npm run build
│   ├── release.js                  # Behind NeRoBoT_Yayinla.bat / npm run release
│   └── gen-icons.js                # Regenerates app/ui/icon.ico + icon.png from logo.svg
└── build/installer.nsh             # Custom NSIS install-time hook (best-effort Ollama install)
```

All profile data (WhatsApp/Telegram sessions, per-profile settings, NeRoChAt conversations, app config) is stored **outside** this folder, under `Documents/NeRoBoT/NeRoBoT_db` — so uninstalling/moving the app never touches it. Nothing under it is committed to git (see `.gitignore`).

---

## Installation

### Windows: Installer (recommended)

Download `NeRoBoT Setup x.y.z.exe` from the [GitHub Releases](https://github.com/SalihYzts/NeRoBoT/releases) page and run it. It installs NeRoBoT as a normal Windows app (Start Menu shortcut, findable from the Windows search box, with its own uninstaller listed in "Add or Remove Programs") — no `git clone`/`npm install` needed. If [Ollama](https://ollama.com/) isn't already installed, the installer attempts to fetch and install it silently in the background (this never blocks or delays the install itself); if that's skipped or fails (e.g. no internet at install time), NeRoBoT will offer to install it the first time you turn on the AI Bot. From then on, the app checks for updates on every launch and updates itself automatically.

### Linux: pacman package (Arch-based distros, recommended)

Fully from the terminal, no `git clone` needed:

```bash
mkdir -p ~/nerobot-pkg && cd ~/nerobot-pkg
curl -LO https://raw.githubusercontent.com/SalihYzts/NeRoBoT/main/packaging/arch/PKGBUILD
curl -LO https://raw.githubusercontent.com/SalihYzts/NeRoBoT/main/packaging/arch/nerobot.desktop
curl -LO https://raw.githubusercontent.com/SalihYzts/NeRoBoT/main/packaging/arch/nerobot.png
makepkg -si
```

`makepkg -si` downloads the `.AppImage` from [GitHub Releases](https://github.com/SalihYzts/NeRoBoT/releases), turns it into a real pacman package, auto-installs missing dependencies (e.g. `fuse2`), and finishes the install with `sudo pacman -U` (it'll ask for your password there). Afterward NeRoBoT shows up in your app menu and can be launched from the terminal with `nerobot`. When a new version ships, bump `pkgver` in `packaging/arch/PKGBUILD` and repeat the same steps.

### Linux: AppImage (other distros)

Download `NeRoBoT-x.y.z.AppImage` from the [GitHub Releases](https://github.com/SalihYzts/NeRoBoT/releases) page, make it executable, and run it:

```bash
chmod +x NeRoBoT-*.AppImage
./NeRoBoT-*.AppImage
```

AppImages need `libfuse2` — most distros already have it, otherwise install it (e.g. `sudo apt install libfuse2`, `sudo pacman -S fuse2`). To add it to your app menu, use [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher).

### Running from source (development)

### 1. Clone the Repository

```bash
git clone https://github.com/SalihYzts/NeRoBoT.git
cd nerobot
```

### 2. Set Up

Double-click `NeRoBoT_Kurulum.bat` on Windows, `NeRoBoT_Kurulum.sh` on Linux (you may need `chmod +x NeRoBoT_Kurulum.sh` first), or run manually:

```bash
npm install
npm run gen-icons
```

### 3. Install Ollama and Pull a Model

Download and install Ollama from [ollama.com](https://ollama.com/), then pull whichever model(s) you want to use — pick any of these, or any other model Ollama supports:

```bash
ollama pull llama3.2
ollama pull mistral
ollama pull gemma2
ollama pull llava
```

### 4. Start the App

```bash
npm start
```

On Windows you can also double-click `NeRoBoT_App.bat`, on Linux `NeRoBoT_App.sh`. The Home screen lets you create your first WhatsApp or Telegram profile.

### 5. Connect a Profile

1. Create a profile from the Home screen (WhatsApp or Telegram)
2. **WhatsApp:** scan the QR code shown inside the app with your phone (WhatsApp → Settings → Linked Devices → Link a Device)
3. **Telegram:** scan the QR code with your phone (Telegram → Settings → Devices → Link Desktop Device)

You only need to do this once per profile — the session is stored and restored on the next launch.

---

## Building & Releasing

Two separate steps, so you can build and test a version before deciding to publish it:

```bash
npm run build     # or double-click NeRoBoT_Derle.bat / NeRoBoT_Derle.sh
```
Asks for a version number, writes it to `package.json`, and builds locally **for whichever platform you're running on** (`.exe` on Windows, `.AppImage` on Linux) into `dist/` — nothing leaves your machine. Just a quick local sanity build.

```bash
npm run release   # or double-click NeRoBoT_Yayinla.bat / NeRoBoT_Yayinla.sh
```
Uses whichever version `npm run build` just set. Shows you the pending source changes and asks for confirmation before pushing to GitHub, commits, and pushes a `vX.Y.Z` tag. The installers themselves are built NOT by this script but by [.github/workflows/release.yml](.github/workflows/release.yml) (GitHub Actions), which that tag push triggers: a Windows runner builds the `.exe`, a Linux runner builds the `.AppImage`, and both get uploaded to the **same** GitHub Release (including the `latest.yml`/`latest-linux.yml` the auto-updater needs). This split exists because cross-building the Windows `.exe` from Linux locally hits a known bug in electron-builder's own NSIS toolchain. The script can optionally fill in that release's notes with the changelog generated above — that needs a GitHub [Personal Access Token](https://github.com/settings/tokens/new) with `repo` scope (optional; if you skip it, CI still builds and publishes, you can just edit the release notes by hand afterward) — it's cached locally afterward (`.release-token`, gitignored, never committed).

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
<summary><b>Whitelist / Blacklist Management</b></summary>

| Command | Description |
|---|---|
| `!whitelist` / `!whitelist list` | Shows the whitelist. |
| `!whitelist add [ID]` | Adds to the whitelist. |
| `!whitelist remove [ID]` | Removes from the whitelist. |
| `!whitelist reset` | Clears the entire whitelist. *(Requires confirmation.)* |
| `!whitelist control` | Enables/disables the new-chat whitelist gate. |
| `!blacklist` / `!blacklist list` | Shows the blacklist. |
| `!blacklist add [ID]` | Adds to the blacklist (moving it off the whitelist first, if needed). |
| `!blacklist remove [ID]` | Removes from the blacklist. |
| `!blacklist reset` | Clears the entire blacklist. *(Requires confirmation.)* |

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
| `!media` | Shows image/file reading and image generation status. |
| `!media image` | Toggles image reading (vision). |
| `!media file` | Toggles file reading (PDF, Word, TXT, JSON, JS...). |
| `!media imagegen` | Toggles image generation (auto-detects requests for a picture and generates one). |
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
<summary><b>Memory & Reset</b></summary>

| Command | Description |
|---|---|
| `!clear` | Clears this chat's memory. |
| `!clear <ID>` | Clears a specific chat's memory. |
| `!clear all` | Clears all chat memories. *(Requires confirmation.)* |
| `!upload <n>` | Uploads this chat's last `<n>` messages into its own AI memory (max 300). |
| `!reset settings` | Resets all of THIS chat's own overrides back to global. *(Requires confirmation.)* |
| `!reset settings <name>` | Resets a single setting for this chat, no confirmation needed. |
| `!reset all settings` | Factory-resets everything — settings, whitelist, blacklist, admins, per-chat overrides, memories. *(Requires confirmation.)* |

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
| `!noprefixall` | Toggles no-prefix mode for **every** chat at once. *(Requires confirmation if whitelist mode is off.)* |
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
| AI Model | none fixed — pick any Ollama model you've pulled (per-chat or global, via `!model` or NeRoChAt settings) |
| System Prompt | `Your name is NeRoBoT. You were created by Salih Yazıtaş.` |
| Help Language | `en` (English) |
| AI Chat | **Disabled** — turn on with `!aichat` or the app's AI Bot toggle |
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
<summary><b>Building from source: npm install fails with a Puppeteer/Chrome error</b></summary>

whatsapp-web.js depends on Puppeteer, which caches a copy of Chrome under your user folder purely so `npm install` succeeds (NeRoBoT itself never launches it — it connects to Electron's own browser engine instead). If that cache is corrupted (folder exists but the executable inside is missing), `npm install` will fail. Fix it by deleting the cache and running `npm install` again:

- **Windows:** delete `%USERPROFILE%\.cache\puppeteer`
- **Linux / macOS:** delete `~/.cache/puppeteer`

</details>

<details>
<summary><b>ECONNREFUSED 127.0.0.1:11434</b></summary>

Ollama is not running. Run `ollama serve` in your terminal, or let NeRoChAt/the AI Bot toggle start it for you.

</details>

<details>
<summary><b>QR code does not appear</b></summary>

Open the log panel (the "Loglar" button in the top bar) and check for error messages. Make sure another copy of the app isn't already running.

</details>

<details>
<summary><b>Bot does not reply to messages</b></summary>

- Is AI Chat enabled for that profile? → `!aichat`
- Is whitelist control enabled and you're not on the list? → `!whitelist add`
- Are you blacklisted? → `!blacklist remove`
- Is fixed chat mode enabled and you're not in that chat? → `!fixedchat`
- Are you rate limited? → `!ratelimit`

</details>

<details>
<summary><b>A profile keeps asking for its QR code again</b></summary>

Each profile's login lives in its own isolated Electron session, stored under the app's user-data folder (`%APPDATA%/nerobot`). If that folder was deleted, or you unlinked the device from your phone, you'll need to scan the QR code again for that profile.

</details>

<details>
<summary><b>The app didn't update itself</b></summary>

The update check needs internet access and runs (with a short timeout) before the window opens — if it can't reach GitHub in time, it just opens the current version instead and tries again next launch. You can always grab the latest version manually from [GitHub Releases](https://github.com/SalihYzts/NeRoBoT/releases).

</details>

---

## Security Notes

> This app connects real WhatsApp/Telegram accounts. Keep the following in mind:

<details>
<summary><b>Details</b></summary>

- Every profile's whitelist/blacklist/admin/settings and any saved Telegram login live under `Documents/NeRoBoT/NeRoBoT_db` — never upload that folder anywhere.
- Do not use the bot in non-anonymous public groups.
- Anyone added as an admin can change that profile's bot-wide settings — only grant admin to people you trust.

</details>

---

## License

This project is for personal use. Please use it in compliance with WhatsApp's [Terms of Service](https://www.whatsapp.com/legal/terms-of-service) and Telegram's [Terms of Service](https://telegram.org/tos).

---

## Acknowledgements

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js/)
- [teleproto](https://www.npmjs.com/package/teleproto) (Telegram/MTProto client)
- [Ollama](https://ollama.com/)
- [Puppeteer](https://pptr.dev/)
- [Electron](https://www.electronjs.org/) / [electron-builder](https://www.electron.build/) / [electron-updater](https://www.electron.build/auto-update)

---

<p align="center">
  <sub>Made by <b>Salih Yazıtaş</b></sub>
</p>
