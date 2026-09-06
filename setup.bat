@echo off
setlocal enabledelayedexpansion
cd /d %~dp0

where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js wurde nicht gefunden. Bitte zuerst die LTS-Version von
  echo https://nodejs.org installieren, dann dieses Skript erneut starten.
  echo.
  pause
  exit /b 1
)

echo ============================================
echo   1/3  Backend wird eingerichtet...
echo ============================================
cd backend
call npm install
if errorlevel 1 goto :error
cd ..

echo.
echo ============================================
echo   2/3  Dashboard wird eingerichtet und gebaut...
echo ============================================
cd frontend
call npm install
if errorlevel 1 goto :error
call npm run build
if errorlevel 1 goto :error
cd ..

echo.
echo ============================================
echo   3/3  Overlay-App wird eingerichtet...
echo ============================================
cd overlay
call npm install
if errorlevel 1 goto :error

if not exist .env (
  copy .env.example .env >nul
)

cd ..

echo.
echo ============================================
echo   Fertig!
echo ============================================
echo.
echo Nur noch EIN Schritt von Hand noetig:
echo   1. Oeffne die Datei  overlay\.env  in einem Texteditor
echo   2. Trage bei STEAM_API_KEY deinen Key ein
echo      (kostenlos hier: https://steamcommunity.com/dev/apikey)
echo   3. Trage bei SESSION_SECRET einen beliebigen langen Zufallstext ein
echo.
echo Danach einfach start.bat doppelklicken, um die App zu starten.
echo.
pause
exit /b 0

:error
echo.
echo ============================================
echo   Da ist etwas schiefgelaufen - siehe Meldung oben.
echo ============================================
pause
exit /b 1
