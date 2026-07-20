; Best-effort Ollama install attempt, run once the app's own files have been
; copied to $INSTDIR. Launches the just-installed NeRoBoT.exe with a special
; flag that main.js recognizes (see app/main.js) — it runs the Ollama
; check/download/silent-install headlessly (no window) and exits, instead of
; opening the normal UI. Silent/non-blocking ON PURPOSE — Exec (not
; ExecWait): if there's no internet right now, or ollama.com is slow/
; unreachable, or the silent Ollama installer sits on an invisible elevation
; prompt, this must NEVER stall the NeRoBoT installer window itself waiting
; for it. NeRoBoT's own install finishes immediately regardless of how this
; background attempt goes — the in-app "AI Bot" toggle and Ollama shortcut
; tile fall back to prompting the user to install Ollama later either way
; (see ensureOllamaOrPrompt in app/ui/index.html). main.js additionally
; caps how long this headless helper process can run for (see its own
; --install-ollama handling) so it can't linger forever in the background
; even if it does hang internally.
!macro customInstall
  DetailPrint "Ollama kontrol ediliyor / kuruluyor (arka planda, internet gerektirir)..."
  Exec '"$INSTDIR\NeRoBoT.exe" --install-ollama'
!macroend
