// Hinglish-tolerant name matching. People type Indian names the way they say
// them ("sidhu moselvala", "karan ojla", "arjit sing"), and uploaders spell them
// every way too, so words are folded to a rough phonetic skeleton and compared
// with a small, vowel-forgiving edit distance.
// Kept free of imports so the Node tests can load it directly.

// Letters of every script survive ("любовь", "夜の街", "عشق"), so titles written
// in them stay distinct. Explicit ranges rather than \p{L}, which Hermes may lack;
// × and ÷ are left out because "Song × Artist" uses × as a separator.
const SPLIT =
  /[^a-z0-9À-ÖØ-öø-ɏͰ-ԯ֐-ۿݐ-ݿऀ-෿฀-໿ᄀ-ᇿḀ-ỿ぀-ヿ㄰-㆏㐀-䶿一-鿿가-힯豈-﫿]+/;
const VOWELS = "aeiouy";

// Words that describe a search rather than name anything in it.
const FILLER = new Set(
  "song songs gana gaana gane gaane geet new latest hit hits top best all by and the of ke ka ki mp3 audio video official full lyrics lyrical hd".split(" "),
);

// Surnames and labels shared by many artists: matching only these is not enough
// to decide which artist someone meant.
const COMMON = new Set(
  "singh kumar sharma khan kaur gill sandhu sidhu dhillon maan yadav choudhary chaudhary verma malik ali lal raj jain pandey tiwari mishra gupta patel shah rao das punjabi haryanvi hindi bhojpuri desi".split(" "),
);

const isVowel = (c) => VOWELS.includes(c);

export function words(text = "") {
  let s = String(text ?? "").toLowerCase();
  // normalize() is a native round trip on Android's Hermes; plain ASCII never needs it.
  if (/[^\x00-\x7f]/.test(s)) {
    try {
      s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    } catch {}
  }
  return s.split(SPLIT).filter(Boolean);
}

const folded = new Map();

// w/v, z/j, ph/f, silent h after consonants (bh, dh, kh, sh, singh), au/o,
// oo/u, ee/i, a "y" glide (nyoliwala, noliywala), doubled letters, trailing a.
export function foldWord(word) {
  if (!/^[a-z0-9]+$/.test(word)) return word;
  const hit = folded.get(word);
  if (hit !== undefined) return hit;
  let s = word
    .replace(/ph/g, "f")
    .replace(/w/g, "v")
    .replace(/z/g, "j")
    .replace(/q/g, "k")
    .replace(/ck/g, "k")
    .replace(/([^aeiou])h+/g, "$1")
    .replace(/au/g, "o")
    .replace(/oo/g, "u")
    .replace(/ee/g, "i")
    .replace(/([^aeiouy])y(?=[aeiou])/g, "$1")
    .replace(/iy(?![aeiou])/g, "i")
    .replace(/(.)\1+/g, "$1")
    .replace(/y$/, "i");
  if (s.length > 3) s = s.replace(/a$/, "");
  if (folded.size > 5000) folded.clear();
  folded.set(word, s);
  return s;
}

export const foldName = (text) => words(text).map(foldWord).join(" ");

export const sameName = (a, b) => foldName(a).replace(/ /g, "") === foldName(b).replace(/ /g, "");

// Levenshtein where vowels are cheap: romanised Hindi mostly disagrees on vowels.
function distance(a, b, max) {
  const cost = (c) => (isVowel(c) ? 0.5 : 1);
  let prev = [0];
  for (let j = 1; j <= b.length; j++) prev[j] = prev[j - 1] + cost(b[j - 1]);
  for (let i = 1; i <= a.length; i++) {
    const cur = [prev[0] + cost(a[i - 1])];
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const x = a[i - 1];
      const y = b[j - 1];
      const swap = x === y ? 0 : isVowel(x) && isVowel(y) ? 0.5 : 1;
      cur[j] = Math.min(prev[j - 1] + swap, prev[j] + cost(x), cur[j - 1] + cost(y));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return Infinity;
    prev = cur;
  }
  return prev[b.length];
}

