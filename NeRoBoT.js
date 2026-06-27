import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import ollama from 'ollama';
import fs from 'fs';

const { Client, MessageMedia } = pkg;

// ID-based memory
const chatHistories = {};

// Global flags
let fixedMode = false;
let prefix = ".";
let debugPrefix = "!";
let activeChatId = null;
let debugChatId = null;
let whitelistMode = false;
let systemPrompt = "Your name is NeRoBoT. You were created by Salih Yazıtaş.";
let helpLanguage = "en"; // "tr" and "en"
let aiChatEnabled = true; // AI chat is enabled by default
let aiModel = "minimax-m3:cloud"; // Current AI model (changeable via !model command)

// Whitelist file check
if (!fs.existsSync('./whitelist.json')) {
    fs.writeFileSync('./whitelist.json', JSON.stringify([], null, 2));
}
let whitelist = new Set(JSON.parse(fs.readFileSync('./whitelist.json', 'utf8')));
// Admin file check
if (!fs.existsSync('./admin.json')) {
    fs.writeFileSync('./admin.json', JSON.stringify([], null, 2));
}
let adminList = new Set(JSON.parse(fs.readFileSync('./admin.json', 'utf8')));

// WhatsApp client settings
process.env.PUPPETEER_EXECUTABLE_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const client = new Client({
    puppeteer: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        headless: false
    },
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));

client.on('ready', () => {
    process.stdout.write('\x1Bc');
    const asciiArt = fs.readFileSync('./ascii.txt', 'utf8');
    console.log(asciiArt);
});

async function sendText(chatId, text) {
    await client.sendMessage(chatId, text);
}

async function askModel(userId, prompt) {
    if (!chatHistories[userId]) {
        chatHistories[userId] = [
            { role: 'system', content: systemPrompt }
        ];
    }

    chatHistories[userId].push({ role: 'user', content: prompt });

    const response = await ollama.chat({
        model: aiModel,
        messages: chatHistories[userId]
    });

    chatHistories[userId].push({ role: 'assistant', content: response.message.content });

    return response.message.content;
}

// Update or show personality prompt
async function Personality(msg, targetId) {
    const newPrompt = msg.body.split(" ").slice(1).join(" ");
    if (newPrompt) {
        systemPrompt = newPrompt;
        await sendText(targetId, `Personality prompt updated:\n${systemPrompt}`);
        for (const key in chatHistories) {
            chatHistories[key][0].content = systemPrompt;
        }
    } else {
        // No new prompt, show current personality
        await sendText(targetId, `Current personality prompt:\n${systemPrompt}`);
    }
}

// Change AI model
async function Model(msg, targetId) {
    const newModel = msg.body.split(" ")[1];
    if (newModel) {
        const oldModel = aiModel;
        aiModel = newModel;
        await sendText(targetId, `Model changed:\n${oldModel} → ${aiModel}`);
    } else {
        await sendText(targetId, `Current model: ${aiModel}\nUsage: ${debugPrefix}model <model-name>`);
    }
}

// Remove from whitelist
async function WhitelistRemove(msg, targetId) {
    const parts = msg.body.split(" ");
    const chat = await msg.getChat();
    const chatId = chat.id._serialized;

    if (parts.length === 1) {
        // No ID → remove current chat
        if (whitelist.has(chatId)) {
            whitelist.delete(chatId);
            fs.writeFileSync('./whitelist.json', JSON.stringify([...whitelist], null, 2));
            await sendText(targetId, `This chat has been removed from the whitelist!`);
        } else {
            await sendText(targetId, `This chat is not in the whitelist.`);
        }
    } else {
        const targetChatId = parts[1];
        if (whitelist.has(targetChatId)) {
            whitelist.delete(targetChatId);
            fs.writeFileSync('./whitelist.json', JSON.stringify([...whitelist], null, 2));
            await sendText(targetId, `${targetChatId} has been removed from the whitelist!`);
        } else {
            await sendText(targetId, `${targetChatId} is not in the whitelist.`);
        }
    }
}

