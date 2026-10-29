import { stripSiteTags } from "./matching";
import { abortError, fetchJson, isAbort, uniqueBy } from "./net";
import { buildProfile, rankRecommendations } from "./recommendationEngine";

// Audius is a free, open music platform: full-length streams, no API key.
const hosts = [
  "https://api.audius.co/v1",
  "https://discoveryprovider.audius.co/v1",
];
const APP = "Vibe";
const cache = new Map();

// Each search is tagged with the language it stands for, so the Desi mix still
// feeds Hindi/Punjabi preferences instead of the uploader's genre.
export const desiCollections = {
  Desi: { queries: [["bollywood", "Hindi"], ["punjabi", "Punjabi"], ["hindi", "Hindi"]], subtitle: "Bollywood, Punjabi & Hindi" },
  Hindi: { queries: [["hindi", "Hindi"], ["bollywood", "Hindi"]], subtitle: "Bollywood & Hindi sounds" },
  Punjabi: { queries: [["punjabi", "Punjabi"], ["bhangra", "Punjabi"]], subtitle: "Punjab on repeat" },
  Haryanvi: { queries: [["haryanvi", "Haryanvi"]], subtitle: "Desi beats, big energy" },
  // Not a Browse tile, but search tags Bhojpuri singers' songs with it and
  // recommendations then ask for more; Audius has no "Bhojpuri" genre to trend.
  Bhojpuri: { queries: [["bhojpuri", "Bhojpuri"], ["pawan singh", "Bhojpuri"]], subtitle: "Bhojpuri hits" },
};

export const genres = [
  { name: "Hindi", icon: "sun", subtitle: desiCollections.Hindi.subtitle },
  { name: "Punjabi", icon: "zap", subtitle: desiCollections.Punjabi.subtitle },
  { name: "Haryanvi", icon: "music", subtitle: desiCollections.Haryanvi.subtitle },
  { name: "Hip-Hop/Rap", label: "Hip hop", icon: "mic", subtitle: "Beats with a pulse" },
  { name: "Electronic", icon: "activity", subtitle: "Find your frequency" },
  { name: "Pop", icon: "star", subtitle: "On repeat, always" },
  { name: "Lo-Fi", label: "Lo-fi", icon: "cloud", subtitle: "Slow down. Tune in." },
  { name: "R&B/Soul", label: "R&B & soul", icon: "heart", subtitle: "A little soul goes a long way" },
  { name: "Rock", icon: "radio", subtitle: "Turn it all the way up" },
  { name: "Acoustic", icon: "feather", subtitle: "Keep it close" },
  { name: "Ambient", icon: "moon", subtitle: "Room to breathe" },
  { name: "Dance", icon: "disc", subtitle: "Move to your own rhythm" },
];

export const genreLabel = (name) =>
  genres.find((g) => g.name === name)?.label || name;

// Many uploads carry converter leftovers ("(MP3_320K)", "_320(MyMp3Song)", "__")
// and download-site watermarks ("(DJJOhAL.Com)", "320 Kbps").
export const cleanTitle = (s = "") =>
  stripSiteTags(s.replace(/(?:_\d{2,3})?\s*\((?:mp3cut\.net|(?:MP3|M4A)_\d+K|MyMp3Song)\)/gi, ""))
    .replace(/__+/g, " · ")
    .replace(/_/g, " ")
    .replace(/\s+·\s+·\s+/g, " · ")
    .replace(/\s{2,}/g, " ")
    .trim() || "Untitled";

export function normalizeTrack(t, genre) {
  return {
    kind: "track",
    source: "audius",
    id: t.id,
    title: cleanTitle(t.title),
    artist: t.user?.name || "Unknown artist",
    artistId: t.user?.id,
    artwork: t.artwork?.["480x480"] || t.artwork?.["1000x1000"] || null,
    duration: t.duration || 0,
    genre: genre || t.genre || "Electronic",
    plays: t.play_count || 0,
    date: t.release_date || t.created_at,
  };
}

export const normalizeUser = (u) => ({
  id: u.id,
  name: u.name || u.handle,
  handle: u.handle,
  image: u.profile_picture?.["480x480"] || null,
  followers: u.follower_count || 0,
  trackCount: u.track_count || 0,
  bio: u.bio,
});

