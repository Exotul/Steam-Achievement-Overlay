@echo off
rem ============================================================================
rem  Trophaenschrank starten - ohne dass ein Fenster stehen bleibt.
rem
rem  Vorher stand hier "call npm start" gefolgt von "pause". Damit blieb die
rem  ganze Zeit ein schwarzes Konsolenfenster offen, und wer es schloss,
rem  beendete die App gleich mit. Das sah nicht nur unfertig aus, es war auch
rem  die einzige Art, das Programm loszuwerden.
rem
rem  Jetzt wird Electron direkt gestartet und dieses Fenster schliesst sich
rem  sofort wieder. Die App laeuft dann nur noch als Symbol in der Taskleiste,
rem  und beendet wird sie dort per Rechtsklick auf "Beenden" - oder in den
rem  Einstellungen unter "Programm".
rem ============================================================================

cd /d "%~dp0overlay"

set "ELECTRON=node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON%" (
  echo.
  echo Electron wurde nicht gefunden.
  echo Bitte zuerst setup.bat ausfuehren.
  echo.
  pause
  exit /b 1
)

rem Manche Editoren - etwa VS Code - setzen ELECTRON_RUN_AS_NODE in der
rem Umgebung. Electron startet dann als reines Node, und es geht ueberhaupt
rem kein Fenster auf. Hier also ausdruecklich leeren.
set "ELECTRON_RUN_AS_NODE="

rem Ein Steam-Schluessel wird hier bewusst NICHT mehr geprueft: Die App bringt
rem ein eigenes Einrichtungsfenster mit und legt ihn selbst unter
rem %USERPROFILE%\.trophaenschrank\config.env ab.

start "" "%ELECTRON%" .

rem "exit /b" statt "exit": Beim Doppelklick schliesst sich das Fenster so
rem genauso, aber wer die Datei aus einer schon offenen Eingabeaufforderung
rem heraus aufruft, verliert dabei nicht seine Sitzung.
exit /b 0
