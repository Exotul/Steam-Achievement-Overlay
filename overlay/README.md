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
echten Steam-Login. Danach schließt es sich automatisch, und das Menü
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

**Falls die Erkennung bei dir nicht greift:** *Einstellungen → Diagnose* -> "Lokale Erkennung
prüfen…" listet unter "Status-Abzeichen" die Zeilen auf, die aus Steams
Protokoll nicht zugeordnet werden konnten. Damit lässt sich die Erkennung
gezielt anpassen, statt zu raten.

## XP-Leiste und Level

Gut eine Sekunde nach der Achievement-Meldung schiebt sich unter ihr eine
Leiste hervor, mit dem XP-Zuwachs, dem aktuellen Level und einem Balken, der
sichtbar weiterwächst. Sie sitzt auf der Seite zur Bildschirmmitte, bei einer
unteren Ecke also über der Meldung, bei einer oberen darunter. Ihr Rand hat die
Farbe der Stufe, und beide verschwinden gemeinsam. Bei Blutig kommt die Leiste
erst nach 2,7 s, wenn der Totenkopf fertig und der Klang durch ist.

Beim Levelaufstieg läuft der Balken zuerst voll, die Leiste leuchtet kurz auf,
die Levelzahl springt, Funken fliegen und eine aufsteigende Tonfolge spielt.
Danach beginnt der Balken von vorn.

**Der XP-Stand wird nur EINMAL beim Start der App ermittelt.** Danach schreibt
die App ihn selbst fort: Der Zuwachs eines Achievements ist eine bekannte
Größe (das Backend liefert die XP je Achievement fertig mit) und muss nicht bei Steam erfragt
werden. Die ganze Bibliothek bei jedem Achievement neu durchzugehen wäre
verschwendete Zeit und würde die Achievement-Erkennung ausbremsen.

Während der einmaligen Berechnung erscheint ein Ladebalken mit dem Fortschritt
("45 / 210 Spiele"). Das Ergebnis wird 12 Stunden zwischengespeichert und
übersteht Neustarts, sodass der Balken meist gar nicht erst auftaucht.

## Meldungen im Stream (OBS)

Einzuschalten unter *Einstellungen → Stream & OBS*. Jede freigeschaltete Trophäe geht dann
zusätzlich an ein Overlay-Programm, das sie im Stream zeigt.

**Warum nicht einfach die Meldung abfilmen:** Das Overlay liegt über dem Spiel. Wer es in den Stream
holen will, müsste den ganzen Bildschirm abgreifen – samt Taskleiste, Mauszeiger und allem, was sonst
noch aufpoppt. Stattdessen geht nur das Ereignis als Text hinaus (`POST` mit Name, Stufe, Prozent,
XP), und das Overlay-Programm zeichnet es in seinem eigenen Stil und an seiner eigenen Stelle.

**Bewusst einseitig:** Die App schickt und vergisst. Läuft das Overlay nicht, antwortet es nicht oder
ist der Rechner weg, läuft die Achievement-Erkennung unbeirrt weiter – nach zwei Sekunden bricht der
Versuch ab, und im Protokoll steht eine Notiz. Ein Spiel wartet auf kein Stream-Programm.

Geschickt werden drei Arten: `achievement` (mit Stufe, Seltenheit, XP), `level` beim Aufstieg und
`diamant`, wenn ein Spiel vollständig ist. Der Knopf **Testmeldung senden** probiert die ganze Kette
und sagt im Klartext, woran es liegt – unbrauchbare Adresse, keine Antwort oder angekommen.

Das Gegenstück liegt im Overlay-Projekt (`E:\Pokemon_OBS_overlay`): Browserquelle `/trophaeen`,
Einstellungen im Steuerpult unter *Trophäen* — dort wird auch eingestellt, **wo genau** im Bild die
Meldung erscheint (frei ziehbar, nicht nur vier Ecken), wie lange sie steht und ab welcher Stufe.

## Spieleschrank auf einem zweiten Bildschirm

Zeigt die Bibliothek als Regal: ein unregelmäßiges Raster aus Fächern, darin
die Spiele als Packungen mit sichtbarem Rücken. Fährt die Maus darüber, rutscht
eine Packung heraus und klappt zu ihrem Titelbild auf. Einzuschalten in den
Einstellungen unter *Spieleschrank*, samt Auswahl des Bildschirms.

**Die Fächer sind die Steam-Sammlungen des Anwenders.** Steam legt sie als
lesbare JSON-Datei im Benutzerordner ab:

```
<Steam>/userdata/<Kontonummer>/config/cloudstorage/cloud-storage-namespace-1.json
```

