/**
 * Übersetzt einen fehlgeschlagenen Steam-Aufruf in eine Aussage, mit der
 * jemand etwas anfangen kann.
 *
 * Warum es das gibt: Im Protokoll stand "XP-Berechnung fehlgeschlagen:
 * Request failed with status code 401" - fünfzehnmal hintereinander. Daraus
 * geht weder hervor, was die Ursache ist, noch was zu tun wäre, noch dass es
 * zwecklos ist, weiter zu warten. Der eigentliche Grund war ein
 * zurückgezogener API-Schlüssel, und daran ändert sich durch Wiederholen
 * nichts.
 *
 * Bewusst ohne Abhängigkeiten: Diese Einordnung entscheidet, ob die App es
 * noch einmal versucht oder aufgibt, und muss sich ohne Steam-Zugang prüfen
 * lassen.
 */

/**
 * @param {Error} fehler - typischerweise ein axios-Fehler
 * @returns {{status: number|null, grund: string, endgueltig: boolean,
 *            schluesselProblem: boolean}}
 *
 * `endgueltig` heißt: Ein weiterer Versuch mit denselben Voraussetzungen
 * führt zum selben Ergebnis. Die App soll dann aufhören zu fragen, statt
 * Steam im Sekundentakt dieselbe Absage abzuholen.
 */
function beschreibe(fehler) {
  const status = fehler?.response?.status ?? null;

  if (status === 401 || status === 403) {
    return {
      status,
      schluesselProblem: true,
      endgueltig: true,
      grund:
        `Steam lehnt den API-Schlüssel ab (HTTP ${status}). Er ist ungültig, ` +
        'wurde zurückgezogen oder gehört zu einem anderen Konto. Neuen ' +
        'Schlüssel eintragen: Tray-Menü → Einstellungen → Steam.',
    };
  }

  if (status === 429) {
    return {
      status,
      schluesselProblem: false,
      endgueltig: false,
      grund: 'Steam drosselt gerade die Anfragen. Später erneut versuchen.',
    };
  }

  if (status && status >= 500) {
    return {
      status,
      schluesselProblem: false,
      endgueltig: false,
      grund: `Steam meldet einen Serverfehler (HTTP ${status}). Das geht meist von selbst vorbei.`,
    };
  }

  if (status) {
    return {
      status,
      schluesselProblem: false,
      endgueltig: false,
      grund: `Steam antwortet unerwartet (HTTP ${status}).`,
    };
  }

  // Gar keine Antwort: kein Netz, Zeitüberschreitung, DNS. Das kann sich
  // jederzeit ändern - also nicht endgültig.
  const code = fehler?.code;
  return {
    status: null,
    schluesselProblem: false,
    endgueltig: false,
    grund: code
      ? `Steam ist nicht erreichbar (${code}).`
      : `Steam-Aufruf fehlgeschlagen: ${fehler?.message || 'unbekannter Fehler'}`,
  };
}

module.exports = { beschreibe };
