@echo off
rem Yeni bir surum derler, kaynak kodu GitHub'a gonderir ve derlenen kurulum
rem paketini yeni bir GitHub Release olarak yayinlar. Ayrintili akis icin
rem release.js'e bak. "npm run release" ile ayni sey.
setlocal
cd /d "%~dp0"
node release.js
pause
