#!/usr/bin/env bash
# package.json'da yazan (en son NeRoBoT_Derle.sh ile belirlenen) surumu
# kaynak koduyla birlikte GitHub'a gonderir, bir changelog hazirlar (varsa
# Claude API, yoksa Ollama ile) ve bir surum etiketi (tag) push'lar. Kurulum
# paketlerinin kendisini (Windows .exe + Linux .AppImage) bu betik degil, o
# tag push'ini tetikleyen CI (.github/workflows/release.yml) derleyip AYNI
# GitHub Release'e yukler - bu betik sadece o release'in notlarini
# changelog'la doldurur. Once NeRoBoT_Derle.sh'i calistirmis olman gerekir -
# burada surum sorulmaz. Ayrintili akis icin scripts/release.js'e bak. "npm
# run release" ile ayni sey.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v node >/dev/null 2>&1; then
    echo "[HATA] Node.js bulunamadi. NeRoBoT_Kurulum.sh'i calistir ya da https://nodejs.org adresinden kur."
    exit 1
fi

node scripts/release.js