// Short words must match exactly, so "sidhu" never matches "side". Fuzzy matches
// also keep the first letter: people rarely get that wrong, English words often differ there.
function close(p, t, prefix) {
  if (p === t) return { exact: true };
  if (prefix && p.length >= 3 && t.startsWith(p)) return { exact: false };
  // Only romanised words are respelled; other scripts are written one way.
  if (/[^a-z0-9]/.test(p + t) || p[0] !== t[0]) return null;
  const shorter = Math.min(p.length, t.length);
  const max = shorter <= 4 ? 0 : shorter <= 6 ? 1 : 2;
  if (!max || Math.abs(p.length - t.length) > max * 2) return null;
  return distance(p, t, max) <= max ? { exact: false } : null;
}

const MAX_SPAN = 3;

// Every run of up to three adjacent words, joined then folded, so "moose wala"
// meets "moosewala" and "OLD_SKOOL__karanaujla" still contains Karan Aujla.
function spans(list) {
  const out = [];
  for (let i = 0; i < list.length; i++)
    for (let k = 1; k <= MAX_SPAN && i + k <= list.length; k++)
      out.push({ from: i, to: i + k, key: foldWord(list.slice(i, i + k).join("")) });
  return out;
}

const prepared = new Map();

export function prepare(text) {
  if (text && typeof text === "object") return text;
  const key = String(text ?? "");
  const hit = prepared.get(key);
  if (hit) return hit;
  const list = words(key);
  const value = { words: list, spans: spans(list) };
  if (prepared.size > 3000) prepared.clear();
  prepared.set(key, value);
  return value;
}

export function terms(query) {
  const list = words(query);
  const kept = list.filter((w) => !FILLER.has(w));
  return kept.length ? kept : list;
}

// How much of `pattern` is found in `text` ("query" share), how much of `text`
// it accounts for ("text" share), which words of `text` it found ("matched"),
// and whether any of it needed fuzzing.
export function coverage(pattern, text, { prefix = false } = {}) {
  const p = Array.isArray(pattern) ? pattern : terms(pattern);
  const t = prepare(text);
  const usedText = new Set();
  const missed = [];
  const hits = [];
  let covered = 0;
  let fuzzy = false;
  for (let i = 0; i < p.length; ) {
    let step = 0;
    for (let k = Math.min(MAX_SPAN, p.length - i); k >= 1 && !step; k--) {
      const key = foldWord(p.slice(i, i + k).join(""));
      const last = prefix && i + k === p.length;
      for (const s of t.spans) {
        const m = close(key, s.key, last);
        if (!m) continue;
        step = k;
        fuzzy = fuzzy || !m.exact;
        for (let x = s.from; x < s.to; x++) usedText.add(x);
        break;
      }
    }
    if (step) {
      hits.push(...p.slice(i, i + step));
      covered += step;
      i += step;
    } else {
      missed.push(p[i]);
      i += 1;
    }
  }
  return {
    query: p.length ? covered / p.length : 0,
    text: t.words.length ? usedText.size / t.words.length : 0,
    fuzzy,
    hits,
    missed,
    matched: [...usedText].sort((a, b) => a - b).map((x) => t.words[x]),
  };
}

export const nameMatches = (query, text, options) => {
  const p = terms(query);
  return p.length > 0 && coverage(p, text, options).query === 1;
};

// Every typed word present as typed (spelling folds aside). Used to keep what
// the user wrote next to a corrected search without letting "diljit" pull in "Daljit".
export const saysExactly = (query, text) => {
  const p = terms(query);
  if (!p.length) return false;
  const c = coverage(p, text);
  return c.query === 1 && !c.fuzzy;
};

