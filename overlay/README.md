# Trophäenschrank – Overlay (Electron)

Läuft im Hintergrund/System-Tray, erkennt automatisch, welches Spiel du
gerade spielst, und blendet ein Popup samt Sound ein, sobald ein neues
Achievement freigeschaltet wird. Setzt das Backend aus dem ersten Schritt
voraus.

## Setup

```bash
npm install
cp .env.example .env    # STEAM_API_KEY, SESSION_SECRET eintragen
npm start
```

Diese `.env` ist jetzt die einzige, die du befüllen musst - die Overlay-App
reicht `STEAM_API_KEY` und `SESSION_SECRET` beim automatischen Start des
Backends direkt weiter. Ein separates `npm install`/`npm start` im
`backend`-Ordner ist für den normalen Gebrauch nicht mehr nötig (aber
weiterhin möglich, z. B. zum Entwickeln - die Overlay-App erkennt dann,
dass das Backend schon läuft, und startet keinen zweiten Prozess).

Willst du eine fertige `.exe` statt `npm start`? Siehe die Anleitung
"Einen echten Installer bauen" in der README im Hauptordner.

Beim ersten Start ist noch niemand eingeloggt. Rechtsklick auf das
Diamant-Icon im System-Tray → "Mit Steam anmelden" öffnet ein Fenster mit dem
echten Steam-Login. Danach schließt es sich automatisch, und das Tray-Menü
zeigt deinen Namen. Die Session bleibt über Neustarts hinweg bestehen
(Electron speichert die Cookies), ein erneutes Einloggen ist danach in der
Regel nicht mehr nötig.

## Status-Abzeichen unten rechts

Ein kleines Abzeichen mit Logo, Spielname und Fortschritt zeigt an, dass die
App läuft. Standardmäßig erscheint es, während Steams eigenes Overlay offen
ist (Shift+Tab), und verschwindet wieder mit ihm. Einstellbar über
`STATUS_BADGE` in der `.env`: `steam-overlay`, `spiel` (dauerhaft während
eines Spiels) oder `aus`.

**Was hier NICHT möglich ist:** In Steams Overlay hineinzuzeichnen. Steam
injiziert es direkt in die Grafikausgabe des Spiels; von außen kommt kein
Programm da hinein. Das Abzeichen ist deshalb eine eigene Einblendung unseres
Overlay-Fensters, das über dem Spiel (und damit auch über Steams Overlay)
liegt. Optisch ist der Effekt derselbe, technisch ist es getrennt.

**Wie das Erkennen funktioniert:** Steam schreibt beim Ein- und Ausblenden
des Overlays in `logs/gameoverlay_renderer.txt`. Die App liest diese Datei
mit und schaltet das Abzeichen entsprechend. Das Format ist von Valve nicht
zugesichert, deshalb ist die Erkennung tolerant gebaut - und wenn sie in
einer Sitzung überhaupt kein Ereignis zuordnen kann, blendet sie das
Abzeichen dauerhaft ein, statt es nie zu zeigen.

Die Achievement-Meldungen selbst sind davon unabhängig und erscheinen
weiterhin immer, auch außerhalb des Steam-Overlays.

**Falls die Erkennung bei dir nicht greift:** Tray-Menü -> "Lokale Erkennung
prüfen…" listet unter "Status-Abzeichen" die Zeilen auf, die aus Steams
Protokoll nicht zugeordnet werden konnten. Damit lässt sich die Erkennung
gezielt anpassen, statt zu raten.

## XP-Meldung und Level

Nachdem eine Achievement-Meldung verschwunden ist, folgt eine schmalere
Meldung mit dem XP-Zuwachs, dem aktuellen Level und einem Balken, der sichtbar
weiterwächst. Beim Levelaufstieg läuft der Balken zuerst voll, die Meldung
leuchtet kurz auf, die Levelzahl springt, Funken fliegen und eine aufsteigende
Tonfolge spielt - danach beginnt der Balken von vorn.

