# Trophäenschrank – Gesamtprojekt

Enthält alle drei Teile an einem Ort:

```
steam-achievements-app/
├── backend/    Node/Express-Server: Steam-Login, Steam-Web-API, Caching
├── frontend/   React-Dashboard (wird vom Backend mit ausgeliefert)
└── overlay/    Electron-Overlay - DAS IST DIE APP, DIE DU STARTEST
```

## Herunterladen

Die jeweils aktuelle Fassung liegt immer hier:

**https://github.com/Exotul/Steam-Achievement-Overlay/releases/latest**

Dort unter *Assets* die Datei `Trophaeenschrank-Setup-<version>.exe` laden und
ausführen. Danach meldet sich die App von selbst, wenn es etwas Neueres gibt -
herunterladen musst du sie also genau einmal von Hand.

Ist die Seite leer oder gibt es dort noch kein Release, wurde bisher keine
Fassung veröffentlicht. Wie das geht, steht in `github-anleitung.md`
(Schritt 8 und 9).

---

**Wichtigste Änderung gegenüber vorher: Du startest nur noch `overlay`.**
Die Overlay-App prüft beim Start selbst, ob das Backend schon läuft, und
startet es andernfalls automatisch mit (inklusive der Werte aus ihrer
eigenen `.env`). Das Dashboard wird vom Backend gleich mit ausgeliefert -
`overlay` → Tray-Icon → "Dashboard öffnen" reicht.

## Einmalige Einrichtung

**Windows – der einfache Weg:** Doppelklick auf `setup.bat` im Hauptordner.
Das installiert und baut automatisch alle drei Teile nacheinander (Node.js
muss vorher installiert sein, siehe nodejs.org). Am Ende bekommst du genau
gesagt, wo du deinen Steam API Key einträgst - das bleibt der einzige
Handgriff, den ich dir nicht abnehmen kann, weil der Key persönlich und
geheim ist.

**Manuell (Mac/Linux, oder wenn du lieber selbst tippst):**

```bash
cd backend  && npm install
cd ../frontend && npm install && npm run build
cd ../overlay  && npm install
cp .env.example .env     # STEAM_API_KEY und SESSION_SECRET eintragen
```

## Starten

**Windows:** Doppelklick auf `start.bat` im Hauptordner.

**Manuell:**

```bash
cd overlay
npm start
```

`backend/.env` und `frontend/.env` brauchst du für den normalen Gebrauch
**nicht mehr**, nur noch `overlay/.env`.


Rechtsklick auf das Tray-Icon → "Mit Steam anmelden" beim ersten Mal, danach
bleibt die Session gespeichert.

## Installer bauen

Auf deinem **Windows-Rechner**, im Hauptordner:

```bash
cd frontend && npm install && npm run build
cd ../backend && npm install
cd ../overlay && npm install
npm run dist
```

Das erzeugt `overlay/dist/Trophaeenschrank-Setup-1.0.0.exe`. Einmal ausführen,
danach liegt "Trophäenschrank" im Startmenü und auf dem Desktop wie jedes
andere Programm.

**Warum auf Windows:** Der Build läuft bis zum Schluss auch unter Linux durch -
nur das Signieren der Programmdatei braucht Windows-eigene Werkzeuge (unter
Linux bräuchte es Wine). Getestet wurde bis genau zu diesem Punkt: Die
Programmdatei, das mitgelieferte Backend und das gebaute Dashboard werden
korrekt gepackt, die Konfigurationsdatei bewusst NICHT.

## Automatische Updates

Eine ausführliche Anleitung zum Einrichten von GitHub liegt als
`github-anleitung.md` bei - geschrieben für jemanden, der GitHub noch nie
benutzt hat.


Im Tray-Menü stehen die laufende Version und "Nach Updates suchen…".

**Wie es sich verhält:**

- Beim Start wird still geprüft, danach alle sechs Stunden. Findet sich etwas,
  wird es im Hintergrund geladen.
