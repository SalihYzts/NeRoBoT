#!/usr/bin/env bash
# Yeni bir surum numarasi sorar, gerekirse bagimliliklari kurar (npm
# install) ve kurulum paketini CALISTIGIN platform icin (Linux'ta .AppImage)
# YERELDE derler (GitHub'a hicbir sey gondermez/yayinlamaz). Ayrintili akis
# icin scripts/build.js'e bak. "npm run build" ile ayni sey. Derledikten
# sonra yayinlamak icin NeRoBoT_Yayinla.sh'i calistir.
#
# Windows .exe'si artik burada degil, tag push'landiginda CI
# (.github/workflows/release.yml) tarafindan bir Windows runner'da derlenip
# ayni GitHub Release'e yukleniyor - Linux'tan yerelde capraz derlemek
# electron-builder'in kendi NSIS arac zincirindeki bir hataya takiliyor.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v node >/dev/null 2>&1; then
    echo "[HATA] Node.js bulunamadi. NeRoBoT_Kurulum.sh'i calistir ya da https://nodejs.org adresinden kur."
    exit 1
fi

node scripts/build.js
