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
- [Installation](#installation)
- [Commands](#commands)
- [Default Configuration](#default-configuration)
- [Troubleshooting](#troubleshooting)
- [Security Notes](#security-notes)
- [License](#license)

---

## Features

- Local AI Support — Use any model you want through Ollama
- Chat Memory — Separate context for each chat (ID-based)
- Whitelist System — Prevent unwanted people from using the bot
- Admin Panel — Only authorized users can run management commands
- Personality — Change the bot's system prompt
- Customizable Prefixes — Both normal and debug prefixes can be changed
- Fixed Chat Mode — Lock the bot to a single chat
- Debug Channel — Forward new messages to a separate chat
- Info Command — View the entire system status in a single message

---

## Requirements

Make sure you have the following installed before getting started:

- **Node.js** >= 18.x
- **npm** >= 9.x
- **Ollama** (latest)
- **Google Chrome** (latest)
- **Operating System:** Windows / Linux / macOS

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
<summary><b>Chrome Path Setting (Windows)</b></summary>

Adjust the `PUPPETEER_EXECUTABLE_PATH` in the code to match your system:

javascript
process.env.PUPPETEER_EXECUTABLE_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";


If you are on Linux/Mac, you can comment out or remove this line.

</details>

<details>
<summary><b>Empty Configuration Files</b></summary>

The code creates these automatically, but you can create them manually if you prefer:

```bash
echo "[]" > whitelist.json
echo "[]" > admin.json
```

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

<details>
<summary><b>Management Commands</b></summary>

| Command | Description |
|---|---|
| `!adminadd [ID]` | Adds the current chat or specified ID to the admin list. |
| `!adminremove [ID]` | Removes the current chat or specified ID from the admin list. |
| `!adminlist` | Lists all admins. |
| `!adminreset` | Completely clears the admin list. |

</details>

<details>
<summary><b>Whitelist Commands</b></summary>

| Command | Description |
|---|---|
| `!whitelistadd [ID]` | Adds the current chat or specified ID to the whitelist. |
| `!whitelistremove [ID]` | Removes the current chat or specified ID from the whitelist. |
| `!whitelist` | Shows the chats in the whitelist. |
| `!whitelistreset` | Completely clears the whitelist. |
| `!whitelistcontrol` | Toggles new chat control on/off. |

</details>

<details>
<summary><b>System Settings</b></summary>

| Command | Description |
|---|---|
| `!prefix [newPrefix]` | Changes the normal command prefix. |
| `!debugprefix [newDebug]` | Changes the debug command prefix. |
| `!fixedchat` | Locks the bot to work only in the current chat, or releases it. |
| `!debugchat` | Registers the current chat as the debug channel. |

</details>

<details>
<summary><b>AI Management</b></summary>

| Command | Description |
|---|---|
| `!aichat` | Toggles AI chat on/off. |
| `!personality [prompt]` | Shows or updates the bot's personality prompt. |
| `!model [name]` | Changes the AI model or shows the current one. |
| `!clear [ID]` | Clears the chat memory. |
| `!clearall` | Clears memory for all chats. |

</details>

<details>
<summary><b>Info and Help</b></summary>

| Command | Description |
|---|---|
| `!info` | Shows system and chat status (prefix, AI state, admin/whitelist count, etc.). |
| `!help` | Shows the help menu. |
| `!helplanguage tr/en` | Changes the help language. |

</details>

---

## Default Configuration

<details>
<summary><b>Configuration Details</b></summary>

| Variable | Default Value |
|---|---|
| Normal Prefix | `.` |
| Debug Prefix | `!` |
| AI Model | `minimax-m3:cloud` |
| System Prompt | `Your name is NeRoBoT. You were created by Salih Yazıtaş.` |
| Help Language | `en` (English) |
| AI Chat | Enabled |
| Whitelist Control | Disabled |
| Fixed Chat | Disabled |
| Debug Channel | None |

</details>

---

## Troubleshooting

<details>
<summary><b>Chrome not found error</b></summary>

Check the `PUPPETEER_EXECUTABLE_PATH` value. On Linux it is usually `/usr/bin/google-chrome`, on macOS `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

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
- Is whitelist control enabled and you are not on the list? → `!whitelistadd`
- Is fixed chat mode enabled and you are not in that chat? → `!fixedchat`

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

- Never upload `whitelist.json` and `admin.json` to GitHub
- Do not use the bot in non-anonymous public groups

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
