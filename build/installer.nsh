; Best-effort Ollama install attempt, run once the app's own files have been
; copied to $INSTDIR. Launches the just-installed NeRoBoT.exe with a special
; flag that main.js recognizes (see app/main.js) — it runs the Ollama
; check/download/silent-install headlessly (no window) and exits, instead of
; opening the normal UI. Silent/non-blocking on purpose: if there's no
; internet right now or the download fails, NeRoBoT's install still finishes
; normally — the in-app "AI Bot" toggle and Ollama shortcut tile fall back to
; prompting the user to install Ollama later (see ensureOllamaOrPrompt in
; app/ui/index.html).
!macro customInstall
  DetailPrint "Ollama kontrol ediliyor / kuruluyor (arka planda, internet gerektirir)..."
  ExecWait '"$INSTDIR\NeRoBoT.exe" --install-ollama'
!macroend
