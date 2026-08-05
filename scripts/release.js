// Sürüm yayınlama betiği — sürüm numarasını SORMAZ, package.json'da zaten
// yazan sürümü kullanır (onu belirleyen adım build.js/NeRoBoT_Derle.bat —
// "npm run build" ile bir sürüm derledikten sonra bunu çalıştır). Sırayla:
//   1) Gerekirse (node_modules yok/eski) "npm install" çalıştırır
//   2) Değişiklikleri gösterip onay alarak kaynak kodu commit'leyip
//      GitHub'a gönderir, bir sürüm etiketi (tag) oluşturur
//   3) Bir önceki tag'den bu yana olan commit'leri ve dosya değişiklik
//      özetini bir AI'ya gönderip TÜRKÇE, kategorilere ayrılmış bir
//      CHANGELOG bölümü yazdırır (changelog_vX.Y.Z.md + kök CHANGELOG.md'ye
//      eklenir) — önce Claude API'yi dener (varsa ANTHROPIC_API_KEY/
//      .claude-api-key), yoksa/başarısız olursa yerel Ollama'ya düşer, o da
//      yoksa commit listesinden basit bir changelog'a düşer — hiçbir adımı
//      bloklamaz (bkz. generateText).
//   4) Kurulum paketlerini BU betik DEĞİL, 2. adımda push'lanan tag'i
//      tetikleyen .github/workflows/release.yml (CI) derler — bir Windows
//      runner'da .exe'yi, bir Linux runner'da .AppImage'i, ikisini de
//      electron-builder'ın kendi GitHub publisher'ıyla (bkz. package.json'daki
//      build.publish) AYNI release'e yükler (autoUpdater'ın ihtiyaç duyduğu
//      latest.yml/blockmap dosyaları dahil). Bunun sebebi: Windows .exe'sini
//      Linux'tan yerelde çapraz derlemek electron-builder'ın kendi NSIS araç
//      zincirindeki bilinen bir hataya takılıyor (hem eski hem "1.2.1" beta
//      toolset). Bu betik burada sadece o release'in notlarını 3. adımdaki
//      changelog'la dolduruyor (REST API ile) — CI zaten tag push'ı üzerine
//      kendiliğinden çalışır, bu adımdan bağımsız.
//   5) Changelog'u temel alarak LinkedIn'de paylaşılabilecek kısa bir
//      duyuru metni hazırlar (yine generateText ile), istersen panodan
//      (Win+Shift+S) 1-2 ekran görüntüsü ister, ve hepsini gömülü bir Word
//      (.docx) dosyasına paketler — Word oluşturulamazsa düz .txt'ye düşer.
// Çalıştırma: npm run release  (ya da NeRoBoT_Yayinla.bat'a çift tıkla)
//
// git push / GitHub Release oluşturma gibi geri alınması zor, herkese görünür
// adımlardan hemen önce her seferinde ayrı ayrı e/h onayı ister — bu betiği
// kimin ne zaman çalıştırdığından bağımsız olarak, yanlışlıkla gönderim
// yapılmasını engellemek için. Changelog/LinkedIn metni üretimi (Claude API
// kullanılmıyorsa) salt-yerel olduğundan bu onaylardan muaf — en kötü
// ihtimalle basit bir fallback metne düşer.
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..'); // this file lives in scripts/, one level under the project root
const PKG_PATH = path.join(ROOT, 'package.json');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');
// Bir kere sorulur, sonra buraya kaydedilir (.gitignore'da — asla
// commit'lenmez) — sonraki her "npm run release" tekrar sormaz.
const TOKEN_FILE = path.join(ROOT, '.release-token');
// Aynı fikir, Claude API için — tamamen opsiyonel: boş geçilirse (ya da
// hiç sorulmadan Enter'a basılırsa) generateText Ollama'ya düşer, bu betik
// hiçbir şekilde Claude'u zorunlu kılmaz.
const CLAUDE_KEY_FILE = path.join(ROOT, '.claude-api-key');
const ASSETS_DIR = path.join(ROOT, 'release-assets');
const IS_WIN = process.platform === 'win32';