**Der XP-Stand wird nur EINMAL beim Start der App ermittelt.** Danach schreibt
die App ihn selbst fort: Der Zuwachs eines Achievements ist eine bekannte
Größe (Stufenfaktor × (100 − Prozentsatz)) und muss nicht bei Steam erfragt
werden. Die ganze Bibliothek bei jedem Achievement neu durchzugehen wäre
verschwendete Zeit und würde die Achievement-Erkennung ausbremsen.

Während der einmaligen Berechnung erscheint ein Ladebalken mit dem Fortschritt
("45 / 210 Spiele"). Das Ergebnis wird 12 Stunden zwischengespeichert und
übersteht Neustarts, sodass der Balken meist gar nicht erst auftaucht.

## Test-Achievement

Tray-Menü -> "Test-Achievement anzeigen". Spielt die komplette Abfolge mit
einem erfundenen Achievement ab - Popup, Ton, XP-Meldung -, **ohne** etwas am
tatsächlichen Stand zu ändern. Gedacht zum Prüfen von Aussehen, Position und
Ton, ohne erst ein Achievement erspielen zu müssen. Bei jedem Aufruf kommt die
nächste Trophäenstufe an die Reihe, sodass sich alle vier Farben durchprobieren
lassen.

## Automatisch mit Windows starten

Tray-Menü -> Haken bei "Automatisch mit Windows starten". Die App trägt sich
dann über die Bordmittel des Betriebssystems in den Autostart ein (unter
Windows der übliche Registrierungseintrag, unter macOS die Anmeldeobjekte) -
es wird nichts Eigenes ins System geschrieben, und der Haken lässt sich
jederzeit wieder entfernen.

Beim automatischen Start geht die App direkt ins Tray, ohne Fenster, und die
Begrüßungsmeldung "Happy Trophy Hunting" entfällt - beim Hochfahren laufen
ohnehin genug Dinge an. Das Backend startet dabei wie gewohnt automatisch mit.

**Wichtig:** Der Autostart sollte in der **installierten** Version gesetzt
werden (siehe "Einen echten Installer bauen" in der README im Hauptordner).
Schaltest du ihn ein, während die App über `npm start` läuft, zeigt der
Eintrag auf die Entwicklungsumgebung statt auf ein fertiges Programm - die App
weist beim Einschalten selbst darauf hin.

## Wie Achievements erkannt werden

Zwei Wege, die zusammenarbeiten.

### Voraussetzung: Steam muss das laufende Spiel veröffentlichen

Die App kann nur verfolgen, was Steam über deinen Status meldet. Steam gibt
das laufende Spiel **nicht** heraus, wenn:

- dein Online-Status auf "Unsichtbar" oder "Offline" steht (häufigste
  Ursache - "Unsichtbar" ist besonders tückisch, weil du trotzdem normal
  spielen kannst), oder
- im Profil unter Datenschutzeinstellungen die "Spieldetails" nicht auf
  "Öffentlich" stehen.

In beiden Fällen erscheinen gar keine Meldungen, weil die App nicht weiß,
welches Spiel sie beobachten soll. Tray-Menü -> "Lokale Erkennung prüfen…"
zeigt ganz oben, was Steam gerade meldet.

### Web-API (Grundlage, immer aktiv)

1. **Anwesenheits-Check** (`PRESENCE_POLL_INTERVAL_MS`, Standard 15s): fragt
   über `GetPlayerSummaries` ab, ob und welches Spiel gerade läuft.
2. **Achievement-Check** (`ACHIEVEMENT_POLL_INTERVAL_MS`, Standard 2s): fragt
   die Achievement-Liste des laufenden Spiels ab.

**Warum das allein zu langsam ist:** Die Steam-*Web*-API liefert serverseitig
zwischengespeicherte Daten. Selbst wenn das Spiel das Achievement sofort an
Steam meldet (was es tut - sonst käme Steams eigenes Popup ja auch nicht
sofort), kann es danach noch deutlich dauern, bis die Web-API den neuen Stand
herausgibt. Das ist die Verzögerung von teils bis zu einer Minute und liegt
außerhalb dieser App - kein Poll-Intervall kann sie verkürzen.