// Decides whether a query names this artist confidently enough to search for
// them instead: the whole query must be the name (spelling aside), or most of
// it. "sub" is not "Shubh", "punjabi" is not "Raju Punjabi", "lofi" is nobody.
// `weak` marks a single word that is respelled or only part of the name
// ("diljit", "jasmine"): the caller should check it against real results.
export function matchArtist(query, name, { strict = false } = {}) {
  const p = terms(query);
  if (!p.length) return null;
  const c = coverage(p, name);
  if (!c.hits.length) return null;
  const nameWords = words(name);
  const whole = c.query === 1 && c.text === 1;
  if (strict && !whole) return null;
  // Extra typed words are fine once the whole name is there ("sidhu moselvala 295").
  if (c.query < 1 && (c.text < 1 || c.query < 0.5)) return null;
  // A respelled word that stands for half the name or less is more likely a
  // word of its own: "kesariya" is a song, not Khesari Lal Yadav.
  if (c.fuzzy && c.text <= 0.5) return null;
  if (!whole) {
    // Checked on the name's side, so "dhilon" is still just a surname.
    if (c.matched.every((w) => COMMON.has(w))) return null;
    const share = c.hits.map(foldWord).join("").length / nameWords.map(foldWord).join("").length;
    if (c.query === 1 && share < 0.5) return null;
  }
  const typed = p.join("");
  if (c.hits.every((w) => foldWord(w).length <= 3) && distance(typed, nameWords.join(""), 1) > 1) return null;
  return {
    missed: c.missed,
    whole,
    fuzzy: c.fuzzy,
    partial: c.text < 1,
    weak: c.hits.length === 1 && (c.fuzzy || !whole),
    score: c.query * 2 + c.text - (c.fuzzy ? 0.25 : 0),
  };
}

// Best confident match from a curated list ({name, aliases}). A name typed
// exactly beats a respelled one ("jasmine" is Jasmine Sandlas before Jass Manak);
// earlier entries win ties.
export function bestArtist(query, artists) {
  let best = null;
  for (const artist of artists) {
    for (const name of [artist.name, ...(artist.aliases || [])]) {
      const m = matchArtist(query, name);
      if (m && (!best || (best.fuzzy && !m.fuzzy) || (best.fuzzy === m.fuzzy && m.score > best.score))) best = { ...m, artist };
    }
  }
  return best;
}

const SCRIPTS = /[ऀ-෿]/;
const DESI_WORDS = /\b(punjabi|punjab|haryanvi|haryana|hindi|bollywood|desi|bhojpuri|bhangra|bhajan|ghazal|sufi|qawwali|filmi)\b/i;

export const indianSignal = (text = "") => SCRIPTS.test(text) || DESI_WORDS.test(text);

const LANGUAGE_CODES = { pan: "Punjabi", pa: "Punjabi", hin: "Hindi", hi: "Hindi", bho: "Bhojpuri", bgc: "Haryanvi" };

// The app's genre names for Indian music; "Desi" also feeds the Desi mix.
export function detectLanguage(text = "", codes = []) {
  for (const code of [].concat(codes || []).map(String)) {
    const name = code.toLowerCase();
    const lang = LANGUAGE_CODES[name] || (/^(punjabi|hindi|haryanvi|bhojpuri)$/.test(name) && name[0].toUpperCase() + name.slice(1));
    if (lang) return lang;
  }
  const s = String(text);
  if (/[਀-੿]/.test(s) || /\b(punjabi|punjab|bhangra)\b/i.test(s)) return "Punjabi";
  if (/\b(haryanvi|haryana|haryanavi)\b/i.test(s)) return "Haryanvi";
  if (/\bbhojpuri\b/i.test(s)) return "Bhojpuri";
  if (/[ऀ-ॿ]/.test(s) || /\b(hindi|bollywood|filmi)\b/i.test(s)) return "Hindi";
  return null;
}

const INDIAN_GENRES = /bollywood|indian|punjabi|haryanvi|bhojpuri|tamil|telugu|kannada|malayalam|marathi|bengali|gujarati|rajasthani|ghazal|sufi|carnatic|hindustani|devotional|desi/i;

export const isIndianGenre = (genre = "") => INDIAN_GENRES.test(genre);

