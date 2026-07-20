@echo off
rem NeRoBoT masaustu uygulamasini baslatir.
rem Electron binary'si eksikse (ilk kurulum) once indirir.
if not exist "%~dp0node_modules\electron\dist\electron.exe" (
    echo Electron indiriliyor, lutfen bekleyin...
    cd /d "%~dp0"
    call npm install
    node "%~dp0node_modules\electron\install.js"
)
rem Trailing "." neutralizes %~dp0's trailing backslash - without it, the
rem backslash escapes the closing quote and corrupts the path Electron sees.
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