### Lokale Beschleunigung (`LOCAL_WATCH=auto`, Standard)

Steam legt die Achievement-Daten eines Spiels lokal ab unter

```
<Steam>\appcache\stats\UserGameStats_<konto>_<appid>.bin
```

Eine echte Aufzeichnung auf einem Spielrechner hat bestätigt: Diese Datei
wird **im Moment der Freischaltung** geschrieben - eine Sekunde bevor
überhaupt etwas in der Logdatei landet. Die Größe wächst dabei jeweils um
etwa die Länge eines Achievement-Namens (beobachtet: +22, +35, +48 Bytes).

Die App beobachtet diese Datei (alle 400 ms per Größen-/Zeitstempelabfrage)
und liest sie bei Änderung sofort aus.

**So ist die Datei aufgebaut** (an echten Dateien eines Spielrechners
nachgeprüft, nicht geraten):

```
UserGameStatsSchema_<appid>.bin     Namen aller Achievements
  <appid> -> stats -> "<statId>" -> bits -> "<bitNr>" -> name = "PET_1000"

UserGameStats_<konto>_<appid>.bin   Status als Bitfeld
  cache -> "<statId>" -> data = 31        (binär 11111 = Bits 0-4 gesetzt)
  cache -> "<statId>" -> AchievementTimes -> "<bitNr>" = Zeitstempel
```

Beide Dateien liegen im selben Ordner. Die App liest das Schema als
Nachschlagewerk und den Status als Bitfeld: Bit N gesetzt bedeutet, dass das
Achievement mit Bit-Nummer N freigeschaltet ist. Deshalb wächst die
Statusdatei beim Freischalten nur um wenige Bytes.

**Die entscheidende Absicherung:** Valve sichert für dieses Format nichts zu,
und eine frühere Version dieser App hat durch Raten Fehlalarme erzeugt.
Deshalb gilt:

> Die Datei wird nur dann als Quelle akzeptiert, wenn die daraus gelesene
> Menge freigeschalteter Achievements **exakt** dem entspricht, was die
> Steam-Web-API beim Spielstart bestätigt hat.

Passt es nicht exakt, wird die Datei verworfen und es bleibt bei der Web-API.
Ein falsch gelesenes Format kann dadurch keine Fehlalarme auslösen - es fällt
bei der Prüfung durch, bevor es jemals etwas melden darf. Zusätzlich gilt:
Meldet die Datei mehr als fünf neue Einträge auf einmal, wird nichts
angezeigt.