export const normalizePlaylist = (p) => ({
  id: p.id,
  name: p.playlist_name,
  artist: p.user?.name,
  artistId: p.user?.id,
  artwork: p.artwork?.["480x480"] || null,
  count: p.track_count || 0,
  isAlbum: !!p.is_album,
});

const playable = (t) =>
  t && t.is_streamable !== false && !t.is_stream_gated && t.is_available !== false && !t.is_delete;

async function request(path, params = {}, signal) {
  const query = new URLSearchParams({ app_name: APP });
  Object.entries(params).forEach(([k, v]) => v !== undefined && query.set(k, v));
  const key = `${path}?${query}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 120000) return hit.data;
  let last;
  for (const host of hosts) {
    try {
      const data = (await fetchJson(host + key, { signal, timeout: 8000 })).data;
      cache.set(key, { at: Date.now(), data });
      return data;
    } catch (e) {
      if (isAbort(e) && signal?.aborted) throw e;
      last = e;
    }
  }
  throw new Error("Music service is taking a break. Please try again.", { cause: last });
}

const tracks = (data, genre) =>
  (data || []).filter(playable).map((t) => normalizeTrack(t, genre));

export const streamUrl = (id, attempt = 0) =>
  `${hosts[attempt % hosts.length]}/tracks/${encodeURIComponent(id)}/stream?app_name=${APP}`;
export const streamHostCount = hosts.length;

export const searchTracks = (q, signal) =>
  request("/tracks/search", { query: q, limit: 40 }, signal).then((d) => tracks(d));

export const getTrending = (genre, signal) =>
  request("/tracks/trending", { limit: 40, time: "week", genre }, signal).then((d) => tracks(d));

export const getUnderground = (signal) =>
  request("/tracks/trending/underground", { limit: 30 }, signal).then((d) => tracks(d));

export const searchArtists = (q, signal) =>
  request("/users/search", { query: q, limit: 20 }, signal).then((d) => (d || []).map(normalizeUser));

export const searchPlaylists = (q, signal) =>
  request("/playlists/search", { query: q, limit: 20 }, signal).then((d) =>
    (d || []).filter((p) => p.track_count > 0).map(normalizePlaylist),
  );

export const getArtist = (id, signal) =>
  request(`/users/${encodeURIComponent(id)}`, {}, signal).then((d) =>
    normalizeUser(Array.isArray(d) ? d[0] : d),
  );

export const getArtistTracks = (id, signal) =>
  request(`/users/${encodeURIComponent(id)}/tracks`, { limit: 50 }, signal).then((d) => tracks(d));

export const getPlaylist = (id, signal) =>
  request(`/playlists/${encodeURIComponent(id)}`, {}, signal).then((d) =>
    normalizePlaylist(Array.isArray(d) ? d[0] : d),
  );

export const getPlaylistTracks = (id, signal) =>
  request(`/playlists/${encodeURIComponent(id)}/tracks`, {}, signal).then((d) => tracks(d));

export async function getDesi(language, signal) {
  const { queries } = desiCollections[language] || desiCollections.Desi;
  const sets = await Promise.allSettled(
    queries.map(([q, tag]) => request("/tracks/search", { query: q, limit: 40 }, signal).then((d) => tracks(d, tag))),
  );
  if (signal?.aborted) throw abortError();
  const found = uniqueBy(sets.filter((s) => s.status === "fulfilled").flatMap((s) => s.value));
  if (!found.length && sets.every((s) => s.status === "rejected")) throw sets[0].reason;
  return found.sort((a, b) => b.plays - a.plays);
}

export const isDesi = (name) => Boolean(desiCollections[name]);

export const getGenreTracks = (name, signal) =>
  isDesi(name) ? getDesi(name, signal) : getTrending(name, signal);

export async function getRecommendations(library, signal) {
  const profile = buildProfile(library);
  const favorite = Object.entries(profile.genres).sort((a, b) => b[1] - a[1])[0]?.[0];
  const artistIds = [...new Set(library.liked.map((t) => t.artistId).filter(Boolean))].slice(0, 3);
  const sets = await Promise.all([
    getTrending(undefined, signal).catch(() => []),
    favorite ? getGenreTracks(favorite, signal).catch(() => []) : [],
    ...artistIds.map((id) => getArtistTracks(id, signal).catch(() => [])),
  ]);
  return rankRecommendations(uniqueBy(sets.flat()), profile, library.history);
}
