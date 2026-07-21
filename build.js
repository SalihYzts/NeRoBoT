// Sürüm derleme betiği — çalıştırıldığında:
//   1) Yeni sürüm numarasını sorar (package.json'a yazar)
//   2) Gerekirse (node_modules yok/eski) "npm install" çalıştırır
//   3) Varsa bir önceki derlemeden kalan dist/ klasörünü tamamen siler
//      (electron-builder kendisi temizlemiyor, üst üste biriken eski
//      sürümlerin .exe/.blockmap/latest.yml dosyalarını önlemek için)
//   4) İkonları yeniden oluşturur ve electron-builder ile Windows kurulum
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

// gen-icons (sharp/png-to-ico) ve dist (electron-builder) adımları bir
// fresh checkout'ta (node_modules hiç yok) ya da package.json'a yeni bir
// bağımlılık eklendiğinde (electron-updater gibi) node_modules eskiyip
// kaldığında sessizce "Cannot find module" ile patlıyordu — elle "npm
// install" hatırlamak yerine burada otomatik kontrol edip gerekiyorsa
// kendisi kuruyor. node_modules'ın kendi mtime'ı, içine npm'in en son ne
// zaman dosya ekleyip çıkardığını yansıtır (çoğu dosya sisteminde bir
// dizine yazmak dizinin kendi mtime'ını da günceller) — package.json bunun
// SONRASINDA değiştiyse (yeni bağımlılık eklenmiş/silinmiş demektir),
// yeniden kurulum tetiklenir.
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

// electron-builder kendi çıktı klasörünü (dist/) derlemeler arasında
// temizlemiyor — her "npm run build" bir öncekinin .exe/.blockmap/
// latest.yml'sinin ÜSTÜNE bir yenisini ekliyor, ta ki dist/ eski sürüm
// numaralarından kalma bir yığın kurulum dosyasına dönüşene kadar. Yeni
// derlemeye başlamadan hemen önce tamamen siliyoruz ki dist/ her zaman
// sadece BU çalıştırmanın çıktısını tutsun.
function cleanDistDir() {
    const distDir = path.join(ROOT, 'dist');
    if (!fs.existsSync(distDir)) return;
    console.log('\nÖnceki derlemeden kalan dist/ klasörü temizleniyor...');
    fs.rmSync(distDir, { recursive: true, force: true });
}

async function main() {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    console.log(`Mevcut sürüm: ${pkg.version}`);

    ensureDependenciesInstalled();

    let version;
    for (;;) {
        version = await ask('Yeni sürüm numarası (örn: 2.2.0): ');
        if (/^\d+\.\d+\.\d+$/.test(version)) break;
        console.log('Geçersiz biçim — "x.y.z" şeklinde olmalı (örn: 2.2.0). Tekrar dene.');
    }

    pkg.version = version;
    fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`package.json sürümü ${version} olarak güncellendi.`);

    cleanDistDir();
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
