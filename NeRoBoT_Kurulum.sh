#!/usr/bin/env bash
# Sadece kaynak dosyalarini indirmis (repo'yu klonlamis ya da zip'ini acmis)
# biri icin ilk adim: Node.js'i kontrol eder (yoksa dagitimina uygun kurulum
# komutunu gosterir), npm bagimliliklarini kurar ve uygulama ikonlarini
# olusturur. Bundan sonra "npm start" (ya da ileride eklenecek
# NeRoBoT_App.sh) ile uygulamayi acabilirsin.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v node >/dev/null 2>&1; then
    echo "[HATA] Node.js bulunamadi."
    if command -v pacman >/dev/null 2>&1; then
        echo "Su komutla kurabilirsin: sudo pacman -S nodejs npm"
    elif command -v apt >/dev/null 2>&1; then
        echo "Su komutla kurabilirsin: sudo apt install nodejs npm"
    elif command -v dnf >/dev/null 2>&1; then
        echo "Su komutla kurabilirsin: sudo dnf install nodejs npm"
    elif command -v zypper >/dev/null 2>&1; then
        echo "Su komutla kurabilirsin: sudo zypper install nodejs npm"
    else
        echo "https://nodejs.org adresinden LTS surumunu kurup bu betigi tekrar calistir."
    fi
    exit 1
fi

echo "NPM bagimliliklari kuruluyor, bu biraz surebilir..."
if ! npm install; then
    echo "[HATA] \"npm install\" basarisiz oldu - yukaridaki hataya bak."
    exit 1
fi

echo
echo "Uygulama ikonlari olusturuluyor..."
if ! npm run gen-icons; then
    echo "[UYARI] Ikon olusturma basarisiz oldu - uygulama yine de calisir,"
    echo "sadece pencere/kurulum ikonu varsayilan kalabilir."
fi

echo
echo "================================================"
echo "Hazir! Simdi ne yapabilirsin:"
echo "  - Uygulamayi acmak icin: npm start"
echo "================================================"