Das ist der lokale Spiegel der Steam-Cloud und damit auch dann aktuell, wenn die
Sammlungen an einem anderen Rechner angelegt wurden. Der Weg kostet **keine
einzige Steam-Abfrage**. Die Alternative wären die Genres aus dem Store gewesen:
scharf gedrosselt (rund 200 Anfragen je 5 Minuten), grob ("Action, Indie") — und
"Horror" ist dort überhaupt kein Genre, sondern ein Nutzer-Schlagwort.

**Die Breite eines Fachs folgt seiner Spielzahl**, und es zeigt immer ALLE
Spiele. Das Regal besteht aus Zeilen gleicher Höhe; je Zeile ergibt sich
daraus, wie viele Böden ein Fach übereinander hat. Die Breite ist dann
`(Spiele / Böden) × Rückenbreite`, und zum Schluss wird jede Zeile genau auf
die Regalbreite gestreckt. Gesucht wird die Aufteilung mit den breitesten
Rücken, in die alles passt.

Ein Zellenraster hatte das nicht hergegeben: Jedes Fach muss dort ganze Zellen
belegen, sieben Spiele in einer Zelle für 24 verschenken zwei Drittel der
Fläche, und bei 31 Fächern blieben nur noch 7 px breite Rücken übrig.

**Jedes Spiel steht genau einmal im Regal**, und zwar in der *kleinsten*
Sammlung, die es enthält: "Fallout" ist die genauere Aussage als "RPG". Was in
Steam versteckt ist, bleibt draußen; Sammlungen mit Namen wie "Programme" oder
"Tools" ebenfalls. Favoriten bekommen kein eigenes Fach, sondern einen Punkt auf
dem Rücken. Fächer mit weniger als drei Spielen werden zu "Verschiedenes"
zusammengelegt, Spiele ohne Sammlung landen in "Unsortiert". An einer echten
Bibliothek: 36 Sammlungen, 609 von 622 Spielen, 31 Fächer.

**Die Rückenfarbe** kommt aus dem Titelbild — nicht der Durchschnitt (der ist
bei jedem Bild ein mattes Braungrau), sondern die kräftigste Farbe, abgedunkelt,
damit heller Text darauf lesbar bleibt. Gefundene Farben werden in
`~/.trophaenschrank/schrank-farben.json` gemerkt: Nur der allererste Start lädt
Bilder, danach keines mehr. Das Titelbild selbst kommt erst, wenn der Zeiger
eine Packung herauszieht.

Der Schrank reicht bis an alle Bildschirmränder; der gewonnene Platz geht an
die Fächer, die dadurch zwei Böden übereinander bekommen.

**Drei Fächer gehören nicht der Bibliothek:** das eigene Level mit XP-Balken,
das gerade laufende Spiel mit seinem Achievement-Fortschritt und das Fach
„Deine Trophäen" mit den fünf Stufen samt Diamanten. Diese Zahlen
fallen in der Levelberechnung ohnehin an (sie geht durch jede einzelne Trophäe)
und werden dort mitgezählt; sie getrennt zu erheben hieße, die ganze Bibliothek
erneut abzufragen.

### Aussehen: Holz, Wand, Rücken, Schrift

Einzustellen unter *Einstellungen → Aussehen des Schranks*.

**Eine Holzfarbe, vier Töne.** Aus der gewählten Farbe entstehen Lichtkante,
Fläche, Schattenseite und Innenraum. Vier einzelne Regler wären vier Farben,
die man aufeinander abstimmen müsste, um ein Regal zu bekommen, das nach Holz
aussieht. Aufgehellt wird dabei gegen *Weiß*, nicht über eine Multiplikation:
Ein dunkles Braun mal 1,3 bleibt dunkles Braun, weil alle drei Kanäle gleich
wachsen — erst das Mischen gegen Weiß ergibt die Lichtkante, die ein Brett hat.

**Die Farbe der Spielrücken** kommt wahlweise

- *aus dem Titelbild* (die Vorgabe): die kräftigste Farbe des Covers,
- *nach Sammlung*: jedes Fach in einem Ton — so sieht man auf einen Blick, wo
  ein Fach anfängt und aufhört,
- *fest je Spiel*: ein Ton aus der Spielnummer.

„Fest" und „nach Sammlung" heißen ausdrücklich **nicht** „jedes Mal anders":
Dieselbe Sammlung und dasselbe Spiel bekommen immer denselben Ton, auch nach
einem Neustart und auf einem anderen Rechner. Ein Regal, das sich bei jedem
Start umfärbt, wäre unruhig.