const TLD = "com|in|net|org|co|cc|me|info|io|fm|pk|mobi|xyz|live|club|site";
// Inside brackets anything shaped like a domain is a tag, "_320(PagalWorld.com.se)" included.
const SITE_TAG = /(?:_\d{2,3})?\s*[([]\s*(?:www\.)?[\w-]+(?:\.[a-z]{2,6})+\s*[)\]]/gi;
const SITE_EDGE = new RegExp(`^(?:www\\.)?[\\w-]{3,}\\.(?:${TLD})\\b|\\b(?:www\\.)?[\\w-]{3,}\\.(?:${TLD})$`, "gi");
const SITE_NAMES =
  /[([]?\b(?:pagal\s?world|pagal\s?new|mr-?jatt|djpunjab|djjohal|pendujatt|riskyjatt|mymp3song|songspk|djmaza|wapking|y\s?2mate|onlymp3|geet\s?mp\s?3)\b(?:\.\w{2,4})?[)\]]?/gi;

// Download-site watermarks and bitrate tags that fan uploads carry:
// "(DJJOhAL.Com)", "[DJHR.IN]", "y2mate.com - ", "- PagalNew", "320 Kbps", "(48k)",
// and the "www." a cut-off watermark leaves behind.
export const stripSiteTags = (title = "") =>
  String(title)
    .replace(SITE_TAG, " ")
    .replace(SITE_NAMES, " ")
    .replace(SITE_EDGE, " ")
    .replace(/(^|\s)www\.?(?=\s|$)/gi, " ")
    .replace(/\(\s*\d{2,3}\s*k(?:bps)?\s*\)/gi, " ")
    .replace(/\b\d{2,3}\s*kbps\b/gi, " ")
    .replace(/^[\s\-–—|:·]+|[\s\-–—|:·]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const NOISE_PARENS = /\s*[([](?:[^)\]]*\b(?:official|music video|lyrical|lyric video|lyrics|full song|full video|full audio|audio song|video song|visuali[sz]er|hd|4k)\b[^)\]]*)[)\]]/gi;
const LABEL_PART = /^(?:(?:new|latest|superhit|super hit|hit)\s+)*(?:punjabi|haryanvi|hindi|bhojpuri|bollywood|desi)?\s*(?:songs?|gaana|gana|video|audio)?\s*(?:\d{4})?$/i;
const LABEL_TAIL = /\s+(?:(?:new|latest)\s+)?(?:punjabi|haryanvi|hindi|bhojpuri|bollywood)(?:\s+songs?)?$/i;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Archive uploads are titled like "Dhanda Nyoliwala - Zigane (Official Music Video) | Label"
// or "Paapi Sidhu Moose Wala". The artist is shown on its own line, so keep just
// the song name. `artist` may list several spellings.
export function tidyTitle(title = "", artist = "") {
  const names = [].concat(artist).filter(Boolean);
  const raw = stripSiteTags(title);
  const first = raw.split(/\s+\|\s+/).find((s) => s.trim()) || raw;
  const bare = first.replace(NOISE_PARENS, "").trim();
  const parts = bare.split(/\s+[-–—:!]\s+|\s*[!#]\s*/).map((s) => s.trim()).filter(Boolean);
  const own = (part) => names.some((n) => nameMatches(part, n) && coverage(part, n).text >= 0.5);
  let kept = parts.filter((part) => !own(part) && !LABEL_PART.test(part)).join(" - ");
  for (const n of names) {
    const name = words(n);
    if (name.length > 1) kept = kept.replace(new RegExp(`(^|\\s)${name.map(escape).join("[\\s_-]*")}(?=\\s|$)`, "i"), " ");
  }
  kept = kept.replace(/\s{2,}/g, " ").trim().replace(LABEL_TAIL, "").trim();
  // Nothing but "Video" or "New Song 2024" left: the full title says more.
  if (LABEL_PART.test(kept)) kept = "";
  return kept || bare || raw.trim() || "Untitled";
}

const PARTS = /\s+[-–—:]\s+|\s*[|·]\s*/;
const CREDIT = new Set("x ft feat featuring prod official offical officia full video audio lyric lyrics lyrical visual visualizer visualiser latest".split(" "));

// The song name in each part of an upload title, given whose song it is:
// brackets go, and a part ends where credits, "Official Video" or the artist's
// own name begin. "LEVELS Sidhu Moose Wala x Sunny Malton" and "LEVELS Official
// Video ft Sunny Malton" are both "levels"; parts that only name the artist or
// a label ("New Haryanvi Song 2023") give nothing.
function songParts(title, artist) {
  const name = words(artist);
  const whole = foldWord(name.join(""));
  // Joined runs too, so "Moosewala" counts as the artist's own word.
  const own = new Set(spans(name).map((s) => s.key));
  const nameAt = (list, i) => {
    for (let k = 1; k <= name.length + 1 && i + k <= list.length; k++) if (close(foldWord(list.slice(i, i + k).join("")), whole)) return true;
    return false;
  };
  const keys = [];
  for (const part of title.split(PARTS)) {
    if (LABEL_PART.test(part.trim())) continue;
    const list = words(part.replace(/[([{][^)\]}]*[)\]}]/g, " "));
    const end = list.findIndex((w, i) => i > 0 && (CREDIT.has(w) || nameAt(list, i)));
    const key = (end > 0 ? list.slice(0, end) : list)
      .filter((w) => !FILLER.has(w) && !CREDIT.has(w) && !/^20\d\d$/.test(w))
      .map(foldWord)
      .filter((w) => !own.has(w) && w !== whole);
    if (key.length) keys.push(key.join(" "));
  }
  return keys;
}

