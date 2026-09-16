# Änderungen heute

## Noch nicht veröffentlicht

### Behoben: Das Spiel minimierte sich, sobald die Maus über die Liste fuhr

Shift+Tab drücken, mit dem Zeiger über die Achievement-Übersicht fahren —
und das Spiel sprang aus dem Vollbild. Reproduzierbar, jedes Mal.

**Die Ursache, nachgemessen an den Fensterstilen** (nicht vermutet — die
erste Vermutung, das Fenster werde wieder fokussierbar, war nachweislich
falsch):

| Zustand | Ex-Style | Flaggen |
|---|---|---|
| ruhend | `0x08080028` | TRANSPARENT \| **LAYERED** \| NOACTIVATE \| TOPMOST |
| Zeiger auf der Liste | `0x08000008` | NOACTIVATE \| TOPMOST |

Das Overlay ist ein bildschirmfüllendes, transparentes Fenster. Damit man die
Liste darin bedienen konnte, musste es beim Betreten mit der Maus Klicks
annehmen — und `setIgnoreMouseEvents(false)` nimmt einem transparenten
Fenster unter Windows `WS_EX_LAYERED` weg. Das ist die Eigenschaft, die es
überhaupt erst vom Desktop-Compositor mischen lässt. Ohne sie muss er die
Fensterfläche neu aufbauen, und das wirft ein Spiel aus dem exklusiven
Vollbild — was Windows durch Minimieren auflöst.

Die Flagge lässt sich mit `setOpacity(1)` zurückholen (auch das gemessen),
aber `setOpacity` benutzt unter Windows `SetLayeredWindowAttributes` und
schaltet damit die **pixelgenaue** Transparenz ab. Statt des Overlays hätte
im schlimmsten Fall ein schwarzes Rechteck über dem Spiel gelegen. Dieser Weg
wurde deshalb verworfen.

**Die Lösung:** Die Übersicht hat jetzt ein **eigenes Fenster**
(`overlay/panel/`). Es nimmt die Maus von Anfang an an und ändert seine
Fensterstile deshalb nie. Das Overlay-Fenster ist im Gegenzug dauerhaft
durchlässig und rührt sie ebenfalls nie mehr an — aus einem Umschalten bei
jeder Mausbewegung ist gar kein Umschalten mehr geworden.

Beide Fenster halten ihre eigene Kopie der Spieldaten; der Hauptprozess
schickt beiden dasselbe. Zwei Fenster, die sich gegenseitig Zustand
zuschieben, wären genau die Art Kopplung, die später niemand mehr
durchschaut.

### Die Begrüßung steht in der Bildschirmmitte

„Happy Trophy Hunting“ war eine gewöhnliche Meldung in der eingestellten
Ecke. Dabei ist sie das Erste, was man von der App sieht.

Jetzt in der Mitte — und das Logo baut sich **Strich für Strich** auf: vier
Kanten, eine nach der anderen. Die vier Kanten sind deshalb vier einzelne
Pfade statt eines geschlossenen Umrisses; nur so lässt sich jede für sich
zeichnen. Zu jeder erklingt ein Ton (A-Dur aufwärts), zum Schluss liegen alle
drei zusammen und klingen aus. Bild und Ton haben denselben Puls — das ist
das, was daraus mehr macht als Bild plus Ton.

**Ausdrücklich nicht die Diamant-Fanfare.** Die gehört dem einen Moment, in
dem ein Spiel zu hundert Prozent steht, und verliert ihre Wirkung, wenn man
sie bei jedem Start hört.

### Updates werden jetzt auch wirklich eingespielt

Geprüft wurde die ganze Kette: `electron-updater` liegt als echte
Abhängigkeit im Paket, `app-update.yml` zeigt auf das richtige Repository,
und `latest.yml` ist unter der Adresse erreichbar, die die App abfragt. Die
App prüft 20 Sekunden nach dem Start und danach alle sechs Stunden, lädt im
Hintergrund und fragt vor dem Einspielen — nie während eines Spiels.

Eine Lücke war dabei: `autoInstallOnAppQuit` stand auf `false`. Wer den
Hinweis einmal auf „Später“ schob, bekam ihn in derselben Sitzung nicht
wieder — und beim nächsten Start lag das Update zwar fertig geladen da, wurde
aber nicht eingespielt. Steht jetzt auf `true`: eingespielt wird beim nächsten
Beenden, also nie mitten im Spiel. Die Nachfrage bleibt, sie ist nur nicht
mehr die einzige Gelegenheit.

### Kein Konsolenfenster mehr

`start.bat` rief `npm start` auf und endete mit `pause`. Dadurch stand die
ganze Zeit ein schwarzes Fenster im Weg — und wer es schloss, beendete damit
die App. Es war die einzige Art, das Programm loszuwerden.

