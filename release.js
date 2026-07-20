// Sürüm yayınlama betiği — sürüm numarasını SORMAZ, package.json'da zaten
// yazan sürümü kullanır (onu belirleyen adım build.js/NeRoBoT_Derle.bat —
// "npm run build" ile bir sürüm derledikten sonra bunu çalıştır). Sırayla:
//   1) Değişiklikleri gösterip onay alarak kaynak kodu commit'leyip
//      GitHub'a gönderir, bir sürüm etiketi (tag) oluşturur
//   2) Yine onay alarak ikonları yeniden oluşturur, electron-builder ile
//      Windows kurulum paketini (.exe) derler VE GitHub'da yeni bir Release
//      olarak yayınlar — electron-builder'ın kendi GitHub publisher'ıyla
//      (bkz. package.json'daki build.publish), elle yüklemek yerine: bu,
//      autoUpdater'ın (app/main.js) ihtiyaç duyduğu latest.yml/blockmap
//      dosyalarını da doğru isimlerle otomatik yükler — elle yapılan bir
//      REST çağrısında bunu doğru tutmak kolayca yanlış gidebiliyordu.
// Çalıştırma: npm run release  (ya da NeRoBoT_Yayinla.bat'a çift tıkla)
//
// git push / GitHub Release oluşturma gibi geri alınması zor, herkese görünür
// adımlardan hemen önce her seferinde ayrı ayrı e/h onayı ister — bu betiği
// kimin ne zaman çalıştırdığından bağımsız olarak, yanlışlıkla gönderim
// yapılmasını engellemek için.
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname; // this file lives at the project root
const PKG_PATH = path.join(ROOT, 'package.json');
// Bir kere sorulur, sonra buraya kaydedilir (.gitignore'da — asla
// commit'lenmez) — sonraki her "npm run release" tekrar sormaz.
const TOKEN_FILE = path.join(__dirname, '.release-token');
const IS_WIN = process.platform === 'win32';

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
    } else {
        console.log('Vazgeçildi — kaynak kod gönderilmedi. Release de açılmayacak (etiket olmadan olmaz).');
        return;
    }

    // ============================
    // 3) Derle + GitHub Release olarak yayınla
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
    run('npx', ['electron-builder', '--win', '--publish', 'always'], { env: { ...process.env, GH_TOKEN: token } });

    const releaseUrl = `https://github.com/${parsedRemote.owner}/${parsedRemote.repo}/releases/tag/${tag}`;
    console.log(`\nTamamlandı — ${tag} yayınlandı: ${releaseUrl}`);
}

main().catch((err) => {
    console.error(`\n[HATA] ${err.message}`);
    process.exit(1);
});