Die Töne je Sammlung leiten sich aus dem Namen ab und lassen sich einzeln
überschreiben. (Dass „Horror" dabei von sich aus ein Violett ergibt, ist
Zufall — aber ein hübscher.) Aufgelöst werden sie im Hauptprozess und fertig
hineingereicht; dieselbe Formel ein zweites Mal im Schrankfenster wäre eine
zweite Stelle, die auseinanderlaufen kann — und dann färbten
Einstellungsfenster und Schrank unterschiedlich.

**Farbwerte landen in einem Stylesheet.** Deshalb werden sie streng geprüft:
Was nicht wie eine Farbe aussieht (`url(…)`, `expression(…)`, ein Semikolon),
kommt gar nicht erst an — auch dann nicht, wenn es jemand von Hand in die
Einstellungsdatei schreibt.

### Hervorhebungen: nie gespielt und Diamant

Drei Schalter, einzeln und zusammen verwendbar:

- **Nie gespielte mit Rahmen** — ein oranger Strich um den Rücken. Als
  `inset`-Schatten, nicht als `border`: Ein Rahmen würde die Packung zwei
  Pixel breiter machen, und bei 10 px Rückenbreite verschiebt das eine ganze
  Regalzeile.
- **Nie gespielte orange färben** — gleich der ganze Rücken. Das Orange ist
  gedämpft, nicht leuchtend: Bei 243 nie gespielten Titeln in dieser
  Bibliothek wäre ein kräftiges Orange die halbe Regalwand.
- **Diamanten hervorheben** — die Diamantfarbe plus ein kurzes Aufblitzen.

„Nie gespielt" heißt dabei: **keine Spielzeit und kein Datum**. Nur auf die
Stunden zu sehen wäre falsch — bei alten Titeln liefert Steam ein Datum, aber
keine gezählten Stunden (gezählt wird erst seit 2009). In dieser Bibliothek
stand deshalb an ein und demselben Spiel „noch nie gespielt · zuletzt November
2015". Dieselbe Regel gilt in der Anzeige beim Darüberfahren.

„Diamant" heißt: alle Achievements erreicht, **und es muss welche geben** — ein
Spiel ganz ohne Achievement-System hätte sonst „alle" und strahlte, obwohl es
dort nichts zu holen gibt. Ist der Stand noch unbekannt, gibt es keine
Auszeichnung: lieber keine als eine falsche.

**Warum das Aufblitzen und keine Dauerbewegung.** Nachgemessen am laufenden
Programm, Leerlauf, ganze App, fünf Diamanten unter 630 Packungen:

| | CPU |
|---|---|
| ohne Auszeichnung | 0,02 % |
| Streifen, der dauerhaft über den Rücken fährt | **3,5 %** (0,42 Kerne) |
| Aufblitzen im Rücken, alle 9 s | 1,00 % |
| Aufblitzen auf der Packung, alle 9 s | 0,71 % |
| Aufblitzen auf der Packung, alle 20 s (so wie jetzt) | **0,20 %** |

Zwei Erkenntnisse daraus, beide gegen die erste Vermutung:

1. **Der Schimmer selbst ist nicht teuer.** Teuer ist, dass überhaupt etwas
   animiert wird: Solange eine Animation läuft, setzt die Grafik das ganze
   4K-Bild Bild für Bild neu zusammen — egal, wie klein die Änderung ist.
   Deshalb bringt der Takt mehr als jede Feinarbeit am Effekt.
2. **Die eigene Ebene hilft trotzdem.** Der Schimmer sitzt auf der *Packung*,
   nicht im Rücken: Der Rücken beschneidet seinen Inhalt (`overflow: hidden`,
   abgerundete Ecken), und was darin liegt, bekommt keine eigene Ebene. Das
   allein waren 1,00 % gegen 0,71 %.

Also selten und kurz: 0,95 Sekunden alle 20. Das ist nebenbei auch das
schönere Bild — ein Glanz, der ohne Unterlass auf und ab fährt, wirkt wie ein
Blinklicht. Während ein Spiel läuft, blitzt gar nichts.

**Und eine Entdeckung am Rande:** Chromium drosselt Fenster, die es für
verdeckt hält — und hinter den Desktop-Symbolen ist der Schrank so verdeckt,
wie ein Fenster nur sein kann. Dasselbe Element, dreimal drei Sekunden lang
beobachtet:

| Fenster | verschiedene Werte |
|---|---|
| gewöhnlich, Drosselung an | 4 — läuft |
| im Hintergrund, Drosselung an | 2 — **steht still** |
| im Hintergrund, Drosselung aus | 5 — läuft |

