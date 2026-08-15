#!/usr/bin/env bash
# TEK giris noktasi: kurulum + yerel derleme + GitHub'a yayin, hepsi
# scripts/release.js icinde (bkz. onun kendi basindaki yorum). Node.js
# kontrolu burada yapiliyor cunku o script'i calistirmak icin bile once
# Node gerekiyor - yoksa dagitimina uygun kurulum komutunu gosterir.
#
# Sadece kaynak dosyalarini indirmis (repo'yu klonlamis ya da zip'ini acmis)
# biri icin bu, dogru ilk adim: script once npm bagimliliklarini kurup
# ikonlari olusturur, sonra "devam edip yeni bir surum mu yayinlayacaksin?"
# diye sorar - "h" cevabi burada temiz bir sekilde biter, boylece sadece
# gelistirmeye baslamak isteyen biri (npm start ile acacak) hicbir
# commit/push adimina bulasmaz. "Evet" cevabi verirsen surum numarasi,
# yerel derleme, commit/push/tag, changelog, GitHub Release ve Arch
# PKGBUILD guncellemesi de ayni calistirmada devam eder.
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

node scripts/release.js