// Near-identical uploads ("Vaar-Sidhu Moose Wala" vs "Vaar") share a key. With
// the artist only the song name counts; without one every word does, so an
// uploader's "Song (Remix)" stays apart from "Song". Titles with no usable
// words fall back to the plain lowercased title, never to an empty key.
export function titleKey(title = "", artist = "") {
  const clean = stripSiteTags(title);
  const plain = clean.toLowerCase().replace(/\s+/g, " ").trim();
  if (artist) return songParts(clean, artist).join(" ") || plain;
  const all = words(clean).filter((w) => !FILLER.has(w) && !/^(ft|feat|kbps|music|song|20\d\d)$/.test(w));
  return all.map(foldWord).join(" ") || plain;
}

const startsWith = (long, short) => long === short || long.startsWith(`${short} `);

// The same song uploaded twice: the same key, or the same song name before the
// credits ("295" and "295 kid musetape") at nearly the same length.
function sameSong(a, b) {
  if (a.full === b.full) return true;
  const related = a.head === b.head || startsWith(a.full, b.full) || startsWith(b.full, a.full);
  return related && (!a.seconds || !b.seconds || Math.abs(a.seconds - b.seconds) <= 20);
}

function songKey(track, artist) {
  const clean = stripSiteTags(track.title || "");
  const parts = songParts(clean, artist);
  const full = parts.join(" ") || clean.toLowerCase().trim();
  return { full, head: parts[0] || full, seconds: track.duration || 0 };
}

// Uploads that are not the song itself; kept when the search asks for them.
// File names join words with "_", which \b does not split on.
const NOISE = /(?:^|[^a-z])(?:karaoke|instrumental|ringtone|whatsapp|status[\s_-]+video|promo|teaser)(?![a-z])/i;

export const isNoise = (text = "", query = "") => NOISE.test(text) && !NOISE.test(query);

// Under a minute is a status clip or a ringtone, not a song.
export const MIN_SONG_SECONDS = 60;

// "205.08", "3:25" or "1:02:03" -> seconds.
export function parseDuration(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parts = String(value ?? "").trim().split(":").map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((total, n) => total * 60 + n, 0);
}

