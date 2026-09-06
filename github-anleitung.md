# GitHub einrichten – Schritt für Schritt

Ziel: Deine App liegt auf GitHub, und die automatischen Updates funktionieren.
Du brauchst dafür kein Vorwissen.

## Stand jetzt – was schon erledigt ist

**Die Schritte 1 bis 7 sind durch.** Dein Repo liegt unter

    https://github.com/Exotul/Steam-Achievement-Overlay

und die App ist bereits darauf eingestellt (`overlay/package.json` →
`build.publish`). Die Schritte 1–7 stehen unten nur noch als Nachschlagewerk,
falls du das Ganze irgendwann neu aufsetzen musst.

**Offen ist noch Schritt 8 und 9**: der Zugangsschlüssel zum Veröffentlichen
und die erste Fassung als Release. Erst danach gibt es überhaupt etwas
herunterzuladen und erst danach funktionieren die automatischen Updates.
Spring also direkt zu Schritt 8.

---

## Was GitHub überhaupt ist

Stell dir einen Ordner in der Cloud vor, der sich jede Änderung merkt. Du
kannst jederzeit zurückspringen, sehen was sich geändert hat, und Dateien
veröffentlichen.

Für uns sind zwei Dinge wichtig:

- **Repository** (kurz: Repo) – dein Projektordner auf GitHub.
- **Release** – eine veröffentlichte Fassung mit angehängten Dateien. Genau
  dort holt sich die App ihre Updates. Ohne Release keine Updates.

Kostenlos, und ein privates Repo ist möglich – **aber Achtung**: Bei einem
privaten Repo kommt die App ohne Zugangsdaten nicht an die Updates heran. Für
unseren Zweck brauchst du ein **öffentliches** Repo. Dein Steam-Schlüssel
landet dort nicht (dafür sorgen die `.gitignore`-Dateien, siehe Schritt 5).

---

## Schritt 1: Konto anlegen

1. Auf https://github.com/signup gehen
2. E-Mail, Passwort, Benutzername wählen – der Name taucht später in der
   Adresse auf, also lieber etwas Bleibendes als einen Spitznamen
3. E-Mail bestätigen

Merk dir deinen **Benutzernamen**, den brauchst du in Schritt 6.

---

## Schritt 2: Git auf deinem PC installieren

Git ist das Programm, das deine Dateien zu GitHub schickt.

1. https://git-scm.com/download/win herunterladen
2. Installieren – **alle Voreinstellungen einfach durchklicken**. Es kommen
   viele Fragen; keine davon musst du ändern.
3. Prüfen: Eingabeaufforderung öffnen und eintippen:

```
git --version
```

Erscheint eine Versionsnummer, hat es geklappt. Falls "Befehl nicht gefunden"
kommt: Fenster schließen, neu öffnen, nochmal probieren (die Installation
ändert Einstellungen, die ein neues Fenster braucht).

---

## Schritt 3: Git einmalig einrichten

Git will wissen, wer die Änderungen macht. Einmalig eintippen, mit deinen
eigenen Angaben:

```
git config --global user.name "Markus"
git config --global user.email "deine@email.de"
```

Nimm dieselbe E-Mail wie bei GitHub.

---

## Schritt 4: Repository auf GitHub anlegen

1. Auf https://github.com/new gehen
2. **Repository name**: `Steam-Achievement-Overlay`
   (ohne Umlaut, ohne Leerzeichen; der Name wird später in die App
   eingetragen)
3. **Public** auswählen (nicht Private – sonst funktionieren die Updates
   nicht)
4. Die drei Häkchen unten (**Add a README**, **Add .gitignore**, **Choose a
   license**) alle **weglassen**. Wir haben schon Dateien; ein zusätzlicher
   README würde nur Konflikte verursachen.
5. Auf **Create repository** klicken

Du landest auf einer Seite mit Befehlen. Die brauchst du gleich nicht – nutz
stattdessen die Anleitung unten, sie ist auf dein Projekt zugeschnitten.

---

## Schritt 5: Prüfen, dass keine Geheimnisse hochgeladen werden

**Das ist der wichtigste Schritt.** Dein Steam-API-Schlüssel darf niemals auf
GitHub landen – öffentliche Repos werden automatisch nach solchen Schlüsseln
durchsucht.

Im Projekt gibt es bereits `.gitignore`-Dateien, die genau das verhindern
(`.env` ist dort ausgeschlossen). Trotzdem einmal selbst nachsehen:

Öffne in deinem Projektordner die Dateien `backend/.gitignore` und
`overlay/.gitignore`. In beiden muss eine Zeile stehen:

```
.env
```

Falls nicht: mit einem Texteditor ergänzen und speichern.

**Zusätzliche Sicherheit** – nach dem ersten Hochladen (Schritt 6) auf deiner
Repo-Seite nachsehen, ob irgendwo eine `.env` auftaucht. Falls doch:
Schlüssel bei https://steamcommunity.com/dev/apikey sofort zurückziehen und
einen neuen holen. Ein einmal veröffentlichter Schlüssel bleibt in der
Historie, auch wenn die Datei später gelöscht wird.

---

## Schritt 6: Projekt hochladen

Eingabeaufforderung öffnen und in deinen Projektordner wechseln:

```
E:
cd Steam_achievement_app\steam-achievements-app
```

(Pfad anpassen, falls deiner anders heißt.)

Dann diese Befehle **nacheinander**, jeweils mit Enter:

```
git init
```
Macht aus dem Ordner ein Git-Projekt.

```
git add .
```
Merkt alle Dateien vor – außer denen in `.gitignore`.

```
git status
```
**Hier innehalten und schauen.** Es erscheint eine Liste. Taucht darin
irgendwo `.env` auf, brich ab und geh zurück zu Schritt 5. `node_modules`
sollte ebenfalls nicht dabei sein.

```
git commit -m "Erste Fassung"
```
Hält den Stand fest. Der Text in Anführungszeichen ist deine Notiz dazu.

```
git branch -M main
```
Benennt den Hauptzweig um – GitHub erwartet `main`.

```
git remote add origin https://github.com/Exotul/Steam-Achievement-Overlay.git
```
Verbindet deinen Ordner mit dem Repo. (Steht dort ein anderer Benutzername,
ist es ein anderes Konto – dann den Namen entsprechend austauschen.)

```
git push -u origin main
```
Lädt alles hoch. Beim ersten Mal öffnet sich ein Fenster zur Anmeldung –
"Sign in with your browser" wählen und im Browser bestätigen.

Danach deine Repo-Seite im Browser neu laden: Die Dateien sind da.

---

## Schritt 7: App auf dein Repo einstellen — ERLEDIGT

Damit die App weiß, wo sie nach Updates suchen soll, steht in
`overlay/package.json` inzwischen:

```json
"publish": [
  {
    "provider": "github",
    "owner": "Exotul",
    "repo": "Steam-Achievement-Overlay"
  }
]
```

Hier stand vorher der Platzhalter `DEIN_GITHUB_NAME` mit einem Repo-Namen,
den es nicht gibt. Solange das so war, hätte die App **nie** ein Update
gefunden – sie hätte an einer Adresse gesucht, die es nicht gibt, und den
Fehlschlag stillschweigend ins Protokoll geschrieben. Du musst hier nichts
mehr tun; nur falls du das Repo je umbenennst, muss diese Stelle mit.

---

## Schritt 8: Zugangsschlüssel für das Veröffentlichen

Damit dein PC Releases erstellen darf, braucht er einen Zugangsschlüssel
(Token). Das ist nicht dein Passwort, sondern ein eigener Schlüssel, den du
jederzeit zurückziehen kannst.

1. Auf https://github.com/settings/tokens gehen
2. **Generate new token** → **Generate new token (classic)**
3. **Note**: `Trophaeenschrank Releases` (nur eine Notiz für dich)
4. **Expiration**: `No expiration` (sonst musst du ihn regelmäßig erneuern)
5. Bei den Häkchen nur **`repo`** anhaken – das reicht völlig
6. Ganz unten **Generate token**
7. **Jetzt sofort kopieren.** Der Schlüssel wird nur ein einziges Mal
   angezeigt. Geht er verloren, musst du einen neuen erstellen.

Diesen Schlüssel gibst du beim Veröffentlichen als Umgebungsvariable mit –
er gehört **nicht** in eine Datei im Projekt.

---

## Schritt 9: Erste Fassung veröffentlichen

In der Eingabeaufforderung, im `overlay`-Ordner:

```
E:
cd Steam_achievement_app\steam-achievements-app\overlay
set GH_TOKEN=hier_dein_kopierter_schluessel
npm run release
```

Das baut den Installer und lädt ihn als Release hoch. Dauert einige Minuten.

**Wichtig zu `set`:** Der Schlüssel gilt nur in diesem einen Fenster. Machst
du es zu, musst du ihn beim nächsten Mal erneut setzen. Das ist gewollt – so
liegt er nirgends dauerhaft herum.

Danach auf `https://github.com/Exotul/Steam-Achievement-Overlay/releases` nachsehen:
Dort sollte **v1.0.0** stehen, mit der `.exe` als Anhang.

