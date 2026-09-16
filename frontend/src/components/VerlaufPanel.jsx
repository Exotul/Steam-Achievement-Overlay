import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { tierOf, TIER_ORDER } from '../lib/tiers';
import { baueRaster, stufeVon, serie, summe, nachTagen, lesbaresDatum } from '../lib/verlauf';

/**
 * Der Trophäenverlauf.
 *
 * Die Daten schreibt das Overlay seit jeher mit (backend/services/history.js) -
 * gezeigt wurden sie bisher nirgends. Hier werden sie ausgewertet.
 *
 * ZUR FORM: Das Jahresraster ist eine Heatmap, also eine Größenordnung über
 * einem Gitter. Dafür gilt eine **sequenzielle** Rampe in EINEM Farbton,
 * hell nach dunkel (im dunklen Umfeld umgekehrt: mehr = heller). Die vier
 * Stufen sind nachgemessen streng monoton in der Helligkeit und liegen alle
 * über 3:1 Kontrast zur Fläche - siehe styles/app.css.
 *
 * Die Kennzahlen darüber sind bewusst KEIN Diagramm: Einzelne Werte gehören
 * in Kachelform, nicht in ein Balkendiagramm mit einem Balken.
 *
 * Die Stufenfarben (Kupfer/Silber/Gold/Platin) sind ordinal und in der ganzen
 * App etabliert. Sie bestehen die Unterscheidbarkeitsprüfungen und tragen
 * ohnehin immer ihren Namen als Text - Farbe allein trägt hier nie eine
 * Aussage.
 */
