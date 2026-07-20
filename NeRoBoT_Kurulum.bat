@echo off
rem Sadece kaynak dosyalarini indirmis (repo'yu klonlamis ya da zip'ini acmis)
rem biri icin ilk adim: Node.js'i kontrol eder, npm bagimliliklarini kurar ve
rem uygulama ikonlarini olusturur. Bundan sonra NeRoBoT_App.bat ile uygulamayi
rem acabilir, ya da NeRoBoT_Yayinla.bat ile bir kurulum paketi (.exe)
rem derleyip GitHub'a yayinlayabilirsin.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi.
    echo https://nodejs.org adresinden LTS surumunu kurup bu betigi tekrar calistir.
    pause
    exit /b 1
)

echo NPM bagimliliklari kuruluyor, bu biraz surebilir...
call npm install
if errorlevel 1 (
    echo [HATA] "npm install" basarisiz oldu - yukaridaki hataya bak.
    pause
    exit /b 1
)

echo.
echo Uygulama ikonlari olusturuluyor...
call npm run gen-icons
if errorlevel 1 (
    echo [UYARI] Ikon olusturma basarisiz oldu - uygulama yine de calisir,
    echo sadece pencere/kurulum ikonu varsayilan kalabilir.
)

echo.
echo ================================================
echo Hazir! Simdi ne yapabilirsin:
echo   - Uygulamayi acmak icin: NeRoBoT_App.bat
echo   - Kurulum paketi derleyip GitHub'a yayinlamak icin: NeRoBoT_Yayinla.bat
echo ================================================
pause