// Değişiklik özetini changelog'a/duyuru metnine çeviren yerel model —
// src/config.js'in aiModel varsayılanıyla aynı (uygulamanın
// kendisi zaten kurulumda bunu bekliyor), başka bir yüklü modelle
// değiştirmek istersen burayı düzenlemen yeterli. generateText önce Claude'u
// dener (varsa anahtar), o da yoksa/başarısız olursa buraya düşer.
const OLLAMA_URL = 'http://localhost:11434';
const OLLAMA_MODEL = 'minimax-m3:cloud';
const CLAUDE_MODEL = 'claude-sonnet-5';

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

async function confirm(question) {
    const answer = await ask(`${question} (e/h): `);
    return answer.toLowerCase() === 'e' || answer.toLowerCase() === 'evet';
}

// Windows needs shell:true so npm.cmd/git.cmd-style shims actually resolve
// (spawnSync alone gives ENOENT for those) — but Node deprecates (and
// rightly so) shell:true combined with an args ARRAY, since those args
// don't get shell-escaped. So on Windows this joins into one pre-quoted
// command string instead; elsewhere shell isn't needed at all. Good enough
// for our own controlled arguments (branch names, commit messages, file
// paths) — not general-purpose shell escaping for untrusted input.
function shellQuote(arg) {
    return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}
function spawn(cmd, args, extraOpts) {
    const opts = { cwd: ROOT, ...extraOpts };
    if (IS_WIN) return spawnSync([cmd, ...args.map(shellQuote)].join(' '), { ...opts, shell: true });
    return spawnSync(cmd, args, opts);
}

// buildDocx/grabClipboardImage below pass multi-line PowerShell scripts as
// a single -Command argument — shellQuote/spawn's cmd.exe-string-joining
// above chokes on embedded newlines (cmd.exe's own line-based parsing, not
// Node's), so these call powershell.exe directly with a real argv array
// instead (Windows' native CreateProcess argument marshaling handles
// embedded newlines inside one argument just fine; only routing through
// cmd.exe as a shell doesn't).
function runPowerShell(args) {
    return spawnSync('powershell', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 32 });
}

// Alt komutların çıktısını canlı gösterir (electron-builder'ın kendi
// ilerleme çıktısı gibi) — sessizce arka planda beklemek yerine.
function run(cmd, args, extraOpts) {
    console.log(`\n> ${cmd} ${args.join(' ')}`);
    const result = spawn(cmd, args, { stdio: 'inherit', ...extraOpts });
    if (result.status !== 0) {
        throw new Error(`"${cmd} ${args.join(' ')}" başarısız oldu (çıkış kodu: ${result.status}).`);
    }
}

function runCapture(cmd, args) {
    const result = spawn(cmd, args, { encoding: 'utf8' });
    return (result.stdout || '').trim();
}

function commandExists(cmd, versionArgs) {
    try {
        execSync(`${cmd} ${versionArgs}`, { cwd: ROOT, stdio: 'ignore', shell: true });
        return true;
    } catch (_) {
        return false;
    }
}

// "https://github.com/OWNER/REPO.git" veya "git@github.com:OWNER/REPO.git"
// ikisini de anlar.
function parseGithubRemote(url) {
    const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+?)(\.git)?$/);
    return m ? { owner: m[1], repo: m[2] } : null;
}

async function getGithubToken() {
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
    if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
    if (fs.existsSync(TOKEN_FILE)) {
        const saved = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
        if (saved) return saved;
    }
    console.log('\nGitHub Release açmak için bir Personal Access Token gerekiyor (bir kereye mahsus).');
    console.log('https://github.com/settings/tokens/new adresinden "repo" yetkisiyle (classic token) bir tane oluştur, sonra buraya yapıştır.');
    const token = await ask('GitHub token: ');
    if (token) {
        fs.writeFileSync(TOKEN_FILE, `${token}\n`, { mode: 0o600 });
        console.log(`Token kaydedildi: ${TOKEN_FILE} (sadece bu bilgisayarda kalır, git'e asla gönderilmez — .gitignore'da).`);
    }
    return token;
}

