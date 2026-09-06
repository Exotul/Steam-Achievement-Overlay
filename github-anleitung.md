# GitHub einrichten – Schritt für Schritt

Ziel: Deine App liegt auf GitHub, und die automatischen Updates funktionieren.
Du brauchst dafür kein Vorwissen. Rechne mit 30–45 Minuten.

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
2. **Repository name**: `trophaenschrank`
   (genau so – ohne Umlaut, ohne Leerzeichen; wir tragen den Namen später in
   die App ein)
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
git remote add origin https://github.com/DEIN_NAME/trophaenschrank.git
```
**`DEIN_NAME` durch deinen GitHub-Benutzernamen ersetzen.** Verbindet deinen
Ordner mit dem Repo.

```
git push -u origin main
```
Lädt alles hoch. Beim ersten Mal öffnet sich ein Fenster zur Anmeldung –
"Sign in with your browser" wählen und im Browser bestätigen.

Danach deine Repo-Seite im Browser neu laden: Die Dateien sind da.

---

## Schritt 7: App auf dein Repo einstellen

Damit die App weiß, wo sie nach Updates suchen soll:

1. `overlay/package.json` in einem Texteditor öffnen
2. Diesen Abschnitt suchen:

```json
"publish": [
  {
    "provider": "github",
    "owner": "DEIN_GITHUB_NAME",
    "repo": "trophaenschrank"
  }
]
```

3. `DEIN_GITHUB_NAME` durch deinen Benutzernamen ersetzen. **Die
   Anführungszeichen müssen bleiben.**
4. Speichern

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

Danach auf `https://github.com/DEIN_NAME/trophaenschrank/releases` nachsehen:
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