- Gefragt wird erst, wenn die neue Fassung bereitliegt - und **nie, während
  gerade gespielt wird**. Ein Update, das sich mitten im Spiel selbst
  installiert und die App neu startet, würde das Overlay abschalten. Läuft ein
  Spiel, wird der Hinweis zurückgestellt und später erneut angeboten.
- Ist die Update-Quelle nicht erreichbar, landet das im Protokoll und sonst
  nirgends.
- In der Entwicklungsfassung (`npm start`) ist die Prüfung abgeschaltet.

Die Update-Quelle ist in `overlay/package.json` unter `build.publish`
eingetragen und zeigt auf https://github.com/Exotul/Steam-Achievement-Overlay.
`npm run release` veröffentlicht eine neue Fassung, sobald die Versionsnummer
in `package.json` erhöht wurde.

### Was ein Update NICHT anfasst

Anmeldung, Einstellungen, Zwischenspeicher und Verlauf liegen unter
`~/.trophaenschrank/` - also außerhalb des Programmordners, den ein Update
ersetzt. Die Konfiguration wandert beim ersten Start automatisch von
`overlay/.env` nach `~/.trophaenschrank/config.env`; du musst dafür nichts
tun. Beim Deinstallieren bleiben diese Daten ebenfalls erhalten.

Dafür gibt es eigene Tests, die genau diesen Ablauf durchspielen: erster
Start, Update mit ersetztem Programmordner, und die Zusicherung, dass eine
vorhandene Konfiguration nie überschrieben wird.


## Anmeldung bleibt erhalten

Die Anmeldung überlebt jetzt Neustarts: Sitzungen liegen in
`~/.trophaenschrank/sessions.json` statt nur im Arbeitsspeicher. Vorher startete
die Overlay-App das Backend bei jedem Start neu, wodurch die Sitzung verloren
ging und man sich jedes Mal erneut bei Steam anmelden musste - besonders
störend zusammen mit dem Autostart. Die Sitzung gilt 90 Tage und verlängert
sich bei jeder Nutzung.

## Warum ist das schneller/schlanker als vorher?

- **Ein Programm statt drei Terminals**: `overlay` startet `backend` selbst.
- **Zwischengespeicherte Daten**: Das Dashboard zeigt beim erneuten Öffnen
  sofort den letzten bekannten Stand (im Browser gespeichert) und
  aktualisiert nur noch im Hintergrund, statt bei jedem Öffnen bei null
  anzufangen.
- **Serverseitiger Cache**: Das Backend merkt sich Antworten der Steam-API
  kurzzeitig, damit Dashboard und Overlay sich nicht gegenseitig unnötig
  oft dieselben Daten neu abfragen.

Details zu den einzelnen Teilen stehen weiterhin in den jeweiligen
`README.md`-Dateien in `backend/`, `frontend/` und `overlay/`.


## Datenablage

Alles liegt unter `~/.trophaenschrank/`:

```
cache.json                    zwischengespeicherte Steam-Daten
sessions.json                 Anmeldung (überlebt Neustarts)
verlauf/achievements.jsonl    jede Freischaltung, eine Zeile je Ereignis
logs/trophaenschrank.log      Protokoll
```

**Momentaufnahmen** (Zwischenspeicher, Sitzungen) werden erst in eine
Nebendatei geschrieben und dann umbenannt. Umbenennen ist auf allen gängigen
Dateisystemen unteilbar - ein Absturz mitten im Schreiben hinterlässt daher
nie eine halbe Datei, sondern lässt die bisherige unversehrt.

**Der Verlauf** wird angehängt, eine Zeile je Ereignis. Anhängen schreibt die
bestehende Datei nicht neu und bleibt dadurch gleich schnell, egal wie lang
sie wird. Ein Absturz beschädigt höchstens die letzte Zeile, die beim Lesen
übersprungen wird - der Rest bleibt erhalten. Ab 25.000 Einträgen wird auf die
jüngsten 20.000 gekürzt.

### Warum kein SQLite (nachgemessen, nicht vermutet)

Ursprünglich war für diesen Schritt SQLite geplant. Die Prüfung hat ergeben,
dass das hier ein Rückschritt wäre:

- Das Backend läuft als Kindprozess der Overlay-App und damit unter **Electrons
  Node 20**. Dort gibt es `node:sqlite` nicht (erst ab Node 22).
- `better-sqlite3` ist ein nativer Baustein. Wird er beim `npm install` für
  das System-Node gebaut und anschließend unter Electrons Node geladen, stürzt
  der Prozess mit einem Speicherzugriffsfehler ab - **und das lässt sich nicht
  mit try/catch abfangen**. Ein Fehlschlag bei der Installation hätte also
  nicht eine Fehlermeldung zur Folge, sondern ein stilles Absterben des
  Backends.

Der eigentliche Gewinn wäre gering gewesen: Gegen Beschädigung schützt bereits
das unteilbare Umbenennen, und für einen wachsenden Verlauf ist eine
anhängende Datei sogar die passendere Form. Die Schnittstelle in
`storage.js` ist trotzdem schmal gehalten, sodass sich der Unterbau später
austauschen ließe.

## Eingeschränkter Betrieb, wenn Steam ausfällt

Ist die Steam-Web-API nicht erreichbar, bleibt die App arbeitsfähig, statt
stehenzubleiben:

- **Was freigeschaltet ist**, liefert weiterhin die lokale Steam-Datei.
- **Namen, Symbole, Prozentsätze und Stufen** kommen aus dem letzten bekannten
  Stand, der pro Spiel 30 Tage vorgehalten wird.
- Die zuvor **geprüfte** lokale Quelle wird dauerhaft gemerkt
  (`~/.trophaenschrank/geprueft.json`) und in diesem Fall wiederverwendet -
  eine neue Prüfung ist ohne Steam ja nicht möglich, aber die frühere beruhte
  auf echten Steam-Daten.
- Achievement-Meldungen erscheinen dadurch weiter, nur ohne Freundesdaten und
  ohne frische Werte.