// CI (.github/workflows/release.yml) bir tag push'ında release'i kendisi de
// oluşturabilir (electron-builder --publish always, release yoksa yaratır) —
// bu yüzden burada GET ile önce var mı bakılıp ona göre PATCH/POST yapılıyor,
// hangisi önce çalışırsa çalışsın (bu betik mi, yoksa CI mi) notlar doğru
// release'e yazılmış oluyor.
async function upsertGithubRelease({ owner, repo, tag, body, token }) {
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, { headers });
    if (getRes.status === 200) {
        const existing = await getRes.json();
        const patchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${existing.id}`, {
            method: 'PATCH',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: tag, body }),
        });
        if (!patchRes.ok) throw new Error(`PATCH HTTP ${patchRes.status}`);
        return;
    }
    if (getRes.status !== 404) throw new Error(`GET HTTP ${getRes.status}`);
    const postRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_name: tag, name: tag, body, draft: false, prerelease: false }),
    });
    if (!postRes.ok) throw new Error(`POST HTTP ${postRes.status}`);
}

// build.js'deki aynı isimli fonksiyonla aynı mantık (bkz. onun kendi
// yorumu) — node_modules'ın kendi mtime'ı package.json'dan eskiyse (hiç
// yoksa, ya da package.json'a sonradan bir bağımlılık eklenmişse) "npm
// install" çalıştırır. gen-icons/electron-builder adımları burada da
// kullanıldığından bu betik de aynı kontrole ihtiyaç duyuyor.
function ensureDependenciesInstalled() {
    const nodeModulesPath = path.join(ROOT, 'node_modules');
    const pkgMtime = fs.statSync(PKG_PATH).mtimeMs;
    const needsInstall = !fs.existsSync(nodeModulesPath) || pkgMtime > fs.statSync(nodeModulesPath).mtimeMs;
    if (!needsInstall) return;
    console.log(fs.existsSync(nodeModulesPath)
        ? '\npackage.json, node_modules\'tan daha yeni görünüyor — bağımlılıklar güncelleniyor...'
        : '\nnode_modules bulunamadı — bağımlılıklar kuruluyor...');
    run('npm', ['install']);
}

// Ollama'ya (yerel, localhost) bir prompt gönderip düz metin yanıt alır.
// Kurulu değilse/kapalıysa/yanıt vermezse fetch reddedilir ya da timeout'a
// takılır — çağıran taraf bunu yakalayıp basit bir fallback'e düşer, hiçbir
// adımı bloklamaz. Node'un global fetch'i gerekiyor (Node 18+).
async function ollamaGenerate(prompt, timeoutMs = 120000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
        const data = await res.json();
        return (data.response || '').trim();
    } finally {
        clearTimeout(timer);
    }
}

// Aynı fikir GitHub token'ıyla (getGithubToken) — ama bu tamamen opsiyonel:
// boş geçilirse (Enter'a basılırsa) generateText sessizce Ollama'ya düşer,
// hiçbir adımı zorunlu kılmaz veya bloklamaz.
async function getClaudeApiKey() {
    if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
    if (fs.existsSync(CLAUDE_KEY_FILE)) {
        const saved = fs.readFileSync(CLAUDE_KEY_FILE, 'utf8').trim();
        if (saved) return saved;
    }
    console.log('\nDaha detaylı changelog/LinkedIn metni için bir Claude API anahtarı kullanılabilir (opsiyonel).');
    console.log('https://console.anthropic.com/settings/keys adresinden alabilirsin — boş geçersen yerel Ollama kullanılır.');
    const key = await ask('ANTHROPIC_API_KEY (opsiyonel): ');
    if (key) {
        fs.writeFileSync(CLAUDE_KEY_FILE, `${key}\n`, { mode: 0o600 });
        console.log(`Kaydedildi: ${path.basename(CLAUDE_KEY_FILE)} (sadece bu bilgisayarda kalır, .gitignore'da).`);
    }
    return key || null;
}