Jetzt startet die Datei Electron direkt und schließt sich sofort wieder. Die
App läuft nur noch als Symbol in der Taskleiste; beendet wird sie dort per
Rechtsklick oder in den Einstellungen unter *Programm*.

Zwei Dinge dabei mitgenommen:

- Der Backend-Prozess wird mit `windowsHide` gestartet. Er erbt sonst die
  Konsole des Elternprozesses — und hat der keine, legt Windows je nach
  gestarteter Datei eine neue an. Ein schwarzes Fenster mitten im Spiel ist
  das Letzte, was ein Overlay tun sollte.
- Die Prüfung auf `overlay\.env` ist raus. Sie verhinderte den Start, obwohl
  die App längst ihr eigenes Einrichtungsfenster mitbringt und den Schlüssel
  selbst unter `~/.trophaenschrank/config.env` ablegt.

### Das Tray-Menü enthält nur noch Tägliches

Es war wieder auf fünfzehn Einträge angewachsen und mischte zwei
verschiedene Dinge: das, was man beim Spielen anklickt, und Werkzeuge, die
man ein- oder zweimal im Leben braucht. Ein Menü, in dem man suchen muss, ist
keins mehr.

Geblieben sind acht Einträge: Status, Anmelden, Achievements des Spiels,
Merkliste, Dashboard, Einstellungen, Beenden.

Umgezogen sind **Abmelden**, **Autostart**, **Version und Updates**, die
komplette **Diagnose** (lokale Erkennung, Schlüsselprüfung, Protokoll,
Aufzeichnung) und die **Testmeldungen**. Im Einstellungsfenster ist neben
jedem Punkt Platz für einen Satz, der erklärt wozu er gut ist — im
Kontextmenü war der nie.

### Die Diamant-Meldung steht jetzt in der Bildschirmmitte

Sie klebte bisher 90 Pixel unter dem oberen Rand, wie eine gewöhnliche
Meldung. Für den einen Moment, den es pro Spiel genau einmal gibt, ist das zu
beiläufig.

Neu ist die **Marke**: das App-Symbol, also unsere Raute, zeichnet sich
zunächst selbst — und verwandelt sich dann in die Silhouette eines
geschliffenen Diamanten. Die Spitze oben klappt dabei nach links und rechts
auf und wird zur Tafel des Schliffs; anschließend erscheinen die
Facettenlinien, und ein Glanzlicht wandert über den fertigen Stein.

Technisch hängt das daran, dass beide Umrisse **dieselbe Bauart** haben
müssen — ein M, vier L, ein Z. Nur dann führt der Browser den einen in den
anderen über; bei unterschiedlich vielen Punkten springt die Form. Die obere
Spitze ist deshalb doppelt aufgeführt. Nachgemessen im echten Chromium: Der
berechnete Pfad zur Halbzeit liegt punktweise zwischen beiden Formen, es
fließt also wirklich.

**Dabei aufgefallen:** Der umlaufende Farbrahmen der Karte drehte das
*Element* statt des Verlaufs. Weil die Karte breiter als hoch ist, wanderten
seine Ecken als zwei Diagonalen quer durch die Karte — mitten durch die
Überschrift. Solange die Karte oben am Rand klebte, ist das niemandem
aufgefallen; in der Bildmitte war es das Erste, was man sieht. Jetzt dreht
sich der Verlauf.

### Testmeldung für den Diamant-Status

Die echte Feier gibt es pro Spiel genau einmal im Leben. Wer sie einstellen
oder auch nur einmal in Ruhe ansehen wollte, hatte bisher keine Möglichkeit
dazu. In den Einstellungen steht jetzt neben "Testmeldung zeigen" ein zweiter
Knopf "Diamant-Meldung zeigen". Am Fortschritt ändert er nichts.

### Behoben: Der Zwischenspeicher konnte sich selbst zerstören

Gesucht war ein Geschwindigkeitsproblem — gefunden wurde ein Datenverlust.
`cache.json` lag mit dem richtigen Namen und plausibler Größe da, war aber ab
der Mitte mit NUL-Bytes gefüllt und damit unlesbar. Die App hat das fünf Tage
lang stillschweigend hingenommen und bei jedem Start leer angefangen. Nach
außen sah das nur so aus, als sei sie langsam geworden.

**Die Ursache:** `writeFileSync` kehrt zurück, sobald die Daten im Puffer des
Betriebssystems liegen — nicht, wenn sie auf der Platte stehen. Das
anschließende Umbenennen machte also eine Datei offiziell, deren Inhalt noch
gar nicht geschrieben war. Endet der Prozess vorher, bleibt der Rest als
NUL-Bytes stehen. Dieselbe Ursache hatte 502 NUL-Bytes in der Protokolldatei
hinterlassen.

