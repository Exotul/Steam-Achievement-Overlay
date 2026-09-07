# Änderungen heute

## Noch nicht veröffentlicht

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
