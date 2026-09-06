import { api } from '../lib/api';

export default function LoginScreen() {
  return (
    <div className="login-screen">
      <div className="login-screen__panel">
        <p className="login-screen__eyebrow">Trophäenschrank</p>
        <h1 className="login-screen__title">
          Sammelt Achievements.
          <br />
          Vergleicht euch.
        </h1>
        <p className="login-screen__text">
          Bibliothek, Fortschritt und Freunde direkt aus Steam - mit Kupfer, Silber, Gold, Platin
          und dem Diamant-Status für komplett abgeschlossene Spiele.
        </p>
        <a className="login-screen__button" href={api.loginUrl}>
          Mit Steam anmelden
        </a>
      </div>
    </div>
  );
}
