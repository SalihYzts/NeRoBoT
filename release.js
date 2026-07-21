// Sürüm yayınlama betiği — sürüm numarasını SORMAZ, package.json'da zaten
// yazan sürümü kullanır (onu belirleyen adım build.js/NeRoBoT_Derle.bat —
// "npm run build" ile bir sürüm derledikten sonra bunu çalıştır). Sırayla:
//   1) Gerekirse (node_modules yok/eski) "npm install" çalıştırır
//   2) Değişiklikleri gösterip onay alarak kaynak kodu commit'leyip
//      GitHub'a gönderir, bir sürüm etiketi (tag) oluşturur
//   3) Bir önceki tag'den bu yana olan commit'leri ve dosya değişiklik
//      özetini yerel Ollama'ya gönderip TÜRKÇE, kategorilere ayrılmış bir
//      CHANGELOG bölümü yazdırır (changelog_vX.Y.Z.md + kök CHANGELOG.md'ye
//      eklenir) — Ollama çalışmıyor/kurulu değilse commit listesinden basit
//      bir changelog'a düşer, adımı hiç bloklamaz.
//   4) Yine onay alarak ikonları yeniden oluşturur, electron-builder ile
//      Windows kurulum paketini (.exe) derler VE GitHub'da yeni bir Release
//      olarak yayınlar — electron-builder'ın kendi GitHub publisher'ıyla
//      (bkz. package.json'daki build.publish), elle yüklemek yerine: bu,
//      autoUpdater'ın (app/main.js) ihtiyaç duyduğu latest.yml/blockmap
//      dosyalarını da doğru isimlerle otomatik yükler — elle yapılan bir
//      REST çağrısında ya da bir zip'i tek asset olarak yüklemekte bunu
//      doğru tutmak kolayca yanlış gidebiliyordu (autoUpdater o durumda
//      yeni sürümü hiç görmez). Release notu olarak 3. adımdaki changelog
//      kullanılır (-c.releaseInfo.releaseNotesFile).
//   5) Changelog'u temel alarak LinkedIn'de paylaşılabilecek kısa bir
//      duyuru metni hazırlar (yine Ollama ile, opsiyonel) ve dosyaya
//      kaydeder.
// Çalıştırma: npm run release  (ya da NeRoBoT_Yayinla.bat'a çift tıkla)
//
// git push / GitHub Release oluşturma gibi geri alınması zor, herkese görünür
// adımlardan hemen önce her seferinde ayrı ayrı e/h onayı ister — bu betiği
// kimin ne zaman çalıştırdığından bağımsız olarak, yanlışlıkla gönderim
// yapılmasını engellemek için. Changelog/LinkedIn metni üretimi salt-yerel
// (Ollama'ya sadece localhost üzerinden gider, dışarıya hiçbir şey
// göndermez) olduğundan bu onaylardan muaf — en kötü ihtimalle basit bir
// fallback metne düşer.
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname; // this file lives at the project root
const PKG_PATH = path.join(ROOT, 'package.json');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');
// Bir kere sorulur, sonra buraya kaydedilir (.gitignore'da — asla
// commit'lenmez) — sonraki her "npm run release" tekrar sormaz.
const TOKEN_FILE = path.join(__dirname, '.release-token');
const IS_WIN = process.platform === 'win32';

