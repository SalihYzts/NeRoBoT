// Sürüm yayınlama betiği — çalıştırıldığında sırayla:
//   1) Yeni sürüm numarasını sorar (package.json'a yazar)
//   2) İkonları yeniden oluşturur ve electron-builder ile Windows kurulum
//      paketini (.exe) derler
//   3) Değişiklikleri gösterip onay alarak kaynak kodu commit'leyip
//      GitHub'a gönderir, bir sürüm etiketi (tag) oluşturur
//   4) Yine onay alarak GitHub'da yeni bir Release açar ve derlenen kurulum
//      paketini oraya ekler — GitHub'ın REST API'siyle doğrudan (bkz.
//      createGithubRelease altta): ayrı bir "gh" CLI kurulumu gerektirmez,
//      sadece git zaten kurulu olsun yeter.
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
function run(cmd, args) {
    console.log(`\n> ${cmd} ${args.join(' ')}`);
    const result = spawn(cmd, args, { stdio: 'inherit' });
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

async function githubApi(token, method, urlOrPath, body, extraHeaders = {}) {
    const url = urlOrPath.startsWith('http') ? urlOrPath : `https://api.github.com${urlOrPath}`;
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'NeRoBoT-release-script',
            ...extraHeaders,
        },
        body,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`GitHub API hatası (${res.status}): ${text.slice(0, 400)}`);
    }
    return res;
}

async function createGithubRelease(token, owner, repo, tag, installerPath) {
    const createRes = await githubApi(token, 'POST', `/repos/${owner}/${repo}/releases`, JSON.stringify({
        tag_name: tag,
        name: tag,
        generate_release_notes: true,
    }), { 'Content-Type': 'application/json' });
    const release = await createRes.json();

    const fileName = path.basename(installerPath);
    const fileBuffer = fs.readFileSync(installerPath);
    const uploadUrl = release.upload_url.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`);
    await githubApi(token, 'POST', uploadUrl, fileBuffer, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(fileBuffer.length),
    });

    return release.html_url;
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
    // 1) Sürüm numarası
    // ============================
    console.log(`Mevcut sürüm: ${pkg.version}`);
    let version;
    for (;;) {
        version = await ask('Yeni sürüm numarası (örn: 2.2.0): ');
        if (!/^\d+\.\d+\.\d+$/.test(version)) {
            console.log('Geçersiz biçim — "x.y.z" şeklinde olmalı (örn: 2.2.0). Tekrar dene.');
            continue;
        }
        if (runCapture('git', ['tag', '-l', `v${version}`])) {
            console.log(`"v${version}" etiketi zaten var — başka bir sürüm numarası dene.`);
            continue;
        }
        break;
    }
    const tag = `v${version}`;

    pkg.version = version;
    fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`package.json sürümü ${version} olarak güncellendi.`);

    // ============================
    // 2) Derleme
    // ============================
    run('npm', ['run', 'gen-icons']);
    run('npm', ['run', 'dist']);

    const distDir = path.join(ROOT, 'dist');
    const exeFiles = fs.existsSync(distDir) ? fs.readdirSync(distDir).filter((f) => f.endsWith('.exe')) : [];
    if (!exeFiles.length) {
        throw new Error('dist/ klasöründe bir .exe bulunamadı — derleme sırasında bir şey ters gitmiş olabilir.');
    }
    exeFiles.sort((a, b) => fs.statSync(path.join(distDir, b)).mtimeMs - fs.statSync(path.join(distDir, a)).mtimeMs);
    const installerPath = path.join(distDir, exeFiles[0]);
    console.log(`\nKurulum paketi hazır: ${installerPath}`);

    // ============================
    // 3) Kaynak kodu GitHub'a gönder
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
    // 4) GitHub Release
    // ============================
    if (await confirm(`GitHub'da "${tag}" adında yeni bir Release açıp kurulum paketini ekleyeyim mi?`)) {
        const token = await getGithubToken();
        if (!token) {
            console.log('Token girilmedi — Release oluşturulmadı. İstediğin zaman betiği tekrar çalıştırıp deneyebilirsin (etiket zaten GitHub\'da).');
            return;
        }
        console.log('\nGitHub Release açılıyor ve kurulum paketi yükleniyor (dosya boyutuna göre biraz sürebilir)...');
        const releaseUrl = await createGithubRelease(token, parsedRemote.owner, parsedRemote.repo, tag, installerPath);
        console.log(`\nTamamlandı — ${tag} yayınlandı: ${releaseUrl}`);
    } else {
        console.log(`\nEtiket ("${tag}") GitHub'a gönderildi ama Release açılmadı — istediğin zaman betiği tekrar çalıştırıp o adımı yapabilirsin.`);
    }
}

main().catch((err) => {
    console.error(`\n[HATA] ${err.message}`);
    process.exit(1);
});