Das Schreiben tut jetzt fünf Dinge, jedes davon aus einem konkreten Schaden:

1. Eine **eigene Nebendatei je Schreibvorgang** — zwei Prozesse können sich
   nicht mehr in dieselbe drängen.
2. **fsync**, bevor die Datei offiziell wird.
3. **Gegenlesen** — was nicht zurückkommt, wird nicht übernommen.
4. Die vorherige Fassung bleibt als **`.bak`** liegen; eine beschädigte Datei
   wird daraus wiederhergestellt statt leer zu starten.
5. **Umbenennen mit Wiederholung.** Unter Windows scheitert das mit `EPERM`,
   solange ein Virenscanner die Datei offen hält — im Protokoll standen dafür
   drei Fehler zu `sessions.json`, und die Anmeldung war danach jedes Mal weg.

Eine beschädigte Datei wird außerdem als `.kaputt` aufgehoben statt
überschrieben, und der Vorfall steht laut im Protokoll.

### Der Zwischenspeicher liegt jetzt in mehreren Dateien

Bisher alles in einer `cache.json` — 19 MB, bei jedem Start vollständig
geparst und bei **jeder** Änderung vollständig neu geschrieben. Beim Öffnen
des Dashboards passierte Letzteres mehrfach hintereinander.

Jetzt liegt jede Art in ihrer eigenen Datei unter `cache/`. Eine Änderung an
den weltweiten Prozentsätzen schreibt nur noch diese eine Datei, und gelesen
wird eine Art erst, wenn sie gebraucht wird — der Start wartet also nicht mehr
auf zehn Megabyte Schema-Daten.

Der wichtigste Gewinn ist aber ein anderer: **Eine beschädigte Datei kostet
nicht mehr alles**, sondern nur ihre eigene Art. Eine vorhandene alte
`cache.json` wird dabei übernommen statt weggeworfen.


### Neuer Reiter: Verlauf

Das Overlay schreibt seit jeher jede Freischaltung mit — Spiel, Stufe,
Prozentsatz, XP, Level, Zeitpunkt. Gezeigt wurde davon bisher nichts; der
Endpunkt `GET /api/history` war fertig und wurde von niemandem aufgerufen.
Jetzt gibt es die Ansicht dazu.

- **Überblick** über 7, 30, 90 Tage oder ein Jahr: Anzahl, XP, bester Tag,
  aktuelle Serie. Darunter die Verteilung auf die Trophäenstufen.
- **Jahresraster** — ein Kästchen je Tag, eingefärbt nach Ausbeute.
- **Zuletzt errungen** — jede Trophäe einzeln, nach Tagen gruppiert, mit
  Spiel, Stufe und XP.

Zur Gestaltung: Die Farbrampe des Rasters ist nachgemessen, nicht ausgesucht.
Ein Farbton, streng monoton steigende Helligkeit (OKLab L 0,570 → 0,647 →
0,733 → 0,815), jede Stufe über 3:1 Kontrast zur Fläche. Die Schwellen richten
sich nach dem eigenen Höchstwert — wer an guten Tagen drei Trophäen holt,
sieht dieselbe Spanne wie jemand mit dreißig.

Jedes Kästchen nennt seinen Wert auch als Text für Vorlesewerkzeuge, und
dieselben Zahlen stehen darunter als Liste. Die Farbe trägt nie allein eine
Aussage.

Die Datumsrechnungen liegen abhängigkeitsfrei in `frontend/src/lib/verlauf.js`
und sind mit 28 Tests abgedeckt — Zeitzonen, Monatsgrenzen, Schaltjahre und
Wochen über den Jahreswechsel fallen beim Draufschauen nicht auf.


### Merkliste: Nachsehen und Pflegen sind jetzt getrennt

Die Übersicht im Spiel nahm den Fokus, sobald man hineinklickte — und damit
war man aus dem Spiel heraus. Das ließ sich nicht wegprogrammieren: Ein
Fenster, das Tastatureingaben annimmt, **muss** den Fokus bekommen. Der Fehler
lag darin, zwei verschiedene Tätigkeiten in dasselbe Fenster zu packen.

**Im Spiel** (`Strg+Umschalt+A`) wird nur noch nachgesehen und geklickt. Das
Overlay ist jetzt **nie** fokussierbar — es kann dem Spiel den Fokus gar nicht
mehr wegnehmen. Möglich sind dort: Achievements an- und abhaken, Filter
umstellen, einen Zähler mit **+** und **−** verändern. Alles per Klick, nichts
per Tastatur. Such- und Eingabefeld sind entfallen, weil sie dort ohnehin
nicht bedienbar wären.