// Değişiklik özetini changelog'a/duyuru metnine çeviren yerel model —
// project_scripts/config.js'in aiModel varsayılanıyla aynı (uygulamanın
// kendisi zaten kurulumda bunu bekliyor), başka bir yüklü modelle
// değiştirmek istersen burayı düzenlemen yeterli.
const OLLAMA_URL = 'http://localhost:11434';
const OLLAMA_MODEL = 'minimax-m3:cloud';

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
    // 3) Changelog — Ollama ile (yerel, opsiyonel)
    // ============================
    console.log('\nChangelog hazırlanıyor (Ollama deneniyor)...');
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
        changelogBody = await ollamaGenerate(changelogPrompt);
        if (!changelogBody) throw new Error('boş yanıt');
    } catch (err) {
        console.log(`[uyarı] Ollama'dan changelog alınamadı (${err.message}). Basit changelog üretiliyor.`);
        changelogBody = `## ${tag} - ${new Date().toISOString().slice(0, 10)}\n\n${commitLog || '- (commit bulunamadı)'}`;
    }

    const changelogFile = path.join(ROOT, `changelog_${tag}.md`);
    fs.writeFileSync(changelogFile, changelogBody + '\n', 'utf8');
    const existingChangelog = fs.existsSync(CHANGELOG_PATH) ? fs.readFileSync(CHANGELOG_PATH, 'utf8') : '';
    fs.writeFileSync(CHANGELOG_PATH, changelogBody + '\n\n' + existingChangelog, 'utf8');
    console.log(`Changelog yazıldı: ${path.basename(changelogFile)} ve CHANGELOG.md güncellendi.`);

    // ============================
    // 4) Derle + GitHub Release olarak yayınla
    // ============================
    if (!(await confirm(`\nŞimdi kurulum paketini derleyip "${tag}" adıyla GitHub Release olarak yayınlayayım mı? (birkaç dakika sürebilir)`))) {
        console.log(`\nEtiket ("${tag}") GitHub'a gönderildi ama henüz hiçbir şey derlenmedi/yayınlanmadı — istediğin zaman betiği tekrar çalıştırıp bu adımı yapabilirsin.`);
        return;
    }

    const token = await getGithubToken();
    if (!token) {
        console.log('Token girilmedi — derleme/yayınlama iptal edildi. Etiket zaten GitHub\'da, istediğin zaman tekrar deneyebilirsin.');
        return;
    }

    run('npm', ['run', 'gen-icons']);
    // GH_TOKEN: electron-builder'ın GitHub publisher'ının okuduğu ortam
    // değişkeni — package.json'daki build.publish (provider: github) ile
    // birlikte, derlenen .exe'yi VE autoUpdater'ın ihtiyaç duyduğu
    // latest.yml/.blockmap dosyalarını doğru isimlerle bu release'e yükler.
    // -c.releaseInfo.releaseNotesFile: release notu olarak yukarıda
    // ürettiğimiz changelog dosyasını kullanmasını söyler (yoksa
    // electron-builder'ın kendi otomatik ürettiği/boş notu kalırdı).
    run('npx', ['electron-builder', '--win', '--publish', 'always', `-c.releaseInfo.releaseNotesFile=${changelogFile}`], { env: { ...process.env, GH_TOKEN: token } });

    const releaseUrl = `https://github.com/${parsedRemote.owner}/${parsedRemote.repo}/releases/tag/${tag}`;
    console.log(`\nTamamlandı — ${tag} yayınlandı: ${releaseUrl}`);

    // ============================
    // 5) LinkedIn duyuru metni — yine Ollama ile (opsiyonel)
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
        linkedinPost = await ollamaGenerate(linkedinPrompt, 90000);
        if (!linkedinPost) throw new Error('boş yanıt');
    } catch (err) {
        console.log(`[uyarı] Ollama'dan LinkedIn metni alınamadı (${err.message}). Basit şablon kullanıldı.`);
        linkedinPost = `NeRoBoT ${tag} yayında! 🚀\n\nBu sürümde neler değişti:\n${commitLog}\n\n#yazılım #gelistirme #nerobot`;
    }

    const linkedinFile = path.join(ROOT, `linkedin_post_${tag}.txt`);
    fs.writeFileSync(linkedinFile, linkedinPost + '\n', 'utf8');
    console.log(`LinkedIn metni yazıldı: ${path.basename(linkedinFile)}`);

    // ============================
    // Özet
    // ============================
    console.log('\n=== Özet ===');
    console.log(`Tag: ${tag}`);
    console.log(`Release: ${releaseUrl}`);
    console.log(`Changelog: ${path.basename(changelogFile)}`);
    console.log(`LinkedIn metni: ${path.basename(linkedinFile)}`);
    console.log('\nLinkedIn paylaşımı için 1-2 ekran görüntüsü almayı unutma; metin dosyada hazır.');
}

main().catch((err) => {
    console.error(`\n[HATA] ${err.message}`);
    process.exit(1);
});
