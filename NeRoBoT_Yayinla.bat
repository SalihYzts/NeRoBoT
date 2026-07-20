@echo off
rem package.json'da yazan (en son NeRoBoT_Derle.bat ile belirlenen) surumu
rem kaynak koduyla birlikte GitHub'a gonderir ve bir GitHub Release olarak
rem yayinlar. Once NeRoBoT_Derle.bat'i calistirmis olman gerekir - burada
rem surum sorulmaz. Ayrintili akis icin release.js'e bak. "npm run release"
rem ile ayni sey.
setlocal
cd /d "%~dp0"
node release.js
pause
