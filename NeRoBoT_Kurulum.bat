@echo off
rem TEK giris noktasi: kurulum + yerel derleme + GitHub'a yayin, hepsi
rem scripts\release.js icinde (bkz. onun kendi basindaki yorum). Node.js
rem kontrolu burada yapiliyor cunku o script'i calistirmak icin bile once
rem Node gerekiyor.
rem
rem Sadece kaynak dosyalarini indirmis biri icin bu, dogru ilk adim: script
rem once npm bagimliliklarini kurup ikonlari olusturur, sonra "devam edip
rem yeni bir surum mu yayinlayacaksin?" diye sorar - hayir cevabi burada
rem temiz bir sekilde biter, boylece sadece gelistirmeye baslamak isteyen
rem biri (NeRoBoT_App.bat ile acacak) hicbir commit/push adimina bulasmaz.
rem "Evet" cevabi verirsen surum numarasi, yerel derleme, commit/push/tag,
rem changelog, GitHub Release ve Arch PKGBUILD guncellemesi de ayni
rem calistirmada devam eder.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi.
    echo https://nodejs.org adresinden LTS surumunu kurup bu betigi tekrar calistir.
    pause
    exit /b 1
)

node "%~dp0scripts\release.js"
pause