**Neues Fenster „Merkliste bearbeiten…"** im Tray-Menü — ein gewöhnliches
Fenster, kein Overlay. Darin lässt sich in Ruhe tippen: eigene Einträge in
allen drei Formen anlegen, umbenennen, entfernen, Achievements anhaken, und
über eine Auswahl oben auch für Spiele, die gerade nicht laufen. So lässt sich
eine Liste **vor** dem Spielen zusammenstellen, statt mitten drin.

Die Spielnamen dafür werden beim Spielstart nebenbei gemerkt
(`~/.trophaenschrank/spielnamen.json`) — sonst stünde in der Auswahl
„App 7670" statt „BioShock".


### Drei Arten eigener Einträge

Beim Anlegen eines eigenen Eintrags lässt sich jetzt die Form wählen:

- **Notiz** — eine Zeile Text, wie bisher.
- **Tracker** — Text mit Zählerstand, etwa `Audionotizen 12 / 52`, mit
  Fortschrittsbalken. Für alles, was das Spiel selbst nicht mitzählt. Ein
  **+1**-Knopf in der Übersicht zählt hoch, ohne ein Formular zu öffnen — das
  ist der mit Abstand häufigste Griff.
- **Abschnitt** — eine grün hinterlegte Überschrift, um längere Listen zu
  gliedern.

Die Reihenfolge bleibt so, wie die Einträge angelegt wurden — sonst würden
die Überschriften nichts gliedern.

### Eigene Einträge lassen sich bearbeiten

Über das Stiftsymbol. Die Kennung bleibt dabei erhalten, der Eintrag rutscht
also nicht an eine andere Stelle. Auch die Art lässt sich nachträglich
wechseln.

Kaputte Eingaben werden geradegezogen statt abgelehnt: Ein Tracker ohne Ziel
wird zur Notiz (ein Ziel von 0 wäre eine Division durch null), ein Stand über
dem Ziel wird gekappt (sonst zeigt der Balken mehr als voll), krumme Zahlen
werden gerundet.

### Merkliste größer, Abzeichen einstellbar

Die Merkliste ist von Haus aus deutlich breiter (330 statt 260 Pixel) und die
Schrift größer — Achievement-Namen sind oft lang, und ein abgeschnittener Name
hilft beim Erinnern nicht.

Das **Status-Abzeichen** unten rechts (Spielname, Trophäenstand, Tastenkürzel)
hat jetzt eine eigene Größeneinstellung. Getrennt von der Merkliste, weil es
eine andere Aufgabe hat: Es soll im Blick sein, ohne zu stören, während die
Merkliste lesbar sein muss.


### Behoben: Übersicht stand dauerhaft im Bild und blockierte die Bedienung

Drei Fehler, die sich gegenseitig verstärkt haben.

**1. Die Übersicht war nie ausgeblendet.** `.panel { display: flex }` schlägt
das HTML-Attribut `hidden` — sie stand also von der ersten Sekunde an im Bild,
ohne laufendes Spiel, ohne Tastendruck. Behoben durch eine `[hidden]`-Regel
mit Vorrang, in allen drei Fenstern der App.

**2. Steams Overlay wurde falsch erkannt.** Zwei Muster waren zu grob:

- `enable` galt als „Overlay ist offen". Steam schreibt beim Start aber
  `GameOverlayRenderer enabled` — das heißt nur, dass die *Funktion*
  eingeschaltet ist. Die App hielt das Overlay dadurch immer für geöffnet.
- In `deactivated` steckt `activated`. Die Zeile, die das **Schließen**
  meldet, wurde deshalb als **Öffnen** gelesen — es ging nie wieder zu.

- Das Muster verlangte `overlay` **vor** dem Zustandswort. Steam schreibt
  aber `Showing overlay …` — genau andersherum. Damit wurde überhaupt nichts
  erkannt.

Die Erkennung ist jetzt an **echten Daten** ausgerichtet statt geraten. So
schreibt Steam es tatsächlich:

```
… now requesting overlay enable
Showing overlay and saving cursor show count: -7
… now requesting overlay disable
Hiding overlay and restoring cursor show count: -7
```

Diese vier Zeilen stehen als Testdaten im Projekt. Zusätzlich erkannt wird die
verbreitete Form `overlay active: 0/1`; Zeilen ohne bekanntes Muster landen im
Protokoll, damit sich das weiter nachbessern lässt.

**3. Das Overlay schluckte alle Mausklicks.** Bei offener Übersicht wurde der
Mausfang für das ganze, bildschirmfüllende Fenster eingeschaltet. Damit gingen
auch die Klicks für Steams Overlay und das Spiel dorthin — von außen sah das
aus, als hänge der Rechner. Der Mausfang wird jetzt punktgenau geschaltet: nur
während der Zeiger tatsächlich über der Übersicht steht. Alles daneben geht
hindurch.