Sichtbar wird das an zwei Stellen: im Tray-Menü ("⚠ Steam nicht erreichbar –
eingeschränkter Betrieb") und als Hinweisleiste oben im Dashboard. Sobald
Steam wieder antwortet, kehrt die App selbsttätig in den Normalbetrieb zurück.

**Wichtige Unterscheidung:** Nur echte Netzwerkfehler (keine Verbindung,
Zeitüberschreitung, DNS) gelten als Ausfall. Antworten *mit* Statuscode - etwa
403 bei falschem Schlüssel oder 429 bei Drosselung - bedeuten, dass Steam sehr
wohl erreichbar ist. Würden sie als Ausfall gewertet, verdeckte der
eingeschränkte Betrieb die eigentliche Ursache. Dafür gibt es stattdessen die
Schlüsselprüfung und die Drosselung in der Warteschlange.

## Protokoll (bei Problemen zuerst hier schauen)

Overlay und Backend schreiben gemeinsam nach
`~/.trophaenschrank/logs/trophaenschrank.log`. Jede Zeile trägt Zeitstempel
und Bereich (`[overlay]` oder `[backend]`). Erreichbar über das Tray-Menü:
"Protokoll öffnen" bzw. "Protokollordner öffnen".

Mitgeschrieben werden die Dinge, die bei den bisherigen Fehlersuchen gefehlt
haben:

- erkanntes Spiel und Spielende
- welcher Erkennungsweg aktiv ist (lokal oder Web-API) und warum ein Wechsel
  stattfand, inklusive Begründung bei abgelehnter lokaler Datei
- **jeder Steam-Aufruf mit Statuscode und Dauer**, Antworten über 2 Sekunden
  zusätzlich als LANGSAM markiert
- jede angezeigte Meldung samt XP-Zuwachs und Level

Die Datei wird bei 5 MB umgeschichtet, zwei ältere Stände bleiben erhalten.

**Sensible Daten werden vor dem Schreiben entfernt:** Steam-API-Schlüssel und
Sitzungskennungen erscheinen als `<entfernt>`, auch wenn sie ohne
Beschriftung mitten im Text stehen. Die Datei lässt sich also weitergeben.

## Zentrale Warteschlange für Steam-Anfragen

Alle Steam-Aufrufe laufen durch **eine** Stelle
(`backend/services/steamQueue.js`) mit zwei Vorrangstufen:

- **dringend** – Achievement-Erkennung (`?fresh=1`) und Spielstatus
- **hintergrund** – Freundesprofile, XP-Erstberechnung, Erscheinungsdaten

**Warum:** Die Komplettierungszeit hat beim Spielstart rund 80 Anfragen
abgesetzt und dadurch die Achievement-Erkennung ausgebremst. Der konkrete Fall
war behoben, die Ursache aber nicht: Jede Funktion konnte ungebremst Anfragen
stellen. Jetzt kann das keine mehr.

Die Vorrangstufe wird nicht durch alle Funktionen durchgereicht, sondern über
einen Ausführungskontext gesetzt. Dieselbe Funktion ist dadurch je nach
Aufrufer dringend oder Hintergrund, ohne dass ihre Signatur das wissen muss.

Weitere Eigenschaften:

- höchstens 4 Anfragen gleichzeitig, Mindestabstand 60 ms (beides über die
  `.env` einstellbar)
- bei HTTP 429 oder 403 wird pausiert statt weiter dagegenzulaufen, mit
  Verdopplung der Wartezeit bis maximal 60 Sekunden
- stündliche Übersicht im Protokoll, wie viele Anfragen welcher Stufe liefen
  und wie oft gedrosselt wurde

**Gemessen:** Mit 80 wartenden Hintergrundanfragen dauert eine dringende
Anfrage 21 ms statt 20 ms – der Vorrang greift.

## Tests

```bash
npm test
```

Läuft ohne zusätzliche Abhängigkeiten und **ohne vorheriges `npm install`**
(`node --test`). Dafür wurden die reinen Rechenteile von den Steam-Aufrufen
getrennt: `scoring.js` (Trophäenstufen, Schwierigkeit) und `xpMath.js` (XP und
Level) kommen ohne Netzwerkzugriff aus. Abgedeckt sind die
Stellen, an denen ein stiller Fehler am teuersten wäre:

- **Parser der lokalen Steam-Dateien** – gegen echte Dateien eines
  Spielrechners unter `tests/fixtures/`. Das Format ist von Valve nicht
  zugesichert, und mehrere Annahmen darüber waren nachweislich falsch.
- **Selbstprüfung** inklusive der Ablehnungsfälle – sie ist der Schutz gegen
  Fehlalarme und muss auch weiterhin ablehnen, was sie ablehnen soll.
- **Trophäen-Einstufung**, absolut wie relativ, samt der Sperren für sehr
  leichte Spiele.
- **Schwierigkeitsschätzung**, inklusive der Anforderung, dass ein steilerer
  Absturz einen höheren Wert ergibt.
- **Ausfallerkennung** – ab wann umgeschaltet wird, die Rückkehr in den
  Normalbetrieb und vor allem die Unterscheidung zwischen echtem Ausfall und
  einer Ablehnung durch Steam.
- **Datenablage** – Momentaufnahmen, Verhalten bei beschädigten Dateien, eine
  liegengebliebene Nebendatei nach einem Absturz, unvollständige letzte Zeile
  im Verlauf, Kürzen, Filtern und Tagesübersicht.
- **Konfiguration** – die Übernahme beim ersten Start, das Überstehen eines
  Updates mit ersetztem Programmordner und die Zusicherung, dass eine
  vorhandene Konfiguration nie überschrieben wird.
- **Warteschlange** – Vorrang, Obergrenze gleichzeitiger Anfragen,
  Mindestabstand, Verhalten bei Drosselung und die Weitergabe der Vorrangstufe
  über den Ausführungskontext.
- **XP- und Level-Kurve** – und ein Test, der sicherstellt, dass Backend und
  Dashboard dieselbe Kurve verwenden. Sie liegt doppelt im Code; ohne diesen
  Test könnten Overlay und Dashboard unbemerkt verschiedene Level anzeigen.

Die Tests wurden gegengeprüft: Werden Level-Kurve, Trophäen-Schwelle oder
Parser absichtlich verändert, schlagen sie fehl.