async function callClaude(apiKey, prompt, maxTokens) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: maxTokens,
            messages: [{ role: 'user', content: prompt }],
        }),
    });
    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Claude API HTTP ${res.status} ${errBody.slice(0, 200)}`);
    }
    const data = await res.json();
    return (data.content || []).map((c) => c.text || '').join('').trim();
}

// changelog/LinkedIn metni üretiminin tek giriş noktası — önce Claude'u
// dener (bir anahtar varsa), o başarısız olursa (ya da hiç anahtar yoksa)
// yerel Ollama'ya düşer. İkisi de kullanılamazsa çağıran taraf zaten kendi
// basit şablon fallback'ine düşüyor (bkz. main()'deki try/catch'ler) —
// burası sadece "hangi AI" seçimini yapıyor, hiçbir adımı bloklamıyor.
let cachedClaudeKey; // bir çalıştırmada en fazla bir kere sorulsun diye
async function generateText(prompt, { maxTokens = 4000, timeoutMs = 120000 } = {}) {
    if (cachedClaudeKey === undefined) cachedClaudeKey = await getClaudeApiKey();
    if (cachedClaudeKey) {
        try {
            return await callClaude(cachedClaudeKey, prompt, maxTokens);
        } catch (err) {
            console.log(`[uyarı] Claude API hatası (${err.message}), Ollama'ya düşülüyor.`);
        }
    }
    return await ollamaGenerate(prompt, timeoutMs);
}

// ============================
// LinkedIn duyurusu için Word (.docx) — başlık + metin + (varsa) panodan
// alınan ekran görüntüleri. Elle bir .docx kütüphanesi kurmadan, OOXML'i
// (Word'ün kendi iç zip+xml formatı) doğrudan yazıp PowerShell'in
// Compress-Archive'ıyla zip'liyor — bu betiğin tek harici bağımlılığı zaten
// git + gh + (opsiyonel) Ollama/Claude, bir npm paketi daha eklemeye
// değmedi.
// ============================
function escapeXml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function pngDimensions(buf) {
    try {
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        if (width > 0 && height > 0) return { width, height };
    } catch (_) {}
    return { width: 800, height: 600 };
}