Ebenso wurde beim Öffnen `focus()` gerufen und Steams Overlay damit im selben
Moment der Fokus entzogen, in dem es aufgeht. Das passiert nicht mehr — den
Fokus bekommt das Fenster erst, wenn jemand hineinklickt.

### Vorschau beim Spielstart wieder entfernt

Die durchrollenden Achievements waren im Spiel störend statt hilfreich.
Ersatzlos entfernt, samt ihrer Einstellungen.

### Eigener Eintrag erscheint erst auf Klick

Das Eingabefeld stand dauerhaft in der Übersicht. Jetzt liegt dort ein Knopf
**+ Neuer Eintrag**; das Feld erscheint erst danach und verschwindet nach dem
Hinzufügen wieder. Escape schließt erst das Feld, dann die Übersicht.


### Eigene Einträge in der Merkliste

Manche Achievements verlangen etwas, das das Spiel selbst nicht mitzählt —
„alle Audionotizen sammeln" in BioShock etwa. Dafür gibt es jetzt **eigene
Einträge**: frei geschriebene Notizen, die in derselben Liste stehen wie die
angehakten Achievements.

Der entscheidende Unterschied: **Eine eigene Notiz verschwindet nie von
selbst.** Ob sie erledigt ist, weiß nur derjenige, der sie geschrieben hat.
Sie bleibt über beliebig viele Spielstarts stehen, bis man sie von Hand
entfernt. Angehakte Achievements verschwinden dagegen weiterhin automatisch,
sobald sie errungen sind.

Zu schreiben unten in der Übersicht (`Strg+Umschalt+A`), zu entfernen über
das ✕ daneben.

### Erledigtes leuchtet grün auf

Wird ein Achievement errungen, das auf der Merkliste steht, umrandet sich der
Eintrag grün, leuchtet kurz, und fällt dann zusammen. Es ist der einzige
Moment, in dem die Merkliste Aufmerksamkeit verlangen darf — man hat gerade
geschafft, was da stand.

### Das Tastenkürzel steht jetzt im Status-Abzeichen

Unter Spielname und Fortschritt steht nun `Strg+Umschalt+A · Achievements`.
Das Abzeichen erscheint in der Vorgabe-Betriebsart genau dann, wenn Steams
Overlay offen ist — also im selben Moment, in dem die Übersicht bedienbar
wäre. Ein Hinweis, den man dauerhaft im Bild hätte, wäre nach dem dritten Mal
nur noch im Weg.

### Zur Speicherung — was ohnehin schon galt

Die Merkliste liegt in `~/.trophaenschrank/merkliste.json`, also **außerhalb**
des Programmordners. Sie übersteht damit Updates und das Deinstallieren, und
sie kann nicht versehentlich in ein Repository geraten. Das Dateiformat wurde
für die eigenen Einträge erweitert; bestehende Listen im alten Format werden
beim Lesen übernommen statt verworfen.


### Achievement-Übersicht, Vorschau beim Spielstart, Merkliste

**Übersicht** — alle Achievements des laufenden Spiels, mit Suche und Filter
(Offen / Erreicht / Alle), seltenste zuerst. Zu öffnen über `Strg+Umschalt+A`,
über das Tray-Menü, und automatisch, sobald Steams Overlay erkannt wird.

Eine Anmerkung dazu, die wichtig ist: **In Steams Overlay hineinzeichnen kann
diese App nicht.** Steam injiziert es direkt in die Grafikausgabe des Spiels;
von außen kommt man da nicht heran. Unser eigenes Fenster liegt aber darüber,
und während Steams Overlay offen ist, gibt es ohnehin einen Mauszeiger — genau
dann ist die Übersicht bedienbar. Das Tastenkürzel ist der verlässliche Weg,
weil die Erkennung von Steams Overlay auf Formulierungen in einer Logdatei
beruht, die Valve jederzeit ändern kann.

**Vorschau beim Spielstart** — die Achievements ziehen einmal quer durch,
Offene zuerst, Erreichte abgeblendet. Bewusst verzögert (Vorgabe 25 Sekunden):
Viele Spiele zeigen nach dem Start noch Logos und Ladebildschirme, und was
währenddessen läuft, sieht niemand. Dauer, Verzögerung und ob nur Offene
gezeigt werden, sind einstellbar.

**Merkliste** — in der Übersicht Achievements anhaken, sie bleiben oben links
eingeblendet, solange das Spiel läuft. Wird eines davon errungen, leuchtet der
Eintrag kurz grün auf und verschwindet. Höchstens zwölf gleichzeitig, sonst
verdeckt die Liste das Spiel. Größe getrennt einstellbar.