// `typed` is what the user wrote when `query` is the corrected search, so a
// wrong correction never hides what was asked for.
export function trackMatches(track, { query = "", artist = "", typed = "" } = {}) {
  const text = `${track.title || ""} ${track.artist || ""}`;
  const loose = `${text} ${track.genre || ""}`;
  return Boolean(
    (artist && nameMatches(artist, text)) ||
      (query && nameMatches(query, loose, { prefix: true })) ||
      (typed && typed !== query && saysExactly(typed, loose)),
  );
}

// Higher is better. The artist (as uploader or in the title) dominates, then the
// typed words, a known song title, Indian-language signals, and finally plays.
export function relevanceScore(track, { query = "", artist = "", songs = [], typed = "" } = {}) {
  const title = track.title || "";
  const text = `${title} ${track.artist || ""}`;
  let score = 0;
  if (artist && nameMatches(artist, text)) score += 10;
  const asked = [query, typed].filter(Boolean).map((q) => coverage(q, `${text} ${track.genre || ""}`, { prefix: true }).query);
  if (asked.length) {
    const best = Math.max(...asked);
    score += best === 1 ? 6 : best * 3;
  }
  if (songs.length) {
    const flat = foldName(title).replace(/ /g, "");
    if (songs.some((s) => s.length >= 3 && flat.includes(s))) score += 2;
  }
  if (indianSignal(`${text} ${track.genre || ""}`)) score += 1.5;
  score += Math.min(Math.log10((track.plays || 0) + 1), 6) * 0.25;
  if (track.duration > 0 && track.duration < 60) score -= 4;
  return score;
}

// Folded, space-free song titles for relevanceScore's `songs`.
export const songKeys = (titles = []) => [...new Set(titles.map((t) => foldName(t).replace(/ /g, "")).filter((k) => k.length >= 3))];

// focused: the query resolved to an artist, so tracks that are not theirs (or do
// not match the words) are dropped once there are enough that do, and so are
// clips, karaoke tracks and second uploads of the same song.
export function rankTracks(tracks, { query = "", artist = "", songs = [], typed = "", focused = false, keep = 4, enough = 8 } = {}) {
  const want = { query, artist, songs, typed };
  const asked = `${query} ${typed}`;
  const pool = focused
    ? tracks.filter((t) => !(t.duration > 0 && t.duration < MIN_SONG_SECONDS) && !isNoise(t.title, asked))
    : tracks;
  const scored = pool.map((t, i) => ({ t, i, match: trackMatches(t, want), score: focused ? relevanceScore(t, want) : 0 }));
  scored.sort((a, b) => b.match - a.match || (focused ? b.score - a.score : 0) || a.i - b.i);
  const seen = new Set();
  const kept = [];
  const unique = scored.filter(({ t }) => {
    if (focused) {
      const key = songKey(t, artist);
      if (kept.some((k) => sameSong(k, key))) return false;
      kept.push(key);
      return true;
    }
    const key = `${titleKey(t.title)}|${foldName(t.artist)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const hits = unique.filter((s) => s.match);
  if (!focused) return unique.map((s) => s.t);
  const rest = hits.length >= enough ? [] : unique.filter((s) => !s.match).slice(0, keep);
  return [...hits, ...rest].map((s) => s.t);
}

// Artists, playlists and stations: items whose name contains the target first;
// unrelated ones only fill in when matches are scarce. For a resolved artist the
// closest names lead, then anything matching what was typed (`also`);
// otherwise the service's own order is kept.
export function rankByName(items, target, { text, focused = false, enough = 3, also = "" } = {}) {
  const scored = items.map((item, i) => ({ item, i, c: coverage(target, text(item)) }));
  const hits = scored.filter((s) => s.c.query === 1).sort((a, b) => (focused ? b.c.text - a.c.text : 0) || a.i - b.i);
  const rest = scored.filter((s) => s.c.query < 1);
  if (focused) {
    const typed = also ? rest.filter((s) => saysExactly(also, text(s.item))) : [];
    return [...hits, ...typed].map((s) => s.item);
  }
  if (hits.length >= enough) return hits.map((s) => s.item);
  return [...hits, ...rest].map((s) => s.item);
}
