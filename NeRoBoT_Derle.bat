@echo off
rem Yeni bir surum numarasi sorar, gerekirse bagimliliklari kurar (npm
rem install) ve kurulum paketini (.exe) YERELDE derler (GitHub'a hicbir sey
rem gondermez/yayinlamaz). Ayrintili akis icin build.js'e bak. "npm run
rem build" ile ayni sey. Derledikten sonra yayinlamak icin
rem NeRoBoT_Yayinla.bat'i calistir.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi. https://nodejs.org adresinden kurup tekrar dene.
    pause
    exit /b 1
)

node "%~dp0build.js"
pause
