// Sürüm derleme betiği — çalıştırıldığında:
//   1) Yeni sürüm numarasını sorar (package.json'a yazar)
//   2) İkonları yeniden oluşturur ve electron-builder ile Windows kurulum
//      paketini (.exe) YERELDE derler — dist/ klasörüne yazar, GitHub'a
//      hiçbir şey göndermez/yayınlamaz.
// Kaynak kodu commit'leyip GitHub'a göndermek ve bu sürümü bir GitHub
// Release olarak yayınlamak için release.js'i (NeRoBoT_Yayinla.bat) kullan
// — o, burada belirlediğin sürüm numarasını (package.json'dan) olduğu gibi
// kullanır, tekrar sormaz.
// Çalıştırma: npm run build  (ya da NeRoBoT_Derle.bat'a çift tıkla)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname; // this file lives at the project root
const PKG_PATH = path.join(ROOT, 'package.json');
const IS_WIN = process.platform === 'win32';

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

// Same shell-quoting reasoning as release.js's own run()/spawn() — Windows
// needs shell:true for npm.cmd to resolve at all, but Node deprecates that
// combined with an args array, so this joins into one pre-quoted command
// string instead of passing args separately.
function shellQuote(arg) {
    return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}
function run(cmd, args) {
    console.log(`\n> ${cmd} ${args.join(' ')}`);
    const result = IS_WIN
        ? spawnSync([cmd, ...args.map(shellQuote)].join(' '), { cwd: ROOT, stdio: 'inherit', shell: true })
        : spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
    if (result.status !== 0) {
        throw new Error(`"${cmd} ${args.join(' ')}" başarısız oldu (çıkış kodu: ${result.status}).`);
    }
}

async function main() {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    console.log(`Mevcut sürüm: ${pkg.version}`);

    let version;
    for (;;) {
        version = await ask('Yeni sürüm numarası (örn: 2.2.0): ');
        if (/^\d+\.\d+\.\d+$/.test(version)) break;
        console.log('Geçersiz biçim — "x.y.z" şeklinde olmalı (örn: 2.2.0). Tekrar dene.');
    }

    pkg.version = version;
    fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`package.json sürümü ${version} olarak güncellendi.`);

    run('npm', ['run', 'gen-icons']);
    run('npm', ['run', 'dist']);

    const distDir = path.join(ROOT, 'dist');
    const exeFiles = fs.existsSync(distDir) ? fs.readdirSync(distDir).filter((f) => f.endsWith('.exe')) : [];
    if (!exeFiles.length) {
        throw new Error('dist/ klasöründe bir .exe bulunamadı — derleme sırasında bir şey ters gitmiş olabilir.');
    }
    exeFiles.sort((a, b) => fs.statSync(path.join(distDir, b)).mtimeMs - fs.statSync(path.join(distDir, a)).mtimeMs);
    console.log(`\nDerleme tamamlandı: dist/${exeFiles[0]}`);
    console.log('Bunu kaynak koduyla birlikte GitHub\'a yayınlamak için: npm run release (ya da NeRoBoT_Yayinla.bat)');
}

main().catch((err) => {
    console.error(`\n[HATA] ${err.message}`);
    process.exit(1);
});
