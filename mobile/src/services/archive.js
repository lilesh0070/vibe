import { abortError, fetchJson, uniqueBy } from "./net";
import { detectLanguage, isNoise, nameMatches, parseDuration, tidyTitle, titleKey, words } from "./matching";

// The Internet Archive (free, keyless, CORS-enabled) keeps fan uploads of Indian
// music that Audius lacks. It is noisy (caller tunes, radio rips, nonstop mixes,
// dumps of unrelated songs), so every item and file has to prove it belongs to
// the artist before it becomes a track.
const API = "https://archive.org";
const cache = new Map();
const MIN_SECONDS = 60;
const MAX_SECONDS = 15 * 60;
const MAX_ITEMS = 8;
// Items with thousands of files are mixed dumps; their file lists are big, so at most one is opened.
const BIG_ITEM = 400;
const HUGE_ITEM = 5000;
// Archive songs are extras: the whole lookup gets this long before search shows what it has.
const WAIT = 6000;

// Keeps the derived result rather than the raw response: a dump's file list is megabytes.
async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 600000) return hit.data;
  const data = await load();
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  return data;
}

const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]).map(String);
const quote = (s) => `"${s.replace(/["\\]/g, " ")}"`;
const path = (name) => name.split("/").map(encodeURIComponent).join("/");
const base = (name) => name.replace(/^.*\//, "").replace(/\.[^.]+$/, "");

// "VBR MP3" beats "128Kbps MP3" beats the small "64Kbps MP3" derivative.
const formatRank = (format = "") => (/vbr/i.test(format) ? 0 : /64kbps/i.test(format) ? 2 : 1);

function audioFiles(files) {
  const best = new Map();
  for (const f of files) {
    if (!/mp3/i.test(f.format || "") || !/\.mp3$/i.test(f.name || "")) continue;
    const seconds = parseDuration(f.length);
    if (seconds && (seconds < MIN_SECONDS || seconds > MAX_SECONDS)) continue;
    if (isNoise(`${f.title || ""} ${f.name}`)) continue;
    // A derivative points at the upload it was made from; keep one copy per song.
    const key = base(f.source === "derivative" && f.original ? f.original : f.name);
    const prev = best.get(key);
    if (!prev || formatRank(f.format) < formatRank(prev.format)) best.set(key, f);
  }
  return [...best.values()];
}

function itemTracks(doc, artist, names, language, signal, timeout) {
  return cached(`${doc.identifier}|${names.join("|")}`, async () => {
    const meta = await fetchJson(`${API}/metadata/${encodeURIComponent(doc.identifier)}`, { signal, timeout });
    const files = meta.files || [];
    const present = new Set(files.map((f) => f.name));
    const audio = audioFiles(files);
    // In a dump of thousands of files a plain substring test on the start of a
    // name word skips most of them before the fuzzy match runs.
    const stems = names.flatMap(words).filter((w) => w.length >= 4).map((w) => w.slice(0, 4));
    const mentions = (text) => doc.files_count <= BIG_ITEM || stems.some((s) => text.toLowerCase().includes(s));
    const belongs = (text) => mentions(text) && names.some((n) => nameMatches(n, text));
    // Small items uploaded as the artist's are trusted whole; anything else is checked file by file.
    const trusted = audio.length <= 40 && (doc.byArtist || (doc.aboutArtist && audio.length <= 3));
    const picked = trusted ? audio : audio.filter((f) => belongs(`${f.title || ""} ${f.name} ${f.artist || ""} ${f.creator || ""}`));
    const itemCreator = list(doc.creator).join(", ");
    const genre =
      detectLanguage(`${doc.title || ""} ${list(doc.subject).join(" ")}`, list(doc.language)) || language || "Desi";
    const tracks = picked.map((f) => {
      const stem = f.name.replace(/\.[^.]+$/, "");
      const picture = [`${stem}.jpg`, `${stem}_thumb.jpg`].find((p) => present.has(p));
      const title = f.title || (audio.length === 1 && doc.title) || base(f.name).replace(/[_-]+/g, " ");
      return {
        kind: "track",
        source: "archive",
        id: `ia:${doc.identifier}/${f.name}`,
        title: tidyTitle(title, names),
        artist: trusted && doc.byArtist ? itemCreator : artist,
        artistId: undefined,
        artwork: picture
          ? `${API}/download/${encodeURIComponent(doc.identifier)}/${path(picture)}`
          : `${API}/services/img/${encodeURIComponent(doc.identifier)}`,
        duration: Math.round(parseDuration(f.length)),
        genre: detectLanguage(title) || genre,
        plays: 0,
        url: `${API}/download/${encodeURIComponent(doc.identifier)}/${path(f.name)}`,
      };
    });
    // Dumps hold the same song several times ("backbite", "backbite-2", ...).
    return uniqueBy(tracks, (t) => titleKey(t.title, artist)).slice(0, trusted ? 3 : 12);
  });
}

// Songs by `artist` (or its other spellings): the most downloaded matching items
// first, with at most MAX_ITEMS file lists fetched in parallel.
export async function searchArchive(artist, { aliases = [], language, signal } = {}) {
  const deadline = Date.now() + WAIT;
  const names = [...new Set([artist, ...aliases])].slice(0, 3);
  const who = names.map((n) => `creator:(${quote(n)}) OR title:(${quote(n)}) OR subject:(${quote(n)})`).join(" OR ");
  const q = `(${who}) AND mediatype:(audio) AND format:(MP3)`;
  const fields = ["identifier", "title", "creator", "subject", "language", "files_count", "item_size"]
    .map((f) => `fl%5B%5D=${f}`)
    .join("&");
  const url = `${API}/advancedsearch.php?q=${encodeURIComponent(q)}&${fields}&sort%5B%5D=downloads+desc&rows=40&output=json`;
  const docs = await cached(url, () => fetchJson(url, { signal, timeout: 4000 }).then((d) => d.response?.docs || []));

  const owns = (v) => list(v).some((x) => names.some((n) => nameMatches(n, x)));
  const relevant = docs
    .map((d) => ({ ...d, byArtist: owns(d.creator), aboutArtist: owns(d.title) || owns(d.subject) }))
    .filter((d) => (d.byArtist || d.aboutArtist) && (d.files_count || 0) <= HUGE_ITEM && !isNoise(d.title))
    // Under ~1 MB an item is a caller tune or a WhatsApp-status clip, not a song.
    .filter((d) => !d.item_size || d.item_size >= 1000000);
  const small = relevant.filter((d) => (d.files_count || 0) <= BIG_ITEM).slice(0, MAX_ITEMS);
  const big = relevant.filter((d) => d.files_count > BIG_ITEM).sort((a, b) => a.files_count - b.files_count);
  const items = small.length < 4 && big.length ? [...small, big[0]] : small;

  // The file lists load in parallel, so each gets whatever is left of the shared wait.
  const timeout = Math.max(1500, deadline - Date.now());
  const sets = await Promise.allSettled(items.map((d) => itemTracks(d, artist, names, language, signal, timeout)));
  if (signal?.aborted) throw abortError();
  return sets.filter((s) => s.status === "fulfilled").flatMap((s) => s.value).slice(0, 30);
}
