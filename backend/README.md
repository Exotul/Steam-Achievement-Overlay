# Steam Achievements Backend

Backend für die Achievement-Webapp: Steam-Login + Auslesen von Bibliothek,
Achievements und Freunden über die offizielle Steam Web API.

## Setup

```bash
npm install
cp .env.example .env
```

In `.env` eintragen:

1. **STEAM_API_KEY**: kostenlos holen unter https://steamcommunity.com/dev/apikey
   (benötigt eine Domain – für lokale Entwicklung reicht `localhost`).
2. **SESSION_SECRET**: ein langer zufälliger String.
3. **BASE_URL**: die URL, unter der dieses Backend erreichbar ist
   (z. B. `http://localhost:3000`). Steam leitet nach dem Login hierher zurück.
4. **FRONTEND_URL**: URL deines späteren Web-/Electron-Frontends, z. B.
   `http://localhost:5173` (für CORS + Redirect nach Login).

Start:

```bash
npm start   # bzw. node server.js
```

## Wichtige Voraussetzung: öffentliches Steam-Profil

Die Steam Web API liefert nur Daten (Bibliothek, Achievements, Freundesliste),
wenn im jeweiligen Steam-Profil unter *Datenschutzeinstellungen* mindestens
**"Spieldetails"** auf öffentlich steht. Das gilt für dich **und** für jeden
Freund, dessen Achievements ihr anzeigen wollt. Ist ein Profil privat, liefert
die entsprechende Route einfach eine leere Liste statt eines Fehlers.

## Endpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/auth/steam` | Startet Steam-Login (Redirect zu steamcommunity.com) |
| GET | `/auth/steam/return` | Callback von Steam, danach Redirect zu `FRONTEND_URL` |
| GET | `/auth/logout` | Session beenden |
| GET | `/auth/me` | Eigene Profildaten (SteamID, Name, Avatar) |
| GET | `/api/library` | Eigene Spielebibliothek |
| GET | `/api/games/:appId/achievements` | Eigene Achievements eines Spiels, angereichert mit Kategorie & Diamant-Status |
| GET | `/api/friends` | Freundesliste inkl. Profildaten |
| GET | `/api/friends/:steamId/games/:appId/achievements` | Achievements eines Freundes für ein Spiel |

Alle `/api/*`-Routen erfordern einen aktiven Login (Session-Cookie).

## Was hier schon eingebaut ist

- **Kategorisierung**: `services/steamApi.js` → `categorize(percent)` setzt
  jedes Achievement anhand des globalen Prozentsatzes auf
  Kupfer (100–60 %) / Silber (<60–25 %) / Gold (<25–5 %) / Platin (<5–0 %).
- **Diamant-Status**: `buildEnrichedAchievements()` liefert `isDiamond: true`,
  sobald `unlockedCount === totalCount` eines Spiels.

## Was hier bewusst noch NICHT drin ist (kommt in späteren Schritten)

- **Level/XP-System** nach deiner Formel (Kupfer = 1×(100−%), Silber = 2×(100−%), …)
  – das rechnen wir am besten im Frontend/Profil-Service, sobald die
  Datenbank für Nutzerfortschritt steht.
- **Persistenz**: Aktuell wird bei jedem Request live gegen die Steam-API
  gefragt. Für Performance und Historie (z. B. "wann wurde was freigeschaltet")
  sollte das in eine Datenbank gecacht werden – wichtig, weil die Steam-API
  ein Rate-Limit hat (~100.000 Requests/Tag pro Key, aber pro-IP-Bursts
  können früher blockiert werden).
- **Overlay/Electron-App**: Das Backend liefert die Daten per REST-API; die
  Electron-App wird als eigenständiges Frontend darauf zugreifen und
  zusätzlich per Polling (z. B. alle 15–30 Sek.) `/api/games/:appId/achievements`
  abfragen, um neu freigeschaltete Achievements zu erkennen (es gibt keine
  Steam-API für Echtzeit-Events).
- **Sound-Trigger & Anzeige** im Overlay-Fenster.

## Nächster logischer Schritt

Das Web-Dashboard (Login-Button, Profilübersicht mit Spiele-Bannern) oder
direkt die Electron-Overlay-App mit dem Achievement-Polling – je nachdem,
womit du weitermachen willst.


## Wie die Trophäenstufen bestimmt werden

Zwei Bewertungen greifen ineinander; die höhere gewinnt.

**1. Absolut** (weltweiter Anteil aller Spieler):
Kupfer ab 30 %, Silber ab 10 %, Gold ab 3 %, darunter Platin.

**2. Relativ** (Stellung innerhalb des eigenen Spiels):
Die seltensten 5 % der Achievements eines Spiels kommen für Platin infrage,
die nächsten 15 % für Gold, die nächsten 30 % für Silber.

**Warum die zweite Bewertung nötig ist:** Bei einem gut zugänglichen Spiel,
das viele Leute tatsächlich durchspielen, liegt selbst das schwerste
Achievement vielleicht bei 11 %. Rein absolut gäbe es dort nie Gold oder
Platin, obwohl es innerhalb des Spiels eindeutig die anspruchsvollsten sind.

**Zwei Sperren, damit das nicht ausufert:**

- *Spreizung*: Die relative Bewertung greift nur, wenn das leichteste
  Achievement mindestens 2,5-mal häufiger ist als das seltenste. Bei einem
  Spiel, bei dem praktisch jeder alles bekommt (z. B. 95 % bis 62 %), bleibt
  alles Kupfer - genau richtig, denn dort ist nichts schwer. Dieses Verhältnis
  ist zugleich der beste verfügbare Anhaltspunkt dafür, wie viele Spieler
  wirklich bis zum Ende durchhalten.
- *Obergrenzen*: Platin höchstens bis 25 %, Gold bis 45 %, Silber bis 70 %.
  Ein Achievement, das 60 % der Spieler haben, wird also nie Gold - auch wenn
  es in seinem Spiel das seltenste ist.

Außerdem braucht ein Spiel mindestens 5 Achievements, damit die relative
Bewertung überhaupt greift; bei drei Achievements ist eine Verteilung
bedeutungslos.

Alle Werte sind über die `.env` einstellbar.
