@echo off
rem package.json'da yazan (en son NeRoBoT_Derle.bat ile belirlenen) surumu
rem kaynak koduyla birlikte GitHub'a gonderir, bir changelog + LinkedIn
rem duyuru metni hazirlar (varsa Claude API, yoksa Ollama ile - Claude
rem opsiyonel, ilk calistirmada anahtar sorulur, bos gecilebilir) ve bir
rem GitHub Release olarak yayinlar. LinkedIn duyurusu icin istersen panodan
rem (Win+Shift+S) ekran goruntusu de ekler, hepsini bir Word (.docx)
rem dosyasina gomer. Once NeRoBoT_Derle.bat'i calistirmis olman gerekir -
rem burada surum sorulmaz. Ayrintili akis icin scripts\release.js'e bak. "npm run
rem release" ile ayni sey.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi. https://nodejs.org adresinden kurup tekrar dene.
    pause
    exit /b 1
)

node "%~dp0scripts\release.js"
pause
