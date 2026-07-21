@echo off
rem package.json'da yazan (en son NeRoBoT_Derle.bat ile belirlenen) surumu
rem kaynak koduyla birlikte GitHub'a gonderir, Ollama ile bir changelog +
rem LinkedIn duyuru metni hazirlar, ve bir GitHub Release olarak yayinlar.
rem Once NeRoBoT_Derle.bat'i calistirmis olman gerekir - burada surum
rem sorulmaz. Ayrintili akis icin release.js'e bak. "npm run release" ile
rem ayni sey.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi. https://nodejs.org adresinden kurup tekrar dene.
    pause
    exit /b 1
)

node "%~dp0release.js"
pause
