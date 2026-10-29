import { abortError, uniqueBy } from "./net";
import { getArtistTracks, searchArtists, searchPlaylists, searchTracks } from "./audius";
import { searchArchive } from "./archive";
import { indianArtists } from "./indianArtists";
import { findArtists, findSongs } from "./itunes";
import {
  bestArtist,
  detectLanguage,
  foldName,
  isIndianGenre,
  matchArtist,
  nameMatches,
  rankByName,
  rankTracks,
  sameName,
  songKeys,
  terms,
  trackMatches,
  words,
} from "./matching";
import { searchStations } from "./radio";

// Below this many songs that are really the artist's, search also looks up
// their best-known song titles by name.
const THIN = 12;
// iTunes only fixes spelling; past this the search goes ahead without it.
const SPELLING_WAIT = 2000;
// Lookups by song title are extras; the results found so far are not held back longer.
const TITLE_WAIT = 4000;

async function settled(promises) {
  const results = await Promise.allSettled(promises);
  return {
    values: results.filter((r) => r.status === "fulfilled").map((r) => r.value),
    error: results.find((r) => r.status === "rejected")?.reason,
  };
}

// Resolves with `fallback` when `promise` takes longer than `ms`.
function within(promise, ms, fallback) {
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

// The services match words literally, so "noliywala" and "Nyoliwala" are different searches.
const sameText = (a, b) => words(a).join("") === words(b).join("");
// Same words in any order: "kesariya arijit singh" spells the name right.
const sameWords = (a, b) => words(a).sort().join(" ") === words(b).sort().join(" ");

// Started early and awaited later; a handler now keeps an early failure from
// being reported as unhandled while the artist lookup is still running.
const early = (promise) => {
  promise?.catch(() => {});
  return promise;
};

function intentFor(query, artist, { missed, weak }, { indian, language, aliases = [] }) {
  const text = [artist, ...missed].join(" ");
  const typed = terms(query).join(" ");
  const corrected = !sameText(typed, text) && !sameWords(typed, text);
  // A name spelled right keeps the user's own words and order.
  return { artist, text: corrected ? text : query, corrected, weak, indian, language, aliases };
}

// A guess from one respelled or partial word must agree with the plain song
// results: when "jasmine" or "mehndi" already finds plenty of songs that are
// not the artist's, the word means something else there.
async function confirmed(intent, query, probe) {
  if (!intent.weak || !probe) return true;
  const found = await probe().catch(() => []);
  const text = (t) => `${t.title} ${t.artist}`;
  const typed = found.filter((t) => nameMatches(query, text(t), { prefix: true }));
  if (typed.length < 4) return true;
  const names = [intent.artist, ...intent.aliases];
  const theirs = typed.filter((t) => names.some((n) => nameMatches(n, text(t))));
  return theirs.length * 2 >= typed.length;
}

// Decides whether the query names an artist: offline against the curated
// Indian list first, then through iTunes, which knows how names are really
// spelled. Plain searches ("lofi", "taylor swift", "love") resolve to null.
// `probe` returns the plain song results for checking weak guesses.
export async function resolveIntent(query, signal, probe) {
  const local = bestArtist(query, indianArtists);
  if (local) {
    const { name, language, aliases } = local.artist;
    const intent = intentFor(query, name, local, { indian: true, language, aliases });
    if (await confirmed(intent, query, probe)) return intent;
  }
  let found;
  try {
    found = await findArtists(query, signal, SPELLING_WAIT);
  } catch (e) {
    if (signal?.aborted) throw abortError();
    return null;
  }
  for (const a of found) {
    const known = indianArtists.find((x) => sameName(x.name, a.name));
    const indian = Boolean(known) || isIndianGenre(a.genre);
    // Outside Indian music only a full-name match counts, so "lofi hindi" never becomes an artist.
    const m = matchArtist(query, a.name, { strict: !indian });
    // Only the curated list completes part of a name; from iTunes "krsna" would
    // become M.S Krsna when the rapper KR$NA was meant.
    if (!m || m.partial) continue;
    const intent = intentFor(query, a.name, m, {
      indian,
      language: known?.language || detectLanguage(a.genre) || "Desi",
      aliases: known?.aliases,
    });
    // A name typed correctly needs no help unless it is an Indian artist worth
    // expanding; a one-word exact name ("Love", "Chill") is just a word.
    if (!intent.corrected && (!indian || words(a.name).length < 2)) return null;
    return (await confirmed(intent, query, probe)) ? intent : null;
  }
  return null;
}

// Real song titles for the artist, used to find uploads that do not name them
// and to rank known songs first.
async function knownSongs(artist, signal) {
  const songs = await findSongs(artist, signal);
  const titles = songs
    .filter((s) => nameMatches(artist, s.artist))
    .map((s) => s.title.replace(/\s*[([](?:feat|ft|with|from)\b[^)\]]*[)\]]/gi, "").trim())
    .filter(Boolean);
  return [...new Map(titles.map((t) => [foldName(t), t])).values()].slice(0, 15);
}

// Audius accounts carrying the artist's name (official or fan pages) and
// their uploads, biggest following first.
async function accountTracks(accounts, artist, signal) {
  const named = (await accounts)
    .filter((u) => u.trackCount > 0 && nameMatches(artist, `${u.name} ${u.handle || ""}`))
    .sort((a, b) => b.followers - a.followers)
    .slice(0, 2);
  const sets = await settled(named.map((u) => getArtistTracks(u.id, signal)));
  return sets.values.flat();
}