Ohne `backgroundThrottling: false` stünde die Animation also genau dort still,
wo der Schrank hingehört. Es betrifft nicht nur den Glanz: Auch das
Herausziehen wird per `requestAnimationFrame` berechnet, und gedrosselt läuft
das nur noch einmal je Sekunde. Das Abschalten selbst kostet nichts
(nachgemessen: 0,01 % mit wie ohne).

**Schriftart:** nur solche, die Windows ohnehin mitbringt. Das Projekt liefert
keine Schriftdateien mit, und eine Schrift aus dem Netz nachzuladen hieße, dass
der Schrank beim Start kurz anders aussieht.

Holz, Wand, Verlauf und Schrift sind CSS-Variablen und wirken **ohne
Neuaufbau** — wer am Regler dreht, sieht die Farbe wandern, statt 611 Packungen
neu entstehen zu sehen. Nur eine andere Herkunft der Rückenfarbe baut das
Regal neu, weil die Farbe in jeder einzelnen Packung steckt.

### Wann der Schrank gar nicht erst aufgeht

**Ohne passenden Bildschirm bleibt er zu.** „Automatisch" heißt: ein anderer
als der, auf dem die Meldungen erscheinen. Gibt es keinen — zweiter Monitor
aus —, dann steht kein Schrank. Vorher wich er auf den Hauptbildschirm aus und
lag dort hinter Browser, Discord und Spielfenster: unsichtbar, aber er
rechnete mit, zog Packungen heraus und lud Titelbilder. Ein Hintergrundbild,
das niemand zu sehen bekommt, soll gar nicht erst aufgebaut werden.

Wer ihn ausdrücklich auf dem Hauptbildschirm will, wählt ihn in den
Einstellungen — eine ausdrückliche Wahl wird befolgt. Verschwindet dieser
Bildschirm, wird *nicht* ausgewichen; kommt er zurück, steht der Schrank
wieder da (die Entscheidung in `lib/schrankBildschirm.js`).

**Und nur dort, wo er zu sehen ist.** Liegt ein Fenster über ihm, zieht er
keine Packungen mehr heraus und lädt keine Titelbilder — Arbeit, die niemand
sieht. Gefragt wird derselbe Helfer wie beim Klickfänger (siehe unten); die
Antwort wird gemerkt und nebenher aufgefrischt, damit der Zeigertakt auf nichts
warten muss. Kommt keine Antwort, bleibt es beim alten Verhalten: Ein Schrank,
der auf einem Rechner ohne PowerShell stumm wäre, wäre schlechter als einer,
der einmal zu viel reagiert.

### Zwei Fächer, die dieselben Spiele noch einmal zeigen

**„Fast geschafft"** und **„Zuletzt gespielt"** sind keine Sammlungen, sondern
Blickwinkel auf dieselbe Bibliothek. Die Spiele darin stehen deshalb
*zusätzlich* in ihrem Sammlungsfach, nicht statt dessen — ein Spiel aus seinem
Genre zu nehmen, weil es gerade fast fertig ist, wäre eine Umräumaktion hinter
dem Rücken des Anwenders. Erkennbar sind sie am grünen Schild; in der Gesamtzahl
unten rechts zählen sie nicht mit.

- **Fast geschafft:** Spiele, denen nur noch wenige Trophäen zum Diamanten
  fehlen. Zwei Bedingungen zusammen: wenige fehlen **und** mindestens die Hälfte
  ist geschafft. Nur die Zahl der fehlenden zu nehmen ging nicht — an echten
  Daten stand dann ein Spiel mit 1 von 5 Achievements im Fach. Die Grenze rückt
  in Stufen (2 → 5 → 12 fehlende), bis mindestens drei Spiele zusammenkommen:
  Ein leeres Fach sähe aus wie ein Fehler, nicht wie eine Aussage.
- **Zuletzt gespielt:** die letzten zwölf Titel, in der Reihenfolge, die Steam
  selbst liefert (`rtime_last_played` aus `GetOwnedGames` — kostet keine
  zusätzliche Abfrage).

Die Achievement-Zahlen je Spiel kommen aus dem Zwischenspeicher der
XP-Berechnung. Sie fallen dort ohnehin an, weil die Berechnung durch jede
einzelne Trophäe geht; sie getrennt zu erheben hieße, die ganze Bibliothek
erneut bei Steam abzufragen.

### „Es fehlen noch 3" — und welche

Bleibt der Zeiger einen Moment auf einer Packung stehen (0,7 s), erscheint über
der Namenszeile, **welche** Trophäen noch fehlen — bis zu sechs, die häufigste
zuerst, mit ihrem weltweiten Anteil. Das ist die, die am ehesten zu schaffen
ist.

