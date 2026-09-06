// Wenn das Dashboard vom Backend selbst mit ausgeliefert wird (Normalfall),
// ist ein leerer Basispfad richtig - Anfragen gehen dann automatisch an
// dieselbe Adresse, von der die Seite geladen wurde. Für die separate
// Entwicklung mit "npm run dev" kann VITE_API_BASE_URL gesetzt werden.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function request(path) {
  const res = await fetch(`${BASE_URL}${path}`, { credentials: 'include' });
  if (res.status === 401) {
    const err = new Error('unauthenticated');
    err.code = 401;
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Anfrage fehlgeschlagen: ${path} (${res.status})`);
  }
  return res.json();
}

export const api = {
  base: BASE_URL,
  loginUrl: `${BASE_URL}/auth/steam`,
  logoutUrl: `${BASE_URL}/auth/logout`,
  me: () => request('/auth/me'),
  health: () => request('/api/health'),
  library: () => request('/api/library'),
  gameAchievements: (appId) => request(`/api/games/${appId}/achievements`),
  friends: (refresh = false) => request(`/api/friends${refresh ? '?refresh=1' : ''}`),
  friendAchievements: (steamId, appId) =>
    request(`/api/friends/${steamId}/games/${appId}/achievements`),
  releaseDates: (appIds) => request(`/api/release-dates?appIds=${appIds.join(',')}`),
  friendProfile: (steamId, refresh = false) =>
    request(`/api/friends/${steamId}/profile${refresh ? '?refresh=1' : ''}`),
};