async function WhitelistReset(msg, targetId) {
    whitelist.clear();
    fs.writeFileSync('./whitelist.json', JSON.stringify([...whitelist], null, 2));
    await sendText(targetId, `All whitelists have been cleared!`);
}

// Show whitelist
async function Whitelist(msg, targetId) {
    if (whitelist.size === 0) {
        await sendText(targetId, "No chats in the whitelist.");
    } else {
        const ids = Array.from(whitelist).join("\n");
        await sendText(targetId, `Chats in the whitelist:\n${ids}`);
    }
}

// Add to whitelist
async function WhitelistAdd(msg, targetId) {
    const parts = msg.body.split(" ");
    if (parts.length === 1) {
        whitelist.add(targetId);
        fs.writeFileSync('./whitelist.json', JSON.stringify([...whitelist], null, 2));
        await sendText(targetId, `This chat has been added to the whitelist!`);
    } else {
        const chatId = parts[1];
        whitelist.add(chatId);
        fs.writeFileSync('./whitelist.json', JSON.stringify([...whitelist], null, 2));
        await sendText(targetId, `${chatId} has been added to the whitelist!`);
    }
}

// Remove admin
async function AdminRemove(msg, targetId) {
    const parts = msg.body.split(" ");
    const chat = await msg.getChat();
    const chatId = chat.id._serialized;

    if (parts.length === 1) {
        // No ID → remove current chat
        if (adminList.has(chatId)) {
            adminList.delete(chatId);
            fs.writeFileSync('./admin.json', JSON.stringify([...adminList], null, 2));
            await sendText(targetId, `This chat has been removed from the admin list!`);
        } else {
            await sendText(targetId, `This chat is not in the admin list.`);
        }
    } else {
        const targetChatId = parts[1];
        if (adminList.has(targetChatId)) {
            adminList.delete(targetChatId);
            fs.writeFileSync('./admin.json', JSON.stringify([...adminList], null, 2));
            await sendText(targetId, `${targetChatId} has been removed from the admin list!`);
        } else {
            await sendText(targetId, `${targetChatId} is not in the admin list.`);
        }
    }
}

// Reset admin list
async function AdminReset(msg, targetId) {
    adminList.clear();
    fs.writeFileSync('./admin.json', JSON.stringify([...adminList], null, 2));
    await sendText(targetId, `All admin lists have been cleared!`);
}

// Show admin list
async function AdminList(msg, targetId) {
    if (adminList.size === 0) {
        await sendText(targetId, "No admins.");
    } else {
        const ids = Array.from(adminList).join("\n");
        await sendText(targetId, `Admins:\n${ids}`);
    }
}

// Add admin
async function AdminAdd(msg, targetId) {
    const parts = msg.body.split(" ");
    const chat = await msg.getChat();
    const chatId = chat.id._serialized;

    if (parts.length === 1) {
        adminList.add(chatId);
        fs.writeFileSync('./admin.json', JSON.stringify([...adminList], null, 2));
        await sendText(targetId, `This chat has been added to the admin list!`);
    } else {
        const targetChatId = parts[1];
        adminList.add(targetChatId);
        fs.writeFileSync('./admin.json', JSON.stringify([...adminList], null, 2));
        await sendText(targetId, `${targetChatId} has been added to the admin list!`);
    }
}

// New chat control on/off
async function WhitelistControl(msg, targetId) {
    whitelistMode = !whitelistMode;
    await sendText(targetId, `New chat control ${whitelistMode ? "enabled" : "disabled"}!`);
}

// Debug chat
async function DebugChat(msg, targetId) {
    debugChatId = targetId;
    await sendText(targetId, `This chat has been registered as the debug channel!\nMain Chat ID: ${debugChatId}`);
}

