# Änderungen heute

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
- 45 automatische Tests, unter anderem gegen echte Steam-Dateien
