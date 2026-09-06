import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { getLevelProgress } from './xp';

/**
 * Laedt die Profile der Freunde nacheinander im Hintergrund.
 *
 * Bewusst nur EIN Profil gleichzeitig: Der Aufbau eines Profils bedeutet
 * serverseitig, die komplette Bibliothek des Freundes durchzugehen. Mehrere
 * parallel wuerden die Steam-API ueberlasten und zu Drosselung fuehren -
 * dann dauert am Ende alles laenger.
 */
export function useFriendProfiles(friends, refreshToken = 0) {
  const [profiles, setProfiles] = useState({}); // steamId -> Profil | { error } | { isPrivate }
  const [loadingId, setLoadingId] = useState(null);
  const [fertig, setFertig] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!friends || friends.length === 0) return;
    cancelled.current = false;
    setFertig(false);

    // Beim Aktualisieren die alten Werte verwerfen, damit sichtbar ist,
    // dass wirklich neu gerechnet wird.
    const neuBerechnen = refreshToken > 0;
    if (neuBerechnen) setProfiles({});

    (async () => {
      for (const friend of friends) {
        if (cancelled.current) return;
        setLoadingId(friend.steamId);
        try {
          const profile = await api.friendProfile(friend.steamId, neuBerechnen);
          if (cancelled.current) return;
          setProfiles((prev) => ({ ...prev, [friend.steamId]: profile }));
        } catch (err) {
          if (cancelled.current) return;
          setProfiles((prev) => ({
            ...prev,
            [friend.steamId]: { error: true, isPrivate: false },
          }));
        }
      }
      if (!cancelled.current) {
        setLoadingId(null);
        setFertig(true);
      }
    })();

    return () => {
      cancelled.current = true;
    };
  }, [friends, refreshToken]);

  const withLevel = (friends || []).map((f) => {
    const profile = profiles[f.steamId];
    const level =
      profile && !profile.error && !profile.isPrivate
        ? getLevelProgress(profile.totalXp)
        : null;
    return { ...f, profile, level, isLoading: loadingId === f.steamId && !profile };
  });

  return { friendsWithLevel: withLevel, loadingId, fertig };
}
