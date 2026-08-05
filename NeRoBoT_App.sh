#!/usr/bin/env bash
# NeRoBoT masaustu uygulamasini baslatir.
# Electron binary'si eksikse (ilk kurulum) once indirir.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -f "node_modules/electron/dist/electron" ]; then
    echo "Electron indiriliyor, lutfen bekleyin..."
    npm install
    node node_modules/electron/install.js
fi

exec node_modules/electron/dist/electron .