// Info
async function Info(msg, targetId) {
    const chat = await msg.getChat();
    const chatId = chat.id._serialized;
    const chatType = chat.isGroup ? "Group" : "Individual";

    const status = `
Chat Info:
- ID: ${chatId}
- Type: ${chatType}

System Status:
- AI Model: ${aiModel}
- Personality: ${systemPrompt}
- Prefix: ${prefix}
- Debug Prefix: ${debugPrefix}
- AI Chat: ${aiChatEnabled ? "Enabled" : "Disabled"}
- Fixed Chat: ${fixedMode ? `Active (ID: ${activeChatId})` : "Inactive"}
- Whitelist Control: ${whitelistMode ? "Enabled" : "Disabled"}
- Debug Chat ID: ${debugChatId ? debugChatId : "None"}
- Admin Count: ${adminList.size}
- Whitelist Count: ${whitelist.size}
- Help Language: ${helpLanguage.toUpperCase()}
    `;

    await sendText(targetId, status.trim());
}

// Change prefix
async function Prefix(msg, targetId) {
    const newPrefix = msg.body.split(" ")[1];
    if (newPrefix) {
        if (newPrefix === debugPrefix) {
            await sendText(targetId, `Prefix and debugPrefix cannot be the same!`);
        } else {
            prefix = newPrefix;
            await sendText(targetId, `Prefix successfully changed: ${prefix}`);
        }
    } else {
        await sendText(targetId, `Please specify a new prefix. E.g.: ${debugPrefix}prefix >>`);
    }
}

// Change debug prefix
async function DebugPrefix(msg, targetId) {
    const newDebug = msg.body.split(" ")[1];
    if (newDebug) {
        if (newDebug === prefix) {
            await sendText(targetId, `DebugPrefix and prefix cannot be the same!`);
        } else {
            debugPrefix = newDebug;
            await sendText(targetId, `Debug prefix successfully changed: ${debugPrefix}`);
        }
    } else {
        await sendText(targetId, `Please specify a new debug prefix. E.g.: ${debugPrefix}debugprefix #`);
    }
}

// Clear
async function Clear(msg, targetId) {
    const parts = msg.body.split(" ");
    if (parts.length === 1) {
        const chatId = targetId;
        if (chatHistories[chatId]) {
            delete chatHistories[chatId];
            await sendText(targetId, `This chat's memory has been cleared!`);
        } else {
            await sendText(targetId, `There is no memory for this chat.`);
        }
    } else {
        const targetChatId = parts[1];
        if (chatHistories[targetChatId]) {
            delete chatHistories[targetChatId];
            await sendText(targetId, `${targetChatId} chat's memory has been cleared!`);
        } else {
            await sendText(targetId, `There is no memory for ${targetChatId}.`);
        }
    }
}

// Clear all
async function ClearAll(msg, targetId) {
    for (const key in chatHistories) {
        delete chatHistories[key];
    }
    await sendText(targetId, `All chat memories have been completely cleared!`);
}

// Fixed chat
async function fixedchat(msg, targetId) {
    fixedMode = !fixedMode;
    if (fixedMode) {
        activeChatId = targetId;
        await sendText(targetId, `Now only working in this chat!`);
    } else {
        activeChatId = null;
        await sendText(targetId, `Now working everywhere!`);
    }
}

// AI Chat on/off
async function AiChat(msg, targetId) {
    aiChatEnabled = !aiChatEnabled;
    await sendText(targetId, `NeRoBoT AI chat ${aiChatEnabled ? "enabled" : "disabled"}!`);
}

// Help
async function Help(msg, targetId) {
    const helpText = fs.readFileSync('./help.txt', 'utf8');
    const trMatch = helpText.match(/===TR===\s*([\s\S]*?)(?====EN===|$)/);
    const enMatch = helpText.match(/===EN===\s*([\s\S]*?)$/);
    
    const trSection = trMatch ? trMatch[1].trim() : "TR bölümü bulunamadı.";
    const enSection = enMatch ? enMatch[1].trim() : "EN section not found.";
    
    const selected = helpLanguage === "en" ? enSection : trSection;
    await sendText(targetId, selected);
}

