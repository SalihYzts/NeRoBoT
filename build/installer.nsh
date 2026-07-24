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
; electron-builder's own template (node_modules/app-builder-lib/templates/
; nsis/common.nsh) hardcodes `ShowInstDetails nevershow` — the install page's
; detail log is compiled OFF entirely, not just collapsed. This override
; (a plain top-level directive, not inside any macro) is included after
; common.nsh in the compiled script, so it wins. Note this only makes
; MY OWN DetailPrint lines below actually show — electron-builder's own file-
; copy/registry steps run inside installSection.nsh (a vendored template,
; not something a project-level customInstall/customUnInstall hook can
; reach), and that file separately calls `SetDetailsPrint none` BEFORE ever
; reaching this macro, silencing its own steps regardless of this line. Not
; safely fixable without patching node_modules (overwritten by the next
; `npm install`) or replacing electron-builder's whole installer.nsi via the
; "script" build option — a much bigger, riskier change than this one.
ShowInstDetails show
ShowUninstDetails show

!macro customInstall
  ; installSection.nsh (electron-builder's template) sets SetDetailsPrint
  ; none before this macro runs — re-enable it so at least this step's own
  ; progress line is visible, even though the file-copy steps before it
  ; aren't (see this file's own top comment).
  SetDetailsPrint both

  ; Someone running a stale, previously-downloaded Setup.exe after a newer
  ; release went out — check now that this version's files are actually on
  ; disk (app/main.js's --check-latest-version flag does the real work; see
  ; its own comment there for why this is a headless Node call instead of
  ; raw NSIS HTTP+string parsing). ExecWait (blocking, unlike the Ollama
  ; line below) since the rest of this macro needs the answer before
  ; deciding whether to keep going. main.js's own 8s timeout keeps this from
  ; hanging the installer on a slow network; on ANY failure to verify it
  ; writes ISLATEST=true itself, so a network hiccup never blocks an
  ; otherwise-good install.
  DetailPrint "Sürüm kontrol ediliyor..."
  ExecWait '"$INSTDIR\NeRoBoT.exe" --check-latest-version'
  ${if} ${FileExists} "$TEMP\nerobot-version-check.txt"
    FileOpen $4 "$TEMP\nerobot-version-check.txt" r
    FileRead $4 $5
    FileRead $4 $6
    FileClose $4
    Delete "$TEMP\nerobot-version-check.txt"
    StrCpy $5 $5 -1 ; drop the trailing \n main.js wrote
    StrCpy $6 $6 -1
    StrCpy $7 $5 "" 9  ; "ISLATEST=" is 9 chars — $7 = "true"/"false"
    StrCpy $8 $6 "" 10 ; "LATESTURL=" is 10 chars — $8 = the actual URL
    ${if} $7 == "false"
      MessageBox MB_OK|MB_ICONINFORMATION "Bu kurulum dosyası artık güncel değil. Güncel sürümü indirebileceğin sayfa tarayıcında açılacak."
      ExecShell "open" "$8"
      RMDir /r "$INSTDIR"
      Quit
    ${endif}
  ${endif}

  DetailPrint "Ollama kontrol ediliyor / kuruluyor (arka planda, internet gerektirir)..."
  Exec '"$INSTDIR\NeRoBoT.exe" --install-ollama'
!macroend

; Uninstalling NeRoBoT never used to touch Ollama at all (a separate program
; with its own install/uninstall entry) — this asks, once, whether to take
; it down too. $LOCALAPPDATA\Programs\Ollama\ollama.exe is the same
; known-path check ollama-installer.js's KNOWN_EXE uses (Ollama's official
; installer puts it there, a per-user/no-admin install — which is also why
; its own uninstall registry entry below is read from HKCU, not HKLM).
;
; Rather than guessing Ollama's uninstaller filename (Inno Setup's default
; is unins000.exe, but that's not guaranteed), this reads the actual
; UninstallString Ollama's own installer registered — the exact same value
; Windows' "Programs and Features" panel would use to remove it, so this
; stays correct even if a future Ollama installer names its uninstaller
; something else. If no matching entry is found, this silently does
; nothing rather than failing the NeRoBoT uninstall over it.
;
; UNVERIFIED ASSUMPTION: matches on DisplayName == "Ollama" exactly, which
; is the expected value for a plain Inno Setup AppName — not confirmed
; against a real installed Ollama registry entry (no way to check that
; here). If a real uninstall shows Ollama wasn't actually removed, check
; this key's real DisplayName (regedit →
; HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall)
; and adjust the StrCmp below to match.
;
; ${IfNot} ${Silent} below is load-bearing, not decorative: every NeRoBoT
; install/update runs the PREVIOUS version's uninstaller as a silent,
; internal step first (electron-builder's own uninstallOldVersion, called
; from installSection.nsh before this macro's install-side counterpart even
; runs) — without this guard, that silent, invisible re-run would hit the
; MessageBox below on every single reinstall/update and block waiting for
; an answer nobody knows to give, which reads as "the installer's Cancel/X
; don't do anything" (they're not frozen — a separate, unseen dialog from
; that silent old-version uninstall is what's actually holding things up).
; A genuine "Ollama'yı da kaldır?" prompt should only ever happen for a
; real, interactive, user-initiated uninstall.
!macro customUnInstall
  ${IfNot} ${Silent}
  IfFileExists "$LOCALAPPDATA\Programs\Ollama\ollama.exe" 0 nerobot_ollama_done
    MessageBox MB_YESNO|MB_ICONQUESTION "Bilgisayarında Ollama kurulu görünüyor. NeRoBoT ile birlikte Ollama'yı da kaldırmak ister misin?" IDNO nerobot_ollama_done
      StrCpy $0 0
      nerobot_ollama_loop:
        EnumRegKey $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" $0
        StrCmp $1 "" nerobot_ollama_done
        ReadRegStr $2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
        StrCmp $2 "Ollama" nerobot_ollama_found nerobot_ollama_next
        nerobot_ollama_next:
        IntOp $0 $0 + 1
        Goto nerobot_ollama_loop
      nerobot_ollama_found:
        ReadRegStr $3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$1" "UninstallString"
        StrCmp $3 "" nerobot_ollama_done
        SetDetailsPrint both
        DetailPrint "Ollama kaldırılıyor..."
        ExecWait '$3 /VERYSILENT /SUPPRESSMSGBOXES /NORESTART'
  nerobot_ollama_done:
  ${EndIf}
!macroend
