# Trophäenschrank – Web-Dashboard

React-Frontend (Vite) für die Achievement-Webapp. Zeigt Profil, Level/XP,
Spielebibliothek als Banner-Grid (mit Diamant-Status) und Freundesliste.
Setzt das Backend aus dem ersten Schritt voraus.

## Setup

```bash
npm install
cp .env.example .env   # VITE_API_BASE_URL ggf. anpassen
npm run dev
```

Backend parallel starten (aus dem `steam-achievements-backend`-Ordner):

```bash
npm start
```

Dann `http://localhost:5173` öffnen. Login läuft über den Button auf der
Startseite → Redirect zu Steam → zurück zum Dashboard.

## Wie die Cookies/Sessions funktionieren

Frontend (Port 5173) und Backend (Port 3000) laufen lokal auf unterschiedlichen
Ports, aber derselben Domain (`localhost`). Browser behandeln das als
"same-site", weshalb das Session-Cookie trotz Cross-Origin-Fetches
(`credentials: 'include'`) zuverlässig mitgeschickt wird – ganz ohne Proxy.
In Produktion (echte Domains) muss das Backend-Cookie auf
`sameSite: 'none', secure: true` gestellt werden, sobald Frontend und Backend
auf unterschiedlichen Domains laufen.

## Design-Entscheidungen

- **Farbwelt**: kühles Anthrazit-Blau statt Schwarz/Cream-Standardpalette;
  jede Trophäen-Stufe hat ihre eigene, material-inspirierte Akzentfarbe
  (Kupfer/Silber/Gold/Platin). Diamant bekommt einen eigenen Cyan-Violett-
  Verlauf für Rahmen-Glow und Schriftzug.
- **Typografie**: Oswald (kondensiert, für Überschriften/Marke) + Inter
  (Fließtext/UI) + Space Mono ausschließlich für Zahlen (XP, Prozentwerte) -
  damit Statistiken sauber tabellarisch ausgerichtet sind.
- **Level-Ring**: bewusst als "Hero"-Element oben rechts, weil das
  Fortschritts-/Rang-Gefühl der Kern der App ist (wie ein Rang-Abzeichen).

## Was hier schon funktioniert

- Login-Status-Check, Login/Logout
- Profil-Hero mit Level-Ring (XP-Kurve in `src/lib/xp.js`) und
  Tier-Zusammenfassung (Anzahl Kupfer/Silber/Gold/Platin insgesamt)
- Spiele-Grid, sortiert nach Diamant-Status und Anzahl Achievements, mit
  Ladefortschritt-Anzeige, da Achievements pro Spiel einzeln nachgeladen
  werden (mit Konkurrenzbegrenzung, siehe `src/lib/useLibraryProgress.js`)
- Klick auf ein Spiel öffnet eine Detailübersicht aller Achievements inkl.
  Freischalt-Status, Icon, globalem Prozentsatz und Tier
- Einfache Freundesliste (Name + Avatar)

## Bewusst noch nicht enthalten

- **Achievements/Level der Freunde einsehen**: Das Backend kann das bereits
  (`/api/friends/:steamId/games/:appId/achievements`), aber für *alle*
  Freunde *alle* Spiele automatisch zu laden, um deren Gesamtlevel zu
  berechnen, multipliziert die Steam-API-Last mit der Anzahl Freunde. Sollte
  entweder gezielt (Klick auf einen Freund lädt dessen Bibliothek) oder über
  einen serverseitigen Cache/Cronjob gelöst werden – guter nächster Schritt.
- **Persistenz/Historie** (wann wurde was freigeschaltet, XP-Verlauf) – aktuell
  wird bei jedem Laden live gerechnet.
- Das **Overlay** (Electron-App) ist ein eigenständiges Projekt und kommt als
  nächster Schritt.