// Help Language
async function HelpLanguage(msg, targetId) {
    const parts = msg.body.trim().toLowerCase().split(" ");
    const newLang = parts[1];
    
    if (newLang === "tr" || newLang === "en") {
        helpLanguage = newLang;
        await sendText(targetId, `Help language set to: ${helpLanguage.toUpperCase()}\nYardım dili: ${helpLanguage.toUpperCase()}`);
    } else {
        await sendText(targetId, `Current language: ${helpLanguage.toUpperCase()}\nMevcut dil: ${helpLanguage.toUpperCase()}\n\nUsage: ${debugPrefix}helplanguage tr/en`);
    }
}


const commands = {
    "personality": Personality,
    "model": Model,
    "whitelistadd": WhitelistAdd,
    "whitelistremove": WhitelistRemove,
    "whitelist": Whitelist,
    "whitelistreset": WhitelistReset,
    "adminadd": AdminAdd,
    "adminremove": AdminRemove,
    "adminlist": AdminList,
    "adminreset": AdminReset,
    "clear": Clear,
    "clearall": ClearAll,
    "prefix": Prefix,
    "debugprefix": DebugPrefix,
    "help": Help,
    "helplanguage": HelpLanguage,
    "whitelistcontrol": WhitelistControl,
    "debugchat": DebugChat,
    "info": Info,
    "fixedchat": fixedchat,
    "aichat": AiChat
};

// Listen for incoming messages
client.on('message', async msg => {
    const text = msg.body.trim().toLowerCase();

    if (text.startsWith(debugPrefix)) {
        const chat = await msg.getChat();
        const chatId = chat.id._serialized;

        if (adminList.has(chatId) || msg.fromMe) {
            const command = text.slice(debugPrefix.length).split(" ")[0];
            if (commands[command]) {
                const targetId = msg.fromMe ? msg.to : msg.from;
                await commands[command](msg, targetId);
                return;
            }
        }
    }

    // AI chat with normal prefix
    if (text.startsWith(prefix) && aiChatEnabled) {
        const userId = msg.author || msg.from;

        // If new chat control is enabled and this chat is not in the whitelist
        if (whitelistMode && !whitelist.has(msg.from)) {
            if (debugChatId) {
                await sendText(debugChatId, `New message received!\nID: ${msg.from}\nMessage: ${msg.body}`);
            }
            return; // AI won't respond
        }

        if (!fixedMode) {
            const prompt = msg.body.slice(prefix.length).trim();
            await sendText(msg.from, "NeRoBoT is thinking...");
            const aiResponse = await askModel(userId, prompt);
            await sendText(msg.from, aiResponse);
        } else if (fixedMode && msg.from === activeChatId) {
            const prompt = msg.body.slice(prefix.length).trim();
            await sendText(msg.from, "NeRoBoT is thinking...");
            const aiResponse = await askModel(userId, prompt);
            await sendText(msg.from, aiResponse);
        }
    }
});

// Listen for outgoing messages
client.on('message_create', async (msg) => {
    const text = msg.body.trim().toLowerCase();
    if (!msg.fromMe) return;
    // Debug commands
    if (text.startsWith(debugPrefix)) {
        const command = text.slice(debugPrefix.length).split(" ")[0];
        if (commands[command]) {
            const targetId = msg.fromMe ? msg.to : msg.from;
            await commands[command](msg, targetId);
        }
    }

    // AI chat with normal prefix
    if (text.startsWith(prefix) && aiChatEnabled) {
        const prompt = msg.body.slice(prefix.length).trim();
        await sendText(msg.to, "NeRoBoT is thinking...");
        const aiResponse = await askModel(msg.to, prompt);
        await sendText(msg.to, aiResponse);
    }
});


client.initialize();