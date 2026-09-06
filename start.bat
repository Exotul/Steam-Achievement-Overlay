@echo off
cd /d %~dp0overlay

if not exist .env (
  echo.
  echo Es wurde noch keine overlay\.env gefunden.
  echo Bitte zuerst setup.bat ausfuehren und den Steam API Key eintragen.
  echo.
  pause
  exit /b 1
)

echo Trophaenschrank wird gestartet - das Fenster hier zeigt Log-Meldungen
echo und kann waehrend der Nutzung offen bleiben (oder minimiert werden).
echo Die App selbst laeuft im System-Tray (Symbol unten rechts).
echo.

call npm start
pause