Der Mausfang des Overlays wird nur eingeschaltet, solange die Übersicht offen
ist — sonst läge das bildschirmfüllende Fenster dem Spiel dauerhaft im Weg.
Ein Klick daneben oder Escape schließt sie wieder.


### Das Dashboard lädt nicht mehr alles neu

Beim Öffnen wurden im Hintergrund ausnahmslos alle Spiele neu abgefragt — bei
einer gewachsenen Bibliothek mehrere hundert Anfragen, jedes Mal, obwohl die
XP-Berechnung Minuten vorher dieselben Daten schon geholt hatte.

Dieselbe Überlegung wie beim Start greift auch hier: **Achievements bekommt
man nur durch Spielen.** Hat sich die Spielzeit eines Titels seit dem letzten
Besuch nicht geändert, kann sich sein Fortschritt nicht geändert haben. Die
Spielzeit steht in der Bibliotheksliste, die ohnehin geholt wird — dieser eine
Aufruf genügt also, um zu wissen, was neu zu laden ist. Bei unveränderter
Bibliothek kostet das Öffnen jetzt **genau eine Anfrage**.

Dazu zwei Ursachen auf der Serverseite:

- **Der Spielerstand wurde überhaupt nicht zwischengespeichert.** Diese
  Abfrage lief bei jedem Aufruf erneut. Sie wird jetzt zehn Minuten gemerkt;
  die Achievement-Erkennung umgeht den Speicher ausdrücklich, damit sie
  weiterhin sofort sieht, was neu ist.
- **Das angereicherte Ergebnis wurde nur acht Sekunden gemerkt** — bis die
  letzte Kachel geladen war, galt die erste längst nicht mehr. Jetzt fünf
  Minuten.

Große, kurzlebige Einträge landen dabei bewusst nicht mehr auf der Platte: Sie
würden die Zwischenspeicher-Datei vervielfachen, die bei jedem Start
vollständig gelesen wird.

### Behoben: Dashboard und Overlay zeigten verschiedene Level

Die Stufenfaktoren lagen an einer vierten, bis dahin unbekannten Stelle
(`frontend/src/lib/tiers.js`) — dort heißen sie `xpMultiplier` und stecken in
einem Objekt zusammen mit Farben, weshalb sie bei der Umstellung der XP-Kurve
übersehen wurden. Das Dashboard rechnete seitdem mit den alten Faktoren.
Behoben, und ein Test vergleicht jetzt auch diese Kopie.


### Aussichtslose Versuche werden nicht mehr endlos wiederholt

Bei einem zurückgezogenen Steam-Schlüssel stand im Protokoll immer wieder
`XP-Berechnung fehlgeschlagen: Request failed with status code 401` — und
jede dieser Zeilen war eine weitere sinnlose Anfrage an Steam. Daraus ging
weder die Ursache hervor noch, was zu tun wäre, noch dass Warten zwecklos ist.

- Ein 401 oder 403 heißt: mit diesem Schlüssel geht es nicht, und daran
  ändert sich durch Wiederholen nichts. Die App hört jetzt auf zu fragen und
  schreibt **einmal** hin, was los ist und wo man es behebt.
- Vorübergehende Probleme (kein Netz, Serverfehler bei Steam) werden weiterhin
  wiederholt — aber frühestens nach einer Minute statt im Sekundentakt.
- Der Ladebalken bleibt in diesem Fall nicht ewig hängen, sondern sagt, dass
  es nicht geklappt hat. Ein hängender Balken ist schlimmer als gar keiner.
- Im Tray steht dann "Steam-Schlüssel abgelehnt — unter Einstellungen neu
  eintragen".

Außerdem: Wird der Schlüssel über die Einstellungen geändert, wird jetzt wie
im Tray-Menü zum Neustart aufgefordert. Ohne den Hinweis trägt man einen
gültigen Schlüssel ein und wundert sich, dass weiterhin nichts geht — das
Backend bekommt ihn erst beim Starten mit.


### Einstellungen — und ein aufgeräumtes Tray-Menü

Das Menü hinter dem Tray-Symbol war auf siebzehn Einträge angewachsen und
mischte Tägliches mit Werkzeugen, die man einmal im Leben braucht. Gleichzeitig
ließen sich Größe, Position oder Lautstärke überhaupt nicht einstellen — sie
standen fest im Code oder in einer `.env`, an die niemand herankommt.

**Neu: ein Einstellungsfenster** in der Farbsprache der App. Darin:

- **Bildschirm** — auf welchem Monitor die Meldungen erscheinen
- **Position** — alle vier Ecken, als anklickbare Miniatur statt als Liste.
  Die Meldungen fliegen entsprechend von links oder rechts ein, und bei einer
  unteren Ecke stapeln sie sich nach oben statt nach unten.