Steht das Release auf **Draft** (Entwurf), musst du es einmal von Hand
öffnen und auf **Publish release** klicken – Entwürfe sieht die App nicht.

---

## Schritt 10: Ein Update herausgeben

Sobald wir etwas ändern:

1. **Versionsnummer erhöhen** in `overlay/package.json`:
   `"version": "1.0.0"` → `"version": "1.0.1"`
   Das ist entscheidend: Bei gleicher Nummer erkennt die App kein Update.
2. Änderung in `CHANGELOG.md` notieren (für dich und deine Freunde)
3. Hochladen und veröffentlichen:

```
git add .
git commit -m "Kurze Beschreibung der Änderung"
git push
set GH_TOKEN=dein_schluessel
npm run release
```

Installierte Fassungen finden das Update beim nächsten Start von selbst –
und fragen erst nach, wenn gerade kein Spiel läuft.

---

## Wenn etwas klemmt

**"fatal: not a git repository"**
Du bist im falschen Ordner. Mit `cd` in den Projektordner wechseln, in dem
`README.md` liegt.

**"Updates were rejected"**
Auf GitHub gibt es Änderungen, die du lokal nicht hast (etwa weil du dort
etwas bearbeitet hast). Lösung:
```
git pull --rebase origin main
git push
```

**"Authentication failed"**
Beim Hochladen erwartet GitHub nicht dein Passwort, sondern den Token aus
Schritt 8. Bei der Abfrage: Benutzername normal, als Passwort den Token.

**`npm run release` bricht mit "GitHub Personal Access Token is not set" ab**
Das `set GH_TOKEN=...` fehlt oder du bist in einem neuen Fenster. Nochmal
setzen.

**"Die Datei npm.ps1 kann nicht geladen werden, da die Ausführung von Skripts
auf diesem System deaktiviert ist"**
Windows liefert PowerShell mit der Richtlinie `Restricted` aus, die *jedes*
Skript verbietet - und `npm` ist unter Windows selbst ein Skript. Trifft
also jeden `npm`-Befehl, nicht nur das Veröffentlichen. Einmalig beheben:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Kein Administrator nötig, gilt nur für dein Konto, rückgängig mit
`-ExecutionPolicy Undefined`. Wer nichts am System ändern will, schreibt
stattdessen überall `npm.cmd` statt `npm` - das umgeht den Skript-Wrapper.

**`npm run release` bricht ab mit "Cannot create symbolic link: Dem Client
fehlt ein erforderliches Recht"**
Nicht dein Code. electron-builder lädt zum Signieren das Paket `winCodeSign`
herunter, in dem neben `signtool.exe` für Windows auch macOS-Dateien liegen -
darunter zwei *Symlinks* (`libcrypto.dylib`, `libssl.dylib`). Symlinks
anzulegen ist unter Windows ein eigenes Recht, das ein normales Konto nur
mit eingeschaltetem **Entwicklermodus** besitzt. 7-Zip scheitert daran, und
electron-builder wertet das als Totalausfall - obwohl zu diesem Zeitpunkt
alles Windows-Relevante längst entpackt ist.

Sauberste Lösung: **Einstellungen → Datenschutz und Sicherheit → Für
Entwickler → Entwicklermodus** einschalten, dann neu bauen.

Ohne Systemänderung geht es auch: Der Ordner ist bereits entpackt, er heißt
nur falsch. Unter
`%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\` liegen nach dem
Fehlschlag Ordner mit Zahlennamen (`975882983` o. ä.). Einen davon in
`winCodeSign-2.6.0` umbenennen, die übrigen samt `.7z`-Dateien löschen -
danach überspringt electron-builder Download und Entpacken und der Build
läuft durch. Die zwei fehlenden `.dylib`-Symlinks sind macOS-Bibliotheken
und für einen Windows-Installer bedeutungslos.

**Ich habe versehentlich meinen Steam-Schlüssel hochgeladen**
Ruhig bleiben, aber zügig handeln:
1. Auf https://steamcommunity.com/dev/apikey den Schlüssel zurückziehen
2. Neuen holen und in `~/.trophaenschrank/config.env` eintragen
3. Den alten aus dem Repo zu entfernen ist aufwendig und meist unnötig –
   entscheidend ist, dass er nicht mehr gültig ist

---

## Was du dir merken musst

Auf Dauer sind es nur diese Befehle:

```
git add .
git commit -m "Was ich geändert habe"
git push
```

Und fürs Veröffentlichen zusätzlich Versionsnummer erhöhen und
`npm run release`.