Erst auf Nachfrage, und nur dort, wo wirklich etwas offen ist: Für alle 611
Spiele auf Vorrat wären es drei Steam-Abfragen je Spiel (Spielerstand, Schema,
weltweite Anteile). So ist es eine Anfrage für genau das Spiel, auf das man
schaut; einmal geholte Listen bleiben für die Sitzung gemerkt, und das Backend
merkt sich die Steam-Antworten ohnehin.

### Rechtsklick: alle Achievements eines Spiels

Rechtsklick auf eine herausgezogene Packung öffnet ein Fenster mit **allen**
Achievements des Spiels — anders als die Anzeige beim Verweilen, die bis zu
sechs nennt. Offene zuerst, darin die häufigsten oben: Das ist die Reihenfolge,
in der man sie sich vornehmen würde. Darunter die erreichten, die seltensten
zuerst — dort ist es eine Trophäenwand, keine Arbeitsliste.

Zwei Auflagen, beide ausdrücklich gewünscht:

- **Es liegt nicht über anderen Fenstern.** Kein `alwaysOnTop` — anders als
  der Klickfänger, der genau deshalb einmal Fremdklicks geschluckt hat. Das
  Fenster verhält sich wie jedes andere: Es geht auf, man klickt es weg, dann
  ist es weg (Esc oder ein Klick daneben).
- **Es ragt nicht über den Bildschirmrand hinaus.** Der Schrank reicht bis an
  alle Ränder, eine Packung kann also ganz außen stehen. Die Lage rechnet
  `lib/schrankListe.js`: zuerst rechts neben die Packung, sonst links davon,
  und zum Schluss in jedem Fall in die **Arbeitsfläche** geschoben — nicht nur
  auf den Bildschirm, sonst läge der untere Rand hinter der Taskleiste.
  Geprüft an allen vier Ecken.

Solange die Liste offen ist, geht der Klickfänger nicht auf: Er liegt oben, die
Liste nicht — er würde ihr die Klicks wegnehmen.

### Ein Spiel aus dem Schrank starten

Doppelklick auf eine herausgezogene Packung startet sie über
`steam://rungameid/<appid>` — also genau so, als hätte man in der Bibliothek auf
„Spielen" geklickt.

Dass das überhaupt geht, ist nicht selbstverständlich. **Nachgemessen** an drei
gleichen Fenstern an derselben Stelle:

| Fenster | Mausbewegungen | Klicks |
|---|---|---|
| gewöhnlich | 7 | 1 |
| wie der Schrank (`focusable: false`) | 7 | 1 |
| Schrank im Hintergrundmodus | 1 | **0** |

Hinter den Desktop-Symbolen kommen also Bewegungen an, Klicks nicht. Deshalb
legt der Hauptprozess ein **winziges, unsichtbares Fenster** genau über die
Packung, die gerade heraussteht; dort kommen Klicks an. Es wandert mit und
verschwindet, sobald der Zeiger den Schrank verlässt. Absichtlich nicht größer
als das Titelbild: Ein Fenster über dem ganzen Schrank würde sämtliche Klicks
auf den Desktop schlucken.

Zwei Feinheiten, beide nachgemessen: Die Seite braucht einen Hauch Deckkraft
(`rgba(255,255,255,0.01)`), weil Windows Klicks durch *vollständig*
durchsichtige Stellen eines geschichteten Fensters hindurchreicht — sichtbar ist
davon nichts (Helligkeit an der Stelle: 15,5 ohne, 17,4 mit Fänger). Und
solange ein Spiel läuft, geht der Fänger gar nicht erst auf: Ein neues Fenster
über einem Vollbildspiel minimiert es.

**Nur dort, wo der Schrank auch zu sehen ist.** Der Fänger liegt auf der
obersten Fensterebene — und lag damit anfangs auch über einem Browser oder
Editor, in dem gerade gearbeitet wurde. Nachgemessen, mit einem fokussierten
Arbeitsfenster darunter:

| | Doppelklick |
|---|---|
| Fänger | 1× |
| Arbeitsfenster | 0× |

Ein Doppelklick im Arbeitsfenster hat damit ein Spiel gestartet, das irgendwo
dahinter im Schrank stand. Seitdem gilt eine Regel: **Der Schrank reagiert nur
dort, wo er auch zu sehen ist.** Was unter dem Zeiger liegt, sagt Windows
(`WindowFromPoint` plus `GetAncestor`, siehe `lib/zeigerFenster.js`). Zulässig
sind nur der Desktop selbst (`Progman`, `WorkerW`, und die Symbolliste
`SHELLDLL_DefView`/`SysListView32` — sonst wäre der Schrank ausgerechnet dort
tot, wo die Symbole stehen) und unsere eigenen Fenster. Kommt keine Antwort,
geht der Fänger nicht auf: lieber kein Doppelklick-Start als geschluckte
Fremdklicks.