- **Größe** — 60 bis 160 Prozent
- **Anzeigedauer** — getrennt für Trophäen- und Spielstart-Meldung
- **Lautstärke** — ganz nach links bedeutet stumm
- **Eigener Ton** — MP3, WAV, OGG oder M4A statt des eingebauten Klangs.
  Fehlt die Datei später, klingt wieder der eingebaute Ton, statt dass eine
  Freischaltung stumm bleibt.
- **Status-Abzeichen** — Betriebsart wie bisher, nur erreichbar
- **Steam-Schlüssel** — öffnet das Einrichtungsfenster

Alles wirkt sofort, ohne Neustart und ohne Speichern-Knopf. Bei Einstellungen,
deren Wirkung man sehen will, ist "erst einstellen, dann speichern, dann
ausprobieren" ein unnötiger Umweg — die Testmeldung sitzt gleich daneben.

**Das Tray-Menü** enthält jetzt nur noch, was man im Vorbeigehen anklickt.
Alles zur Fehlersuche liegt unter "Diagnose": Protokoll, Schlüsselprüfung,
lokale Erkennung, Aufzeichnung.

Kaputte oder von Hand verfälschte Werte werden abgefangen, statt die Anzeige
zu zerlegen: Eine Größe von 0 machte das Overlay unsichtbar, eine Anzeigedauer
von 0 ließ Meldungen nie erscheinen — beides wäre von außen kaum als Ursache
zu erkennen gewesen.


### Kein Warten mehr beim Start

Beim Start stand minutenlang "Trophäen werden gezählt" mit einem grauen
Balken, der sich nicht bewegte. Drei Ursachen, alle behoben:

- **Der zuletzt berechnete Stand wird jetzt sofort angezeigt.** Er wird
  langfristig gemerkt; die Neuberechnung läuft still im Hintergrund und
  ersetzt ihn, wenn sie fertig ist. Damit ist das Level unmittelbar da und
  XP-Meldungen funktionieren ab der ersten Sekunde. Es gibt in diesem Fall
  gar keinen Ladebalken mehr, weil es nichts zu warten gibt.
- **Ein Spiel, dessen Spielzeit sich nicht geändert hat, wird nicht mehr
  abgefragt.** Trophäen bekommt man nur durch Spielen - die Abfrage war reine
  Verschwendung. An einer echten Bibliothek mit 488 gespielten Titeln: statt
  976 Steam-Abfragen beim zweiten Start nur noch drei.
- **Die weltweiten Prozentsätze werden nur noch geholt, wo etwas
  freigeschaltet ist.** Bei der Hälfte der Bibliothek war diese Abfrage
  umsonst; der erste, kalte Durchlauf braucht dadurch rund ein Viertel
  weniger Abfragen.

Muss doch einmal gewartet werden (allererster Start), zeigt der Balken jetzt
den echten Fortschritt. Solange noch gar nicht feststeht, wie viele Spiele zu
prüfen sind, wandert ein Schimmer über den Balken, statt ihn bei starren 0 %
stehen zu lassen - das sah nach einem Absturz aus, obwohl gearbeitet wurde.


### Erststart auf einem fremden Rechner

Eine frisch installierte App war für jeden unbenutzbar, der sie nicht selbst
gebaut hat. Es fehlte der persönliche Steam-Schlüssel, es entstand keine
Konfigurationsdatei, und die Fehlermeldung verwies auf `overlay\.env` - eine
Datei, die es in einer installierten Fassung gar nicht gibt. Damit war die App
nicht weitergebbar.

- Beim ersten Start entsteht jetzt `~/.trophaenschrank/config.env` mit
  erklärendem Text und einem erkennbaren Platzhalter für den Schlüssel.
- Das Sitzungsgeheimnis wird dabei zufällig erzeugt. Der Steam-Schlüssel ist
  damit der einzige Handgriff, der bleibt.
- Fehlt er, führt ein Dialog beim Start durch die Einrichtung: ein Knopf
  öffnet Steams Schlüsselseite, einer die Konfigurationsdatei.
- Alle Fehlermeldungen nennen jetzt den tatsächlichen Pfad.

Eine bereits vorhandene Konfiguration wird dabei nie überschrieben - dafür
gibt es einen eigenen Test.


### XP fühlt sich jetzt nach etwas an

Der Fortschrittsbalken bewegte sich bei einer gewachsenen Sammlung praktisch
nicht mehr. Zwei unabhängige Ursachen, beide behoben:

- **Die Levelkurve stieg zu steil** (`90 × Level^1.55`). Nachgemessen an einer
  echten Sammlung mit 2.177 Trophäen: Eine Levelstufe kostete dort 15.752 XP,
  eine mittlere Silbertrophäe brachte 154 - ein Prozent. Und je weiter jemand
  kam, desto schlimmer wurde es. Jetzt `400 × Level^0.7`: Die Kosten steigen
  weiter, aber langsam genug, dass eine Trophäe sichtbar bleibt.
- **Der Balken wurde auf ganze Prozent gerundet.** 8,91 % und 9,29 % ergeben
  beide 9 - die Animation lief von 9 % nach 9 %. Bei kleinen Zuwächsen stand
  der Balken deshalb nicht nur fast, sondern vollständig still.

Dazu sind die Stufenfaktoren stärker gespreizt (Kupfer 1, Silber 2,5, Gold 4,
Platin 6 statt 1/2/3/4) - Kupfer bleibt der Grundwert, seltene Trophäen lohnen
sich deutlicher.

Wirkung an derselben Sammlung: Level 28 → 52, und der Balken bewegt sich je
Trophäe rund dreimal so weit (Silber 0,98 % → 3,02 %, Platin 2,48 % → 9,20 %).
Bestehende Level steigen dadurch einmalig an - es geht nichts verloren.

Die Stufenfaktoren lagen an drei Stellen im Code; eine davon
(`profileBuilder.js`, für Freundesprofile) wurde beim Ändern prompt übersehen.
Sie bezieht die Werte jetzt aus der einen maßgeblichen Quelle, und neue Tests
vergleichen die verbliebenen Kopien miteinander.

### Korrekturen vor der ersten Fassung

- **Update-Quelle zeigte ins Leere.** In `overlay/package.json` stand unter
  `build.publish` noch der Platzhalter `DEIN_GITHUB_NAME` mit einem Repo, das
  es nicht gibt. Die App hätte nie ein Update gefunden und den Fehlschlag nur
  still ins Protokoll geschrieben. Zeigt jetzt auf
  `Exotul/Steam-Achievement-Overlay`.
- **Bit 31 im lokalen Bitfeld wurde verschluckt.** Ein Zahlenwert mit
  gesetztem obersten Bit kommt als negative Zahl aus dem Parser; die Rechnung
  mit `Math.abs()` war dafür falsch. Betraf Spiele mit 32 oder mehr
  Achievements in einer Statistik: Die Selbstprüfung hätte die Datei
  abgelehnt und die App wäre stumm auf den langsamen Weg zurückgefallen.
- **Der Test der doppelten Level-Kurve lief unter Windows nie durch.**
  `import()` bekam einen absoluten Pfad und hielt `e:` für ein Protokoll -
  damit war ausgerechnet die Prüfung wirkungslos, die Overlay und Dashboard
  auf derselben Kurve hält.
- Fehlgeschlagener Steam-Login leitete auf `/login-failed` statt
  `/auth/login-failed` und landete dadurch auf der Dashboard-Startseite.
- Drei neue Tests für die Bitauswertung.

## 1.0.0

Erste Fassung mit Installer und automatischen Updates.

### Erkennung von Achievements

- Lokale Erkennung über Steams eigenen Achievement-Zwischenspeicher
  (`appcache/stats`), dadurch Meldungen praktisch zeitgleich mit Steam
- Selbstprüfung des Parsers gegen den von Steam bestätigten Stand - ein falsch
  gelesenes Format kann keine Fehlalarme auslösen
- Web-API als Rückfallebene, mit getrennten Abfrageintervallen für Spielstatus
  und Achievements

### Anzeige

- Meldungen oben rechts, von außerhalb des Bildschirms einfliegend
- Logo in der Farbe der jeweiligen Trophäenstufe, mit gezeichnetem Umriss
- Vier Stufen mit abgestufter Animation, Diamant-Feier bei vollständigem Spiel
- Spielstart-Meldung mit Fortschritt, geschätzter Schwierigkeit und
  Komplettierungszeit
- XP-Meldung nach jedem Achievement, mit eigener Animation beim Levelaufstieg
- Status-Abzeichen unten rechts während Steams Overlay

### Dashboard

- Spielebibliothek im Steam-Stil mit Suche, Sortierung und Schwierigkeit
- Profil mit Level, Trophäenstufen und seltensten Trophäen
- Freunde-Reiter mit Level je Person und vollständiger Profilansicht

### Technik

- Zentrale Warteschlange für alle Steam-Aufrufe mit Vorrang für die
  Achievement-Erkennung
- Eingeschränkter Betrieb bei Steam-Ausfall statt Stillstand
- Protokoll mit Steam-Antwortzeiten, sensible Daten werden entfernt
- Dauerhafte Ablage für Anmeldung, Zwischenspeicher und Verlauf
- 54 automatische Tests, unter anderem gegen echte Steam-Dateien
