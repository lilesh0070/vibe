import { fetchJson } from "./net";

// The iTunes Search API is keyless and CORS-enabled, and it knows how Indian
// artists are really spelled ("dhanda noliywala" -> Dhanda Nyoliwala). Vibe only
// uses it for names and song titles; its 30-second previews are never played.
const API = "https://itunes.apple.com/search";
const cache = new Map();
let restedUntil = 0;

async function search(term, entity, limit, signal, timeout = 5000) {
  const url = `${API}?term=${encodeURIComponent(term)}&entity=${entity}&country=IN&limit=${limit}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 600000) return hit.data;
  // Apple answers 403/429 for a while once a device searches too often; wait it out.
  if (Date.now() < restedUntil) throw new Error("iTunes is resting");
  try {
    const data = (await fetchJson(url, { signal, timeout })).results || [];
    cache.set(url, { at: Date.now(), data });
    return data;
  } catch (e) {
    if (e?.status === 403 || e?.status === 429) restedUntil = Date.now() + 60000;
    throw e;
  }
}

export const findArtists = (term, signal, timeout) =>
  search(term, "musicArtist", 6, signal, timeout).then((list) =>
    list.filter((a) => a.artistName).map((a) => ({ name: a.artistName.trim(), genre: a.primaryGenreName || "" })),
  );

export const findSongs = (artist, signal) =>
  search(artist, "song", 40, signal).then((list) =>
    list
      .filter((s) => s.trackName && s.artistName)
      .map((s) => ({ title: s.trackName, artist: s.artistName, genre: s.primaryGenreName || "" })),
  );