Gefragt wird oft — bei jeder anderen Packung und danach alle 250 ms, solange
eine heraussteht, damit ein später nach vorn geholtes Fenster den Fänger wieder
schließt. Ein PowerShell-Start je Frage (rund 200 ms) wäre dafür untauglich,
deshalb läuft ein **dauerhafter Helfer**: einmal gestartet, danach eine Antwort
je Zeile auf der Standardeingabe. Gemessen: **20 Fragen in 3 ms**.

Im Hintergrundmodus ist der Schrank ein *Kind* von `WorkerW`; unter dem Zeiger
liegt dann unser eigenes Fenster, und sein oberster Vorfahr ist der
Desktop-Hintergrund — nachgemessen: `ELTERN 66606 WorkerW | WURZEL 66606
WorkerW`. Als gewöhnliches Fenster ist es seine eigene Wurzel. Beide Fälle
greifen.

### Warum der Schrank selbst keine Mausereignisse bekommt

Das Fenster ist **nicht fokussierbar** — ein Klick darauf darf ein Spiel auf dem
anderen Monitor nicht minimieren, und im Hintergrundmodus liegt es ohnehin hinter
den Desktop-Symbolen, die alle Klicks abfangen. Deshalb meldet der Hauptprozess
dem Schrank 25-mal je Sekunde die Zeigerposition, und der rechnet selbst aus,
über welcher Packung sie steht. Wallpaper Engine macht es genauso.

### Hintergrundmodus (hinter den Desktop-Symbolen)

Windows zeichnet den Desktop-Hintergrund in einem eigenen Fenster namens
`WorkerW`. Es entsteht erst, wenn man `Progman` die undokumentierte Nachricht
`0x052C` schickt; danach gibt es ein `WorkerW`, das hinter den Symbolen liegt.
Hängt man sein eigenes Fenster dort hinein (`SetParent`), wird es zum
Hintergrundbild. Umgesetzt über PowerShell (`lib/hintergrundFenster.ps1`), damit
die App weiterhin ohne native Abhängigkeiten auskommt — denselben Weg nutzt
schon die Vollbild-Erkennung.

Nachgemessen: Elternfenster danach `WorkerW`, Fenster sichtbar, Lage exakt der
zweite Bildschirm — und in **voller Höhe**, während ein gewöhnliches Fenster um
die Taskleiste gekürzt wird.

Drei Fallen, alle mit Test abgesichert:

- `FindWindow('Progman', $null)` findet nichts. PowerShell macht aus `$null`
  einen leeren Text, und der bedeutet "Fenster **ohne** Titel" — Progman heißt
  aber "Program Manager". Richtig ist `[NullString]::Value`.
- Der Erfolg lässt sich **nicht** am Rückgabewert von `SetParent` ablesen: Das
  ist der vorherige Elternteil und bei einem Fenster ohne Eltern regulär 0. Ein
  Erfolg sähe damit aus wie ein Fehlschlag. Gefragt wird stattdessen
  `GetAncestor`.
- PowerShell schiebt beim ersten Aufruf einen Fortschrittsbericht in XML auf die
  Fehlerausgabe. Er stand *nach* der Antwort und galt als solche.

Nach dem Umhängen zählen die Koordinaten vom Hintergrundfenster, das **alle**
Bildschirme zusammen abdeckt. Wer einen Monitor links vom Hauptbildschirm stehen
hat, dessen Koordinaten sind negativ — ohne Umrechnung läge der Schrank dann
daneben.

Scheitert das Umhängen (anderes Hintergrundprogramm, abgewandelter Explorer),
bleibt der Schrank ein gewöhnliches Fenster und verdeckt die Symbole. Sichtbar
ist er in beiden Fällen.

### Was er kostet

Am 4K-Bildschirm mit 609 Spielen gemessen, über **alle** beteiligten Prozesse
(Zeichnen, Grafik, Hauptprozess — die erste Messung sah nur den Zeichenprozess
und war deshalb zu gut):

| Zustand | vorher | jetzt |
|---|---|---|
| ruhig dastehend | 0,1 % | **0,1 %** |
| Zeiger wandert über die Packungen | 12,9 % | **0,14 %** |
| erster Start (alle Farben fehlen) | — | 9 % für 4 Sekunden |

Die 12,9 % kamen daher, dass beim Herausziehen das ganze Fach **samt Regalzeile
nach vorn gehoben** wurde, damit das Titelbild nicht hinter den Nachbarn
verschwindet. Jede Mausbewegung ordnete so große Teile eines 4K-Bildes neu.
Drei Änderungen haben das beseitigt:

- Das Titelbild liegt jetzt in **einer eigenen Schicht** über dem Regal. Das
  Regal selbst wird beim Darüberfahren nicht mehr angefasst.
- Der Deckel wird **nur verschoben und skaliert** (`transform`), nicht über
  `left`/`top` gesetzt — Letzteres erzwingt jedes Mal eine neue
  Seitenberechnung samt Neuzeichnen.
- Der Schlagschatten über dem **ganzen** Schrank ist weg; der Korpus hat seinen
  eigenen.

Dazu: Die Zeigerposition wird nur **viermal je Sekunde** abgefragt, solange die
Maus woanders ist, und erst auf dem Schrank 25-mal. Beim ersten Start werden
die Rückenfarben **sechs Bilder auf einmal** ermittelt statt 609 gleichzeitig.

Läuft ein Spiel, hält der Schrank zusätzlich seine Animationen an (abschaltbar).
Arbeitsspeicher rund 370 MB — das ist im Wesentlichen die Bildfläche eines
4K-Fensters.

## Test-Achievement

*Einstellungen* -> "Testmeldung zeigen" (daneben "Diamant-Meldung zeigen"). Spielt die komplette Abfolge mit
einem erfundenen Achievement ab - Popup, Ton, XP-Meldung -, **ohne** etwas am
tatsächlichen Stand zu ändern. Gedacht zum Prüfen von Aussehen, Position und
Ton, ohne erst ein Achievement erspielen zu müssen. Bei jedem Aufruf kommt die
nächste Trophäenstufe an die Reihe, sodass sich alle fünf Stufen durchprobieren
lassen.

## Automatisch mit Windows starten

*Einstellungen → Programm* -> Schalter "Automatisch mit Windows starten". Die App trägt sich
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

### Der schnelle Weg: der Steam-Client auf diesem Rechner

Steam schreibt die laufende AppID lokal in die Registry:

```
HKCU\Software\Valve\Steam  ->  RunningAppID  (REG_DWORD, 0 = kein Spiel)
```

Das kostet **keine Steam-Abfrage**, hängt an **keiner Datenschutzeinstellung**
und ist sofort da. Abgefragt wird alle 3 Sekunden mit `reg.exe` — nachgemessen
22,7 ms je Abfrage, also billiger als die Netzanfrage, die es ersetzt.

Sobald dieser Weg einmal geantwortet hat (auch mit 0), geht die Web-Abfrage in
den Schongang: statt alle 5 Sekunden nur noch alle 30. Das sind rund **120
Anfragen je Stunde weniger**, rund um die Uhr. Sie bleibt als Rückfall und
liefert weiterhin den Spielnamen — die Registry kennt nur die Nummer, und steht
sie nicht im Zwischenspeicher, heißt das Spiel für einen Moment „App 1186",
bis die Web-Abfrage den Namen nachträgt.

Zwei Regeln, die dabei zählen (beide in `lib/steamLauf.js` und von Tests
festgehalten):

- Eine **fehlende Antwort ist kein Spielende**. Sonst beendete ein einzelner
  Fehlschlag der Abfrage mitten im Spiel die Sitzung samt Bilanz — und die
  gibt es pro Sitzung nur einmal.
- Eine **unverständliche Ausgabe wird nicht geraten**. Sonst verfolgte die App
  ein Spiel, das es nicht gibt.

Antwortet die Registry dreimal hintereinander nicht, steht das im Protokoll und
die Web-Abfrage bleibt im schnellen Takt.

### Voraussetzung für die Web-Abfrage: Steam muss das laufende Spiel veröffentlichen

Die App kann nur verfolgen, was Steam über deinen Status meldet. Steam gibt
das laufende Spiel **nicht** heraus, wenn:

- dein Online-Status auf "Unsichtbar" oder "Offline" steht (häufigste
  Ursache - "Unsichtbar" ist besonders tückisch, weil du trotzdem normal
  spielen kannst), oder
- im Profil unter Datenschutzeinstellungen die "Spieldetails" nicht auf
  "Öffentlich" stehen.

In beiden Fällen erscheinen gar keine Meldungen, weil die App nicht weiß,
welches Spiel sie beobachten soll. *Einstellungen → Diagnose* -> "Lokale Erkennung prüfen…"
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

**„Noch nichts freigeschaltet" ist ein Ergebnis, kein Fehler.** Das war lange
anders und hat die Hälfte der Bibliothek vom schnellen Weg ausgeschlossen. Bei
einem frisch begonnenen Spiel schreibt Steam eine gültige, aber leere
Statusdatei — 38 Bytes:

```
00 "cache" 00  02 "crc" 00 00000000  02 "PendingChanges" 00 00000000  08 08
```

Tadelloses KeyValues, nur ohne einen einzigen Statistikeintrag. Das galt als
„nicht lesbar", also blieb es bei der Web-API — und zwar dauerhaft, denn
geprüft wird nur zu Spielbeginn. Ausgerechnet dort, wo noch jede Trophäe
aussteht, war der schnelle Weg damit gesperrt. Auf einem echten Rechner
nachgezählt:

| Spiele mit Schema-Datei | 549 |
|---|---|
| mit Freischaltungen (ging schon immer) | 256 |
| gültig, aber noch leer (galt als unlesbar) | **274** |
| wirklich nicht lesbar | 19 |

Erkannt wird so eine Datei am Kopf, den jede Statusdatei hat (`cache` mit
`crc`). Gefährlich ist das nicht: Das Ergebnis geht anschließend durch dieselbe
Selbstprüfung wie jedes andere. Eine Datei, die fälschlich „leer" gelesen wird,
obwohl Steam Freischaltungen meldet, fällt genau dort durch.

**Status prüfen:** *Einstellungen → Diagnose* -> "Lokale Erkennung prüfen…". Bei Erfolg steht
dort "GEFUNDEN und geprüft"; andernfalls listet die Diagnose jede geprüfte
Datei mit dem konkreten Grund auf (z. B. "gelesen: 3 Einträge, Steam
bestätigt: 5"), sodass sich gezielt nachbessern lässt.

Im Tray steht hinter dem Spielnamen `· lokal (sofort)` oder
`· lokal beschleunigt`.

### Dateiänderungen aufzeichnen (Diagnose)

*Einstellungen → Diagnose* -> "Dateiänderungen aufzeichnen". Zeichnet auf, welche Dateien
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

### Zweitmeldung auf dem Nebenbildschirm

Was Windows über einem Vollbildspiel nicht zeigt, zeigt es auf einem **anderen**
Bildschirm sehr wohl: Das Spiel besitzt einen Bildschirm, nicht den Rechner.
Läuft ein Spiel im Vollbild, erscheint dieselbe Meldung deshalb zusätzlich auf
allen übrigen Bildschirmen - gleichzeitig, nicht stattdessen. Auf dem
Spielbildschirm wird sie weiterhin gezeigt; kommt sie dort durch, sieht man sie
zweimal, und das ist das kleinere Übel gegenüber "gar nicht".

- **Nur im Vollbild.** Ohne laufendes Spiel oder im Fenstermodus passiert
  nichts - dort sieht man die Meldung ohnehin, und eine zweite wäre nur Unruhe
  daneben. Gefragt wird mit `SHQueryUserNotificationState`; es zählen
  "exklusives Vollbild" (3) und "randlos" (2), nicht aber der
  Präsentationsmodus (4).
- **Stumm.** Der Ton kommt aus dem Hauptfenster. Zwei Fenster, die denselben
  Klang starten, ergeben ein Flattern - sie legen nie genau gleich schnell los.
- **Die Fenster entstehen beim Programmstart** und werden danach nur noch ein-
  und ausgeblendet, wie die Übersicht. Unsichtbare Fenster zeichnen nichts; die
  gemessene Last der ganzen App im Leerlauf liegt dadurch unverändert bei rund
  0,13 % der CPU.
- Abschaltbar unter *Einstellungen > Anzeige > "Im Vollbild auf allen
  Bildschirmen"*. Mit nur einem Bildschirm gibt es nichts zu spiegeln.

Nachgemessen (Vollbildfenster auf Bildschirm 1, Zweitmeldung auf Bildschirm 2):
Die Meldung wird dort vollständig gezeichnet, und das Vollbildfenster bleibt
dabei unberührt - nicht minimiert, weiterhin im Vordergrund, Windows meldet
weiter "Vollbild". Genau das war bei der Übersicht der Knackpunkt, die deshalb
über einem solchen Spiel gar nicht erst aufgeht.

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
  Funken.
- **Blutig** (0,2 % und weniger): kein Metall, sondern Blut. Dunkelroter
  Grund mit doppeltem Rahmen, von unten steigt Blut mit Wellen an der
  Oberfläche. Die Raute morpht wie beim Diamanten, hier in einen Totenkopf,
  der leer bleibt wie die anderen Rauten und Zähne bekommt. Danach fliegen
  Tropfen statt Funken. Eigener Klang: zwei Herzschläge, ein dunkler,
  schwebender Grundton und eine Spieluhr in Moll mit Echo, deren schiefer Ton
  sich am Ende auflöst.
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