export default function VerlaufPanel() {
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [zeitraum, setZeitraum] = useState(30);

  useEffect(() => {
    api
      .history({ tage: 366, limit: 400 })
      .then(setDaten)
      .catch((e) => setFehler(e));
  }, []);

  if (fehler) {
    return <p className="verlauf__hinweis">Der Verlauf konnte nicht geladen werden.</p>;
  }
  if (!daten) {
    return <p className="verlauf__hinweis">Lädt Verlauf…</p>;
  }

  const { proTag = [], verlauf = [] } = daten;

  if (proTag.length === 0) {
    return (
      <div className="verlauf__leer">
        <p className="verlauf__leer-titel">Noch nichts aufgezeichnet.</p>
        <p>
          Ab jetzt wird jede Trophäe mitgeschrieben, sobald das Overlay sie meldet — mit Spiel,
          Stufe, XP und Zeitpunkt. Nach der ersten Spielsitzung steht hier etwas.
        </p>
      </div>
    );
  }

  const raster = baueRaster(proTag);
  const zeitraumDaten = summe(proTag, zeitraum);
  const laufendeSerie = serie(proTag);
  const tage = nachTagen(verlauf);

  return (
    <div className="verlauf">
      {/*
        Die Zeitraumwahl steht in der Überschriftenzeile des Abschnitts, den
        sie tatsächlich steuert. Frei darüber schwebend sähe sie aus wie ein
        Filter für die ganze Seite - das Jahresraster darunter zeigt aber
        immer ein Jahr, und ein Bedienelement, das nur die Hälfte dessen
        ändert, was darunter steht, ist irreführend.
      */}
      <div className="section-heading">
        <h2>Überblick</h2>
        <div className="verlauf__zeitraum" role="group" aria-label="Zeitraum für den Überblick">
          {[7, 30, 90, 365].map((t) => (
            <button
              key={t}
              className={`verlauf__zeitraum-knopf${zeitraum === t ? ' verlauf__zeitraum-knopf--aktiv' : ''}`}
              onClick={() => setZeitraum(t)}
              aria-pressed={zeitraum === t}
            >
              {t === 365 ? 'Jahr' : `${t} Tage`}
            </button>
          ))}
        </div>
      </div>

      <div className="kacheln">
        <Kachel wert={zeitraumDaten.anzahl} label="Trophäen" />
        <Kachel wert={zeitraumDaten.xp.toLocaleString('de-DE')} label="XP" />
        <Kachel
          wert={zeitraumDaten.besterTag ? zeitraumDaten.besterTag.anzahl : 0}
          label="bester Tag"
          zusatz={
            zeitraumDaten.besterTag
              ? lesbaresDatum(zeitraumDaten.besterTag.tag).replace(/ \d{4}$/, '')
              : null
          }
        />
        <Kachel
          wert={laufendeSerie}
          label={laufendeSerie === 1 ? 'Tag in Folge' : 'Tage in Folge'}
        />
      </div>

      {/* --- Stufen im Zeitraum: Teil eines Ganzen, deshalb ein Balken --- */}
      <StufenBalken stufen={zeitraumDaten.stufen} gesamt={zeitraumDaten.anzahl} />

      {/* --- Jahresraster --- */}
      <div className="section-heading">
        <h2>Das letzte Jahr</h2>
        <span className="section-heading__hint">
          Ein Kästchen je Tag · Wochen von links nach rechts
        </span>
      </div>
      <Jahresraster raster={raster} />

      {/* --- Einzelne Freischaltungen: zugleich die lesbare Fassung --- */}
      <div className="section-heading">
        <h2>Zuletzt errungen</h2>
      </div>
      <div className="verlauf__tage">
        {tage.map((t) => (
          <section key={t.tag} className="verlauf-tag">
            <header className="verlauf-tag__kopf">
              <h3 className="verlauf-tag__datum">{lesbaresDatum(t.tag)}</h3>
              <span className="verlauf-tag__summe">
                {t.eintraege.length} {t.eintraege.length === 1 ? 'Trophäe' : 'Trophäen'} · {t.xp} XP
              </span>
            </header>
            <ul className="verlauf-tag__liste">
              {t.eintraege.map((e, i) => (
                <li key={`${e.apiName}-${e.ts}-${i}`} className="verlauf-eintrag">
                  <span
                    className="verlauf-eintrag__punkt"
                    style={{ background: tierOf(e.category).color }}
                  />
                  <span className="verlauf-eintrag__name">{e.name}</span>
                  <span className="verlauf-eintrag__spiel">{e.gameName}</span>
                  <span className="verlauf-eintrag__stufe">{e.category}</span>
                  <span className="verlauf-eintrag__xp">+{Math.round(e.xpZuwachs || 0)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Kachel({ wert, label, zusatz }) {
  return (
    <div className="kachel">
      <p className="kachel__wert">{wert}</p>
      <p className="kachel__label">{label}</p>
      {zusatz && <p className="kachel__zusatz">{zusatz}</p>}
    </div>
  );
}

/**
 * Anteil der Stufen als ein liegender Balken - Teil eines Ganzen.
 *
 * Jeder Abschnitt trägt seine Zahl direkt daneben, die Farbe ist nur Beiwerk.
 * Zwischen den Abschnitten liegen 2 px Fläche, damit zwei ähnliche Töne nicht
 * ineinanderlaufen.
 */
function StufenBalken({ stufen, gesamt }) {
  if (!gesamt) return null;

  const teile = TIER_ORDER.map((name) => ({
    name,
    anzahl: stufen[name] || 0,
    farbe: tierOf(name).color,
  })).filter((t) => t.anzahl > 0);

  return (
    <div className="stufen">
      <div className="stufen__balken">
        {teile.map((t) => (
          <span
            key={t.name}
            className="stufen__teil"
            style={{ width: `${(t.anzahl / gesamt) * 100}%`, background: t.farbe }}
            title={`${t.name}: ${t.anzahl}`}
          />
        ))}
      </div>
      <ul className="stufen__legende">
        {teile.map((t) => (
          <li key={t.name} className="stufen__eintrag">
            <span className="stufen__punkt" style={{ background: t.farbe }} />
            {t.name}
            <strong>{t.anzahl}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

const WOCHENTAGE = ['Mo', '', 'Mi', '', 'Fr', '', 'So'];

/**
 * Ein Tag im Raster.
 *
 * Der Wert steht NICHT nur im Tooltip: `title` erreicht keine Tastatur und
 * kein Vorlesewerkzeug. Deshalb trägt jede Zelle dieselbe Aussage als
 * `aria-label` und gilt als Bild mit Beschreibung. Wer gar keine Farben
 * unterscheiden kann, findet dieselben Zahlen zusätzlich als Liste weiter
 * unten - das Raster ist nie der einzige Weg zu einem Wert.
 */
function Zelle({ tag, maximum }) {
  if (tag.zukunft) {
    return <span className="raster__zelle raster__zelle--sx" aria-hidden="true" />;
  }

  const menge =
    tag.anzahl === 0
      ? 'nichts'
      : `${tag.anzahl} ${tag.anzahl === 1 ? 'Trophäe' : 'Trophäen'}`;
  const text = `${lesbaresDatum(tag.tag)}: ${menge}${tag.xp ? ` · ${Math.round(tag.xp)} XP` : ''}`;

  return (
    <span
      className={`raster__zelle raster__zelle--s${stufeVon(tag.anzahl, maximum)}`}
      role="img"
      aria-label={text}
      title={text}
    />
  );
}

function Jahresraster({ raster }) {
  return (
    <div className="raster">
      <div className="raster__tage" aria-hidden="true">
        {WOCHENTAGE.map((t, i) => (
          <span key={i} className="raster__tag-name">
            {t}
          </span>
        ))}
      </div>

      <div className="raster__gitter">
        {raster.wochen.map((woche, w) => (
          <div key={w} className="raster__woche">
            {woche.map((tag) => (
              <Zelle key={tag.tag} tag={tag} maximum={raster.maximum} />
            ))}
          </div>
        ))}
      </div>

      <div className="raster__legende">
        <span>weniger</span>
        <span className="raster__zelle raster__zelle--s0" />
        <span className="raster__zelle raster__zelle--s1" />
        <span className="raster__zelle raster__zelle--s2" />
        <span className="raster__zelle raster__zelle--s3" />
        <span className="raster__zelle raster__zelle--s4" />
        <span>mehr</span>
      </div>
    </div>
  );
}
