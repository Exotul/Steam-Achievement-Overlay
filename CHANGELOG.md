# Änderungen heute

## Noch nicht veröffentlicht

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