async function songsFor(query, intent, plain, accounts, signal) {
  if (!intent) return rankTracks(await plain, { query });
  const { artist, text, indian, language } = intent;
  const titles = early(indian ? knownSongs(artist, signal) : Promise.resolve([]));
  const first = await settled(
    [
      plain,
      !sameText(text, query) && searchTracks(text, signal),
      accountTracks(accounts, artist, signal),
      indian && searchArchive(artist, { aliases: intent.aliases, language, signal }),
    ].filter(Boolean),
  );
  if (!first.values.length) throw first.error;
  let found = uniqueBy(first.values.flat());
  const known = await titles.catch(() => []);
  // What was typed counts as well, so a wrong guess never hides what was asked for.
  const want = { query: text, artist, typed: query };
  const matching = rankTracks(found, { ...want, focused: true, keep: 0 });
  if (matching.length < THIN && known.length) {
    const missing = known.filter((title) => !matching.some((t) => nameMatches(title, t.title))).slice(0, 3);
    const more = await within(settled(missing.map((title) => searchTracks(`${title} ${artist}`, signal))), TITLE_WAIT, { values: [] });
    found = uniqueBy([...found, ...more.values.flat()]);
  }
  if (signal?.aborted) throw abortError();
  // Uploaders file Punjabi songs under Rock or Metal; the artist's language says more.
  const tagged = indian
    ? found.map((t) => (t.source === "audius" && trackMatches(t, { artist }) ? { ...t, genre: language } : t))
    : found;
  return rankTracks(tagged, { ...want, songs: songKeys(known), focused: true });
}

// Each section settles only the requests it really made, so when they all fail
// the section fails too (and the screen offers a retry instead of "No results").
async function artistsFor(query, intent, plain, accounts) {
  const sets = await settled([plain, accounts].filter(Boolean));
  if (!sets.values.length) throw sets.error;
  const all = uniqueBy(sets.values.flat());
  const text = (a) => `${a.name} ${a.handle || ""}`;
  if (!intent) return rankByName(all, query, { text });
  const named = rankByName(all, intent.artist, { text, focused: true, also: query });
  // Empty fan accounts only lead to an empty artist page.
  const active = named.filter((a) => a.trackCount > 0);
  return active.length ? active : named;
}

async function playlistsFor(query, intent, plain, signal) {
  const extra = intent && !sameText(query, intent.artist) ? searchPlaylists(intent.artist, signal) : null;
  const sets = await settled([plain, extra].filter(Boolean));
  if (!sets.values.length) throw sets.error;
  const all = uniqueBy(sets.values.flat());
  const text = (p) => `${p.name} ${p.artist || ""}`;
  if (!intent) return rankByName(all, query, { text });
  return rankByName(all, intent.artist, { text, focused: true, also: query });
}

async function radioFor(query, intent, plain, signal) {
  if (!intent) return plain;
  const extra = sameText(query, intent.text) ? null : searchStations(intent.text, signal);
  const sets = await settled([plain, extra].filter(Boolean));
  if (!sets.values.length) throw sets.error;
  const all = uniqueBy(sets.values.flat());
  return rankByName(all, intent.artist, { text: (s) => `${s.title} ${s.artist}`, focused: true, also: query });
}

// Search used by the Search tab. `exact` skips artist resolution ("Search
// instead for ..."). Each source fails on its own; only when every section
// fails does the search fail. The result names the query, filter and mode it
// answers, so the screen never shows it for a newer one.
export async function searchAll(query, filter = "All", signal, { exact = false } = {}) {
  const want = (f) => filter === "All" || filter === f;
  // The plain searches start right away; the artist lookup runs alongside them.
  const plain = {
    songs: want("Songs") ? early(searchTracks(query, signal)) : null,
    artists: want("Artists") ? early(searchArtists(query, signal)) : null,
    playlists: want("Playlists") ? early(searchPlaylists(query, signal)) : null,
    radio: want("Radio") ? early(searchStations(query, signal)) : null,
  };
  // Checking a guess needs the plain songs, even when only artists were asked for.
  let probe = plain.songs;
  const songsProbe = () => probe || (probe = early(searchTracks(query, signal)));
  const intent = exact ? null : await resolveIntent(query, signal, songsProbe);
  const accounts =
    intent && (plain.songs || plain.artists)
      ? early(sameText(query, intent.artist) && plain.artists ? plain.artists : searchArtists(intent.artist, signal))
      : null;
  const sections = await Promise.allSettled([
    plain.songs ? songsFor(query, intent, plain.songs, accounts, signal) : [],
    plain.artists ? artistsFor(query, intent, plain.artists, accounts) : [],
    plain.playlists ? playlistsFor(query, intent, plain.playlists, signal) : [],
    plain.radio ? radioFor(query, intent, plain.radio, signal) : [],
  ]);
  if (signal?.aborted) throw abortError();
  const failed = sections.filter((s, i) => s.status === "rejected" && Object.values(plain)[i]);
  if (failed.length && failed.length === Object.values(plain).filter(Boolean).length) throw failed[0].reason;
  const [songs, artists, playlists, radio] = sections.map((s) => (s.status === "fulfilled" ? s.value : []));
  return { query, filter, exact, songs, artists, playlists, radio, corrected: intent?.corrected ? intent.text : null };
}