function textParagraphXml(text, { bold = false, size = 22 } = {}) {
    const rPr = `<w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;
    return `<w:p><w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function imageParagraphXml(relId, cx, cy, name) {
    return (
        `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
        `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
        `<wp:docPr id="${relId}" name="${escapeXml(name)}"/>` +
        `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
        `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
        `<pic:pic><pic:nvPicPr><pic:cNvPr id="${relId}" name="${escapeXml(name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
        `<pic:blipFill><a:blip r:embed="rId${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
        `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
        `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
    );
}

function psQuote(s) {
    return "'" + String(s).replace(/'/g, "''") + "'";
}

function buildDocx(destPath, { title, bodyLines, images }) {
    const tmp = path.join(os.tmpdir(), 'nerobot-docx-' + Date.now());
    fs.mkdirSync(path.join(tmp, '_rels'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'word', '_rels'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'word', 'media'), { recursive: true });

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
    fs.writeFileSync(path.join(tmp, '[Content_Types].xml'), contentTypes, 'utf8');

    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
    fs.writeFileSync(path.join(tmp, '_rels', '.rels'), rootRels, 'utf8');

    const imgRels = images
        .map((img, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.mediaName}"/>`)
        .join('');
    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${imgRels}
</Relationships>`;
    fs.writeFileSync(path.join(tmp, 'word', '_rels', 'document.xml.rels'), docRels, 'utf8');

    images.forEach((img) => {
        fs.copyFileSync(img.path, path.join(tmp, 'word', 'media', img.mediaName));
    });

    const bodyParts = [];
    bodyParts.push(textParagraphXml(title, { bold: true, size: 32 }));
    bodyParts.push('<w:p/>');
    bodyLines.forEach((line) => {
        bodyParts.push(textParagraphXml(line || '', { size: 22 }));
    });
    images.forEach((img, i) => {
        bodyParts.push('<w:p/>');
        bodyParts.push(imageParagraphXml(i + 1, img.cx, img.cy, img.mediaName));
    });

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${bodyParts.join('\n')}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`;
    fs.writeFileSync(path.join(tmp, 'word', 'document.xml'), documentXml, 'utf8');

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    if (fs.existsSync(destPath)) fs.rmSync(destPath);
    const zip = runPowerShell([
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path ${psQuote(tmp + '\\*')} -DestinationPath ${psQuote(destPath)} -Force`,
    ]);
    fs.rmSync(tmp, { recursive: true, force: true });
    return zip.status === 0 && fs.existsSync(destPath);
}

// Win+Shift+S ile alınan bir ekran görüntüsü Windows panosuna PNG olarak
// gelir — burada onu doğrudan diske yazıyoruz (System.Windows.Forms.Clipboard
// üzerinden, Windows'ta hazır gelen bir .NET API, ek kurulum gerekmiyor).
function grabClipboardImage(destPath) {
    const psCode = [
        'Add-Type -AssemblyName System.Windows.Forms',
        'Add-Type -AssemblyName System.Drawing',
        'if ([System.Windows.Forms.Clipboard]::ContainsImage()) {',
        '  $img = [System.Windows.Forms.Clipboard]::GetImage()',
        `  $img.Save(${psQuote(destPath)}, [System.Drawing.Imaging.ImageFormat]::Png)`,
        "  Write-Output 'OK'",
        '} else {',
        "  Write-Output 'EMPTY'",
        '}',
    ].join('\n');
    const r = runPowerShell(['-NoProfile', '-Command', psCode]);
    return r.status === 0 && (r.stdout || '').includes('OK') && fs.existsSync(destPath);
}

async function captureScreenshotsInteractive(maxCount) {
    const shots = [];
    console.log(`\nLinkedIn Word dosyasına ekran görüntüsü ekleyebilirsin (en fazla ${maxCount} adet, opsiyonel).`);
    console.log('Win+Shift+S ile ilgili alanı seç (kopyalanır), sonra buraya dönüp soruyu yanıtla.');
    for (let i = 0; i < maxCount; i++) {
        const add = await confirm(`${i === 0 ? 'İlk' : 'Bir sonraki'} ekran görüntüsünü eklemek istiyor musun?`);
        if (!add) break;
        await ask("Görüntüyü Win+Shift+S ile alıp kopyaladıktan sonra Enter'a bas...");
        fs.mkdirSync(ASSETS_DIR, { recursive: true });
        const dest = path.join(ASSETS_DIR, `screenshot_${Date.now()}_${i + 1}.png`);
        if (grabClipboardImage(dest)) {
            console.log(`Kaydedildi: ${path.relative(ROOT, dest)}`);
            shots.push(dest);
        } else {
            console.log('[uyarı] Panoda görsel bulunamadı, atlanıyor.');
        }
    }
    return shots;
}

async function main() {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));

    // ============================
    // 0) Ön kontroller — hiçbir şeye dokunmadan önce, "yarı yolda kal"maktan
    // kaçınmak için.
    // ============================
    if (!commandExists('git', '--version')) {
        console.error('[HATA] git bulunamadı.');
        process.exit(1);
    }
    const branch = runCapture('git', ['branch', '--show-current']);
    if (!branch) {
        console.error('[HATA] Şu an bir git dalında değilsin (detached HEAD?) — bir dala geçip tekrar dene.');
        process.exit(1);
    }
    const remoteUrl = runCapture('git', ['remote', 'get-url', 'origin']);
    const parsedRemote = parseGithubRemote(remoteUrl);
    if (!parsedRemote) {
        console.error(`[HATA] "origin" remote'u bir GitHub deposuna benzemiyor: "${remoteUrl}"`);
        process.exit(1);
    }

    ensureDependenciesInstalled();

    // ============================
    // 1) Sürüm — build.js zaten belirleyip package.json'a yazmış olmalı;
    // burada sadece okunur ve o sürüm için bir GitHub Release zaten var mı
    // diye bakılır (varsa, muhtemelen "npm run build" ile yeni bir sürüm
    // numarası belirlemeyi unutmuşsundur).
    // ============================
    const version = pkg.version;
    const tag = `v${version}`;
    console.log(`Yayınlanacak sürüm: ${version} (package.json'dan)`);
    if (runCapture('git', ['tag', '-l', tag])) {
        console.error(`[HATA] "${tag}" etiketi zaten var — bu sürüm daha önce yayınlanmış görünüyor.`);
        console.error('Önce "npm run build" (ya da NeRoBoT_Derle.bat) ile yeni bir sürüm numarası belirle, sonra tekrar dene.');
        process.exit(1);
    }

    // ============================
    // 2) Kaynak kodu GitHub'a gönder
    // ============================
    console.log('\nKaynak kodda şu değişiklikler var:');
    run('git', ['status', '--short']);

    let pushedHead = null;
    if (await confirm(`\nBu değişiklikleri commit edip "${branch}" dalına GitHub'a göndereyim mi?`)) {
        run('git', ['add', '-A']);
        const staged = runCapture('git', ['diff', '--cached', '--name-only']);
        if (staged) {
            run('git', ['commit', '-m', `Release v${version}`]);
        } else {
            console.log('Commit edilecek değişiklik yok, atlanıyor.');
        }
        run('git', ['push', 'origin', branch]);
        run('git', ['tag', tag]);
        run('git', ['push', 'origin', tag]);
        pushedHead = runCapture('git', ['rev-parse', 'HEAD']);
    } else {
        console.log('Vazgeçildi — kaynak kod gönderilmedi. Release de açılmayacak (etiket olmadan olmaz).');
        return;
    }

    // ============================
    // 3) Changelog — Claude API (varsa), yoksa Ollama
    // ============================
    console.log('\nChangelog hazırlanıyor...');
    // Bu proje her sürümü bu betiğin kendisiyle etiketlediği için (bkz.
    // yukarıdaki "git tag" adımı), bir önceki sürüm etiketini bulmak için
    // basit bir "git describe" yeterli — genel amaçlı bir projede olduğu
    // gibi ayrıca bir state dosyası tutmaya gerek yok.
    const prevTag = runCapture('git', ['describe', '--tags', '--abbrev=0', `${pushedHead}^`]);
    const commitRange = prevTag ? `${prevTag}..${pushedHead}` : null;
    let commitLog = commitRange
        ? runCapture('git', ['log', commitRange, '--pretty=format:- %s (%h, %an)'])
        : '';
    if (!commitLog) commitLog = runCapture('git', ['log', '-15', '--pretty=format:- %s (%h, %an)']);
    const diffStat = commitRange ? runCapture('git', ['diff', commitRange, '--stat']) : '';

    const MAX_CHARS = 6000;
    const changelogPrompt = [
        'Sen bir yazılım proje asistanısın. Aşağıdaki git commit listesi ve dosya değişiklik özetine',
        'bakarak "NeRoBoT" projesi için TÜRKÇE, detaylı ve okunaklı bir CHANGELOG bölümü yaz.',
        `Başlık olarak "## ${tag} - ${new Date().toISOString().slice(0, 10)}" kullan.`,
        'Değişiklikleri anlamlarına göre şu kategorilere ayır (boş olanları yazma):',
        '### Yeni Özellikler',
        '### İyileştirmeler',
        '### Hata Düzeltmeleri',
        '### Diğer Değişiklikler',
        'Her madde kısa ve net olsun, teknik jargon yerine ne değiştiğini anlatan cümleler kur.',
        `\nCommit listesi:\n${commitLog.slice(0, MAX_CHARS)}`,
        `\nDeğişen dosya özeti:\n${diffStat.slice(0, MAX_CHARS)}`,
    ].join('\n');

    let changelogBody;
    try {
        changelogBody = await generateText(changelogPrompt, { maxTokens: 4000, timeoutMs: 150000 });
        if (!changelogBody) throw new Error('boş yanıt');
    } catch (err) {
        console.log(`[uyarı] AI'dan changelog alınamadı (${err.message}). Basit changelog üretiliyor.`);
        changelogBody = `## ${tag} - ${new Date().toISOString().slice(0, 10)}\n\n${commitLog || '- (commit bulunamadı)'}`;
    }

    const changelogFile = path.join(ROOT, `changelog_${tag}.md`);
    fs.writeFileSync(changelogFile, changelogBody + '\n', 'utf8');
    const existingChangelog = fs.existsSync(CHANGELOG_PATH) ? fs.readFileSync(CHANGELOG_PATH, 'utf8') : '';
    fs.writeFileSync(CHANGELOG_PATH, changelogBody + '\n\n' + existingChangelog, 'utf8');
    console.log(`Changelog yazıldı: ${path.basename(changelogFile)} ve CHANGELOG.md güncellendi.`);

    // ============================
    // 4) Release notlarını changelog'la doldur — kurulum paketlerinin
    // kendisini CI derliyor (bkz. yukarıdaki yorum), tag zaten push'landığı
    // için CI muhtemelen bu noktada çoktan başlamıştır; burası ona paralel,
    // sadece release'in (CI'dan önce davranırsak oluşturarak, sonra
    // davranırsak güncelleyerek) notlarını ayarlıyor.
    // ============================
    const releaseUrl = `https://github.com/${parsedRemote.owner}/${parsedRemote.repo}/releases/tag/${tag}`;
    const actionsUrl = `https://github.com/${parsedRemote.owner}/${parsedRemote.repo}/actions`;

    if (await confirm(`\nRelease notlarını yukarıdaki changelog'la güncelleyeyim mi (CI'nın ${tag} için ürettiği release'e)?`)) {
        const token = await getGithubToken();
        if (!token) {
            console.log('Token girilmedi — release notları ayarlanamadı. CI yine de derleyip yayınlayacak, notları release sayfasından elle düzenleyebilirsin.');
        } else {
            try {
                await upsertGithubRelease({ owner: parsedRemote.owner, repo: parsedRemote.repo, tag, body: changelogBody, token });
                console.log('Release notları güncellendi.');
            } catch (err) {
                console.log(`[uyarı] Release notları ayarlanamadı (${err.message}) — CI yine de derleyip yayınlayacak.`);
            }
        }
    }

    console.log(`\n"${tag}" için CI şimdi Windows (.exe) ve Linux (.AppImage) paketlerini derleyip bu release'e yüklüyor (birkaç dakika sürebilir).`);
    console.log(`Derleme durumu: ${actionsUrl}`);
    console.log(`Release: ${releaseUrl}`);

    // ============================
    // 5) LinkedIn duyuru metni — Claude API (varsa), yoksa Ollama; sonra
    // istersen panodan 1-2 ekran görüntüsü alıp hepsini bir Word (.docx)
    // dosyasına gömer. Word oluşturulamazsa (ör. PowerShell/Compress-Archive
    // bir sorun çıkarırsa) düz .txt'ye düşer — bu adım hiçbir zaman
    // bloklamaz, en kötü ihtimalle metin dosyada kalır.
    // ============================
    console.log('\nLinkedIn duyuru metni hazırlanıyor...');
    const linkedinPrompt = [
        `Aşağıdaki changelog'a dayanarak "NeRoBoT" projesinin ${tag} sürümü için`,
        'LinkedIn\'de paylaşılabilecek, TÜRKÇE, samimi ama profesyonel, 80-150 kelimelik bir duyuru',
        'metni yaz. Emoji kullanabilirsin (aşırıya kaçma). Sonunda 3-5 ilgili hashtag ekle',
        '(örn. #yazılım #opensource #whatsapp #ai). Ekran görüntüsü ekleneceğinden bahsetme,',
        'metin tek başına yeterli olsun.',
        `\nChangelog:\n${changelogBody.slice(0, 4000)}`,
    ].join('\n');

    let linkedinPost;
    try {
        linkedinPost = await generateText(linkedinPrompt, { maxTokens: 1000, timeoutMs: 90000 });
        if (!linkedinPost) throw new Error('boş yanıt');
    } catch (err) {
        console.log(`[uyarı] AI'dan LinkedIn metni alınamadı (${err.message}). Basit şablon kullanıldı.`);
        linkedinPost = `NeRoBoT ${tag} yayında! 🚀\n\nBu sürümde neler değişti:\n${commitLog}\n\n#yazılım #gelistirme #nerobot`;
    }

    // Ekran görüntüsü yakalama (pano) ve .docx paketleme PowerShell'e
    // (System.Windows.Forms.Clipboard, Compress-Archive) dayanıyor — sadece
    // Windows'ta var. Linux/mac'te bu adım atlanır, duyuru metni düz .txt
    // olarak kaydedilir (metnin kendisi zaten platformdan bağımsız üretildi).
    let linkedinFile;
    if (IS_WIN) {
        const screenshots = await captureScreenshotsInteractive(2);
        const images = screenshots.map((p, i) => {
            const buf = fs.readFileSync(p);
            const dim = pngDimensions(buf);
            const maxCx = 5486400; // ~6 inç genişlik sınırı (EMU cinsinden)
            let cx = dim.width * 9525; // px → EMU (96 DPI varsayımıyla)
            let cy = dim.height * 9525;
            if (cx > maxCx) {
                const scale = maxCx / cx;
                cx = Math.round(cx * scale);
                cy = Math.round(cy * scale);
            }
            return { path: p, mediaName: `image${i + 1}.png`, cx, cy };
        });

        const docxPath = path.join(ROOT, `linkedin_post_${tag}.docx`);
        const built = buildDocx(docxPath, {
            title: `NeRoBoT ${tag} - LinkedIn Duyurusu`,
            bodyLines: linkedinPost.split('\n'),
            images,
        });

        if (built) {
            linkedinFile = docxPath;
            console.log(`LinkedIn Word dosyası hazır: ${path.basename(docxPath)}`);
        } else {
            linkedinFile = path.join(ROOT, `linkedin_post_${tag}.txt`);
            fs.writeFileSync(linkedinFile, linkedinPost + '\n', 'utf8');
            console.log('[uyarı] Word dosyası oluşturulamadı, metin .txt olarak kaydedildi.');
        }
    } else {
        linkedinFile = path.join(ROOT, `linkedin_post_${tag}.txt`);
        fs.writeFileSync(linkedinFile, linkedinPost + '\n', 'utf8');
        console.log('[bilgi] Ekran görüntülü Word dosyası yalnızca Windows\'ta destekleniyor (PowerShell gerekiyor) — metin .txt olarak kaydedildi.');
    }

    // ============================
    // Özet
    // ============================
    console.log('\n=== Özet ===');
    console.log(`Tag: ${tag}`);
    console.log(`Release: ${releaseUrl}`);
    console.log(`Changelog: ${path.basename(changelogFile)}`);
    console.log(`LinkedIn metni: ${path.basename(linkedinFile)}`);
}

main().catch((err) => {
    console.error(`\n[HATA] ${err.message}`);
    process.exit(1);
});