**Status prüfen:** Tray-Menü -> "Lokale Erkennung prüfen…". Bei Erfolg steht
dort "GEFUNDEN und geprüft"; andernfalls listet die Diagnose jede geprüfte
Datei mit dem konkreten Grund auf (z. B. "gelesen: 3 Einträge, Steam
bestätigt: 5"), sodass sich gezielt nachbessern lässt.

Im Tray steht hinter dem Spielnamen `· lokal (sofort)` oder
`· lokal beschleunigt`.

### Dateiänderungen aufzeichnen (Diagnose)

Tray-Menü -> "Dateiänderungen aufzeichnen…". Zeichnet auf, welche Dateien
unter dem Steam-Ordner sich während des Spielens tatsächlich ändern, und
legt einen lesbaren Bericht auf dem Schreibtisch ab.

Sinn der Sache: Valve sichert für die lokalen Statistikdateien kein Format
zu, und Vermutungen darüber haben sich als fehleranfällig erwiesen. Der
Bericht zeigt mit echten Daten, ob und wann Steam beim Freischalten lokal
etwas schreibt - erst auf dieser Grundlage lässt sich seriös entscheiden, ob
eine schnellere lokale Erkennung überhaupt zuverlässig machbar ist.

Erfasst werden nur Dateipfade, Größen und Zeitpunkte - keine Dateiinhalte.

### Was diese App bewusst NICHT tut

- Kein Steamworks-SDK, keine `steamworks.js`, kein Ausgeben als ein Spiel
  gegenüber Steam
- Kein Einklinken in Steam oder ein Spiel (keine DLL-Injection)
- Kein Schreiben, Verändern oder Löschen von Steam-Dateien - ausschließlich
  Lesen
- Keine direkte Kommunikation mit Steam-Servern außer über die offizielle,
  mit deinem eigenen API-Key autorisierte Web-API

## Vollbildmodus - was funktioniert und was nicht

Das Overlay läuft auf der höchstmöglichen Fensterebene, die das
Betriebssystem anbietet (`screen-saver`-Level), deckt den gesamten Bildschirm
ab (inklusive Taskleisten-Zone) und setzt seinen Vordergrund-Status alle 4
Sekunden neu - letzteres, weil manche Spiele beim Wechsel in den Vollbildmodus
andere Fenster dauerhaft nach hinten schieben. Damit funktioniert es bei:

- Fenster-Modus
- Randlosem Fenster-Modus ("Borderless" / "Fullscreen Windowed")
- Den meisten DirectX-12- und Vulkan-Titeln auch im echten Vollbild
- Windows-"Vollbildoptimierungen" (Standard bei aktuellen Spielen - technisch
  randlos, auch wenn im Spielmenü "Vollbild" steht)

Nicht möglich ist es bei **exklusivem Vollbild**, vor allem bei älteren
DirectX-9/10/11-Titeln: Dort übernimmt das Spiel die Grafikausgabe komplett
selbst, und kein externes Fenster kann sich darüberlegen - das gilt genauso
für Discord, MSI Afterburner und andere Overlays. Steams eigenes Overlay
schafft das nur, weil es sich direkt in die Grafik-API des Spiels einklinkt
(DLL-Injection); das wäre ein eigenes, deutlich größeres und spielspezifisches
Projekt.

**Falls ein Spiel das Overlay verdeckt:** In dessen Grafikeinstellungen von
"Vollbild" auf "Randloses Fenster" umstellen - kostet bei modernen Spielen
praktisch keine Leistung und löst das Problem zuverlässig.

## Schwierigkeitsschätzung (0-10)

Die Spielstart-Meldung zeigt eine geschätzte Komplettierungs-Schwierigkeit,
farblich von hellgrün (0) über gelb (5) bis dunkelrot (10).

**Wie sie entsteht - und was sie NICHT ist:** Es gibt keine öffentliche
Schnittstelle für echte, von Menschen vergebene Schwierigkeitsbewertungen.
Seiten wie TrueSteamAchievements oder Astats pflegen solche Werte, bieten sie
aber nicht als API an. Der Wert hier wird aus den Seltenheitsdaten berechnet,
die Steam ohnehin liefert:

1. **Seltenstes Achievement** (logarithmisch) - der Flaschenhals für 100 %.
2. **Der Absturz vom leichtesten zum seltensten Achievement.** Wenn 75 % das
   erste Achievement haben, aber nur 0,01 % das letzte, ist das ein Faktor von
   7500 - ein Spiel, das fast jeder anspielt und fast niemand abschließt. Das
   deutet stark auf verpassbare oder ausgesprochen harte Achievements hin. Ein
   Spiel, das gleichmäßig durchläuft (90 % bis 45 %), bekommt hier nichts.
3. **Median aller Achievements** - ist das ganze Spiel zäh oder sticht nur
   eines heraus?
4. **Anzahl der Achievements** - Aufwand durch schiere Menge.

**Grenzen:** Die Schätzung misst, wie wenige Leute es geschafft haben - nicht
warum. Ein sehr langes Spiel bekommt einen hohen Wert, obwohl es nur zäh und
nicht schwer ist. Als Orientierung taugt sie, als Urteil nicht.

## Geschätzte Zeit bis zur Komplettierung

**Wichtig zur Geschwindigkeit:** Diese Berechnung fragt NICHTS bei Steam nach.
Sie liest ausschließlich Freundesprofile, die bereits berechnet wurden - und
das passiert nur, wenn im Dashboard der Reiter "Freunde" geöffnet wird.
Früher hat sie beim Spielstart selbst die Freundesliste durchgearbeitet und
dabei die Achievement-Erkennung ausgebremst. Sind noch keine Profile
berechnet, wird schlicht keine Zeit angezeigt - lieber nichts als eine
Verzögerung im Spiel.


Neben der Schwierigkeit steht die Spielzeit derjenigen, die das Spiel
**vollständig** abgeschlossen haben, samt Stichprobengröße ("4 Komplett.").

**Woher die Daten kommen:** Steam bietet keine Statistik "durchschnittliche
Zeit bis 100 %". Verfügbar ist nur die Spielzeit einzelner Personen mit
öffentlichem Profil. Ausgewertet wird deshalb, wer aus der **eigenen
Freundesliste** das Spiel tatsächlich komplett hat - plus die eigene Zeit,
falls zutreffend. Angezeigt wird der Median.

**Grenzen, die man kennen sollte:**

- **Kleine Stichprobe.** Bei einem einzigen Komplettierer ist das eine
  Anekdote, keine Statistik. Deshalb steht die Anzahl immer dabei.
- **Spielzeit ist nicht Zeit bis zur Komplettierung.** Wer nach dem letzten
  Achievement weiterspielt, zieht den Wert nach oben.
- Hat niemand im Freundeskreis das Spiel komplett, wird nichts angezeigt.

Der Wert wird erst nach der Meldung nachgereicht und in die noch sichtbare
Meldung eingesetzt - seine Ermittlung dauert einige Sekunden, weil dafür die
Freundesliste durchgegangen wird. Ergebnisse werden 6 Stunden
zwischengespeichert.

## Die Animation im Detail

**Lage und Größe:** Die Meldungen erscheinen oben rechts, wie man es von
Konsolen kennt. Sie fliegen von außerhalb des rechten Bildschirmrands herein
(mit leichtem Überschwingen nach links, damit die Bewegung gebremst statt
abrupt wirkt) und verlassen den Bildschirm später wieder nach rechts. Die
Breite wächst mit dem Bildschirm mit: 660 px auf kleinen, bis 960 px auf
großen Monitoren.

**Das Logo:** Links in jeder Meldung steht der Diamant der App, eingefärbt in
der Farbe der jeweiligen Trophäenstufe - bei einem Kupfer-Achievement also in
Kupfer. Der Umriss wird beim Erscheinen gezeichnet, danach füllt sich die
Fläche, ein Glanzlicht läuft darüber, und ein leiser Schimmer atmet, solange
die Meldung steht.


Jede Trophäen-Stufe fühlt sich bewusst spürbar unterschiedlich an - nicht
nur farblich:

- **Kupfer**: ruhiges Einschweben mit leichtem Überschwingen (Spring-Easing),
  sanftes Icon-"Pop". Kein Extra-Effekt - bleibt bewusst unaufgeregt.
- **Silber**: zusätzlich ein einmaliger diagonaler Lichtstreif über die Karte.
- **Gold**: Lichtstreif + pulsierender Glow-Rahmen + kleine Funken, die vom
  Icon wegspringen.
- **Platin**: wie Gold, plus ein doppelter Ring-Puls um das Icon und mehr
  Funken - das spürbar "seltenste" Gefühl der vier Stufen.
- **Diamant** (ganzes Spiel abgeschlossen): eigene, deutlich größere
  Feier-Karte statt des normalen Toasts - rotierender Regenbogen-Rahmen,
  schimmernder Farbverlauf-Schriftzug, größerer Funkenregen und eine
  mehrtönige Fanfare statt des normalen Zweiklangs. Bleibt außerdem länger
  stehen (8 statt 6 Sekunden).

Die Tonhöhe des normalen "Erfolgs-Klangs" steigt zusätzlich leicht mit der
Stufe (Kupfer klingt am tiefsten/ruhigsten, Platin am hellsten), damit sich
auch der Sound nach Seltenheit anfühlt.

Die Spielstart-Meldung bleibt deutlich länger stehen als eine
Achievement-Meldung (Standard 30 Sekunden, einstellbar über
`GAME_TOAST_SECONDS`): Beim Spielstart folgen oft noch Ladebildschirme und
Menüs, sodass eine kurze Einblendung untergeht. Sie ist außerdem der Ort, an
dem die nachgereichte Komplettierungszeit eingesetzt wird - auch dafür
braucht sie etwas Zeit.

Die Trophäenart ist gleich dreifach ablesbar: als beschriftete Plakette
rechts im Popup, als farbige Raute an der Ecke des Achievement-Symbols und
über die Farbe des linken Rahmens. Jedes Popup bleibt rund 8,5 Sekunden
stehen - genug Zeit zum Lesen, ohne dauerhaft im Bild zu sein.

Wenn Steam für das Achievement eine Beschreibung liefert, steht sie unter
dem Namen (auf zwei Zeilen begrenzt, längere Texte werden abgekürzt). Bei
versteckten Achievements liefert Steam oft gar keine Beschreibung - dann
entfällt die Zeile, statt eine Lücke zu hinterlassen.

## Bekannte Grenzen dieser Version

- Es wird nur ein Achievement-Popup pro Steam-Nutzer verfolgt (der, der im
  Tray eingeloggt ist) - nicht die deiner Freunde.
- Das Overlay-Fenster deckt aktuell nur den primären Bildschirm ab.
- Kein manuelles "Spiel auswählen" - die Erkennung läuft ausschließlich über
  den Steam-Onlinestatus. Falls dein Profil auf "Offline erscheinen"
  gestellt ist, wird kein Spiel erkannt.


## Warum es nach einem Rechnerneustart langsamer sein konnte

Drei Dinge haben sich nach dem Hochfahren gegenseitig verstärkt. Alle drei
sind behoben:

1. **Der Zwischenspeicher lag nur im Arbeitsspeicher.** Nach einem Neustart
   war alles kalt - auch Dinge, die sich nie ändern (Achievement-
   Beschreibungen, weltweite Prozentsätze). Die mussten dann beim ersten
   Spielstart alle gleichzeitig neu geholt werden. Jetzt liegen langlebige
   Einträge in `~/.trophaenschrank/cache.json` und überstehen den Neustart.

2. **Die Komplettierungszeit startete sofort beim Spielstart.** Sie geht die
   Freundesliste durch - früher bis zu 80 Steam-Abfragen genau in dem Moment,
   in dem die Achievement-Erkennung anlaufen soll. Steam drosselt dann, und
   ausgerechnet die Achievement-Meldungen kamen verspätet. Jetzt startet sie
   6 Sekunden später, einzeln statt parallel und mit kurzen Pausen.

3. **Die Prüfung der lokalen Datei lief nur einmal.** Direkt nach einem
   Neustart kann Steams lokale Datei noch nicht auf dem aktuellen Stand sein -
   dann wird sie (richtigerweise) abgelehnt, und die ganze Sitzung lief über
   den langsamen Weg. Jetzt wird alle 15 Sekunden erneut geprüft, bis es
   passt; im Tray wechselt der Status dann auf `· lokal (sofort)`.

Zusätzlich darf die lokale Datei der Web-API bis zu zwei Einträge voraus
sein, ohne verworfen zu werden - genau dieser Fall tritt nach einem Neustart
auf, wenn die Web-API noch hinterherhinkt. Diese Einträge werden still in den
Ausgangsstand übernommen, damit sie nicht fälschlich als neu gemeldet werden.
