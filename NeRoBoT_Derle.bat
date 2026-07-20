@echo off
rem Yeni bir surum numarasi sorar ve kurulum paketini (.exe) YERELDE derler
rem (GitHub'a hicbir sey gondermez/yayinlamaz). Ayrintili akis icin
rem build.js'e bak. "npm run build" ile ayni sey. Derledikten sonra
rem yayinlamak icin NeRoBoT_Yayinla.bat'i calistir.
setlocal
cd /d "%~dp0"
node build.js
pause
