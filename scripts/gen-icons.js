// One-off/rerunnable icon generator: rasterizes app/ui/logo.svg into
// app/ui/icon.png (256px) and app/ui/icon.ico (multi-res 16/32/48/256),
// used for the BrowserWindow icon and the electron-builder installer icon.
// Run with: npm run gen-icons
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(__dirname, '..', 'app', 'ui');
const SVG_PATH = path.join(UI_DIR, 'logo.svg');
const SIZES = [16, 32, 48, 256];

async function main() {
    const svg = fs.readFileSync(SVG_PATH);

    // 'contain' onto a square canvas so the (non-square, 747x1024) artwork
    // isn't stretched/distorted at icon sizes.
    const pngBuffers = await Promise.all(SIZES.map(size =>
        sharp(svg, { density: 384 })
            .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer()
    ));

    fs.writeFileSync(path.join(UI_DIR, 'icon.png'), pngBuffers[pngBuffers.length - 1]);

    const ico = await pngToIco(pngBuffers);
    fs.writeFileSync(path.join(UI_DIR, 'icon.ico'), ico);

    console.log(`icon.png/icon.ico regenerated from logo.svg (sizes: ${SIZES.join(', ')})`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
