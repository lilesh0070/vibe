export function buildProfile({
  liked = [],
  history = [],
  playlists = [],
  stats = {},
  searches = [],
}) {
  const p = { genres: {}, artists: {}, tracks: {} };
  const add = (obj, key, n) => {
    if (key) obj[key] = (obj[key] || 0) + n;
  };
  liked.forEach((t) => {
    add(p.genres, t.genre, 10);
    add(p.artists, t.artistId, 12);
  });
  history.forEach((t) => {
    add(p.genres, t.genre, 4);
    add(p.artists, t.artistId, Math.min(t.playCount || 1, 5) * 8);
  });
  playlists
    .flatMap((p) => p.songs)
    .forEach((t) => {
      add(p.artists, t.artistId, 8);
      add(p.genres, t.genre, 8);
    });
  Object.entries(stats).forEach(([id, s]) => {
    const weight =
      (s.completed || 0) * 5 +
      Math.max(0, (s.plays || 0) - 1) * 6 +
      Math.min((s.seconds || 0) / 60, 10) -
      (s.skipped || 0) * 5;
    add(p.tracks, id, weight);
    add(p.genres, s.genre, (s.plays || 0) * 7);
    add(p.artists, s.artistId, weight - (s.skipped || 0) * 4);
  });
  p.searches = searches.slice(0, 8).map((s) => s.toLowerCase());
  return p;
}
export function rankRecommendations(tracks, profile, history = [], limit = 18) {
  const recent = new Set(history.slice(0, 8).map((t) => t.id));
  const ranked = [...new Map(tracks.map((t) => [t.id, t])).values()]
    .map((t) => ({
      t,
      score:
        (profile.genres[t.genre] || 0) +
        (profile.artists[t.artistId] || 0) +
        (profile.tracks[t.id] || 0) +
        (profile.searches || []).reduce(
          (n, q) =>
            n +
            (`${t.title} ${t.artist} ${t.genre}`.toLowerCase().includes(q)
              ? 3
              : 0),
          0,
        ) +
        Math.log10((t.plays || 0) + 1) -
        (recent.has(t.id) ? 25 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  const result = [],
    deferred = [],
    counts = {};
  ranked.forEach(({ t }) => {
    counts[t.artistId] = counts[t.artistId] || 0;
    if (counts[t.artistId] < 2) {
      result.push(t);
      counts[t.artistId]++;
    } else deferred.push(t);
  });
  return [...result, ...deferred].slice(0, limit);
}
