// Pure helpers for offline downloads. No imports, so node tests can load this file directly.

// Below this much free space a download would crowd out the phone's own updates and photos.
export const MIN_FREE_BYTES = 150 * 1024 * 1024;
// Two seconds of a 128 kbps MP3; anything smaller is an error page or an empty reply.
export const MIN_AUDIO_BYTES = 32 * 1024;

const MAX_NAME = 100;

// Older saved Audius tracks have no source. Radio is live and never downloadable.
export const downloadSource = (track) => {
  if (track?.kind !== "track" || !track.id) return null;
  const source = track.source || "audius";
  if (source === "audius") return "audius";
  if (source === "archive" && /^https?:\/\//i.test(track.url || "")) return "archive";
  return null;
};

export const isDownloadable = (track) => downloadSource(track) !== null;

// 53-bit string hash (cyrb53); only used to shorten very long names.
const hash = (s) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

// Track id -> file name. Lower-case letters, digits and "-" stay; capitals become "_" plus the
// letter and anything else "~" plus four hex digits. That keeps every id distinct (also on
// case-insensitive disks, where "r96NV" and "r96nv" would otherwise clash) and leaves nothing
// a file:// URI or a file system could misread. Names longer than MAX_NAME are cut and get a
// hash; they are always longer than any uncut name, so the two kinds never collide.
export const fileNameFor = (id) => {
  const s = String(id ?? "");
  let name = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/[a-z0-9-]/.test(c)) name += c;
    else if (/[A-Z]/.test(c)) name += `_${c.toLowerCase()}`;
    else name += `~${s.charCodeAt(i).toString(16).padStart(4, "0")}`;
  }
  if (name.length > MAX_NAME) name = `${name.slice(0, MAX_NAME)}-${hash(s)}`;
  return `${name || "track"}.mp3`;
};

export const baseName = (uri) =>
  String(uri || "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/^.*\//, "");

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export const decodeBase64 = (text) => {
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const c of String(text || "")) {
    const n = B64.indexOf(c);
    if (n < 0) continue;
    value = (value << 6) | n;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  return bytes;
};

const startsWith = (bytes, text, at = 0) => [...text].every((c, i) => bytes[at + i] === c.charCodeAt(0));

// The first bytes of a file: "audio" for known audio containers, "text" for HTML/JSON/XML
// error pages, otherwise "unknown".
export const sniff = (bytes = []) => {
  if (!bytes.length) return "unknown";
  if (startsWith(bytes, "ID3") || startsWith(bytes, "OggS") || startsWith(bytes, "fLaC") || startsWith(bytes, "RIFF")) return "audio";
  if (startsWith(bytes, "ftyp", 4)) return "audio";
  // MPEG audio (MP3) and ADTS AAC frames start with 11 set sync bits.
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "audio";
  const first = bytes.find((b) => b !== 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0xef && b !== 0xbb && b !== 0xbf);
  if (first === 0x3c || first === 0x7b || first === 0x5b) return "text"; // < { [
  return "unknown";
};

const TEXT_TYPE = /^text\/|json|html|xml/i;

// Why a finished transfer is not a playable song, or null when it looks fine.
export const audioProblem = ({ status, contentType = "", contentLength = 0, size = 0, head = [] }) => {
  if (!(status >= 200 && status < 300)) return `HTTP ${status}`;
  if (TEXT_TYPE.test(contentType)) return `Not audio (${contentType})`;
  if (size < MIN_AUDIO_BYTES) return "File too small";
  if (contentLength > 0 && size !== contentLength) return "Incomplete download";
  if (sniff(head) === "text") return "Not audio";
  return null;
};

// 0..100 in whole steps, so subscribers re-render at most a hundred times per song.
export const percent = (written, total) =>
  total > 0 ? Math.max(0, Math.min(100, Math.floor((written / total) * 100))) : 0;

const isDone = (e) => e?.status === "done";
export const isPending = (e) => e?.status === "queued" || e?.status === "downloading";

export const newestFirst = (entries) =>
  Object.values(entries || {})
    .filter(isDone)
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

export const totalBytes = (entries) =>
  (Array.isArray(entries) ? entries : Object.values(entries || {})).reduce((sum, e) => sum + (isDone(e) ? Number(e.bytes) || 0 : 0), 0);

// Saved list -> { id: entry }. Songs that were waiting or mid-download when the app closed
// come back queued; failed ones are dropped (they were only ever a hint to retry).
export const restoreEntries = (saved) => {
  const out = {};
  for (const e of Array.isArray(saved) ? saved : []) {
    if (!e || typeof e.id !== "string" || !e.id || e.track?.id !== e.id || !isDownloadable(e.track)) continue;
    const base = { id: e.id, track: e.track, addedAt: Number(e.addedAt) || 0, error: null };
    if (e.status === "queued" || e.status === "downloading") out[e.id] = { ...base, uri: null, bytes: 0, status: "queued" };
    else if ((!e.status || e.status === "done") && typeof e.uri === "string" && e.uri) out[e.id] = { ...base, uri: e.uri, bytes: Number(e.bytes) || 0, status: "done" };
  }
  return out;
};

// { id: entry } -> what goes to storage. Finished songs keep the plain shape
// { id, track, uri, bytes, addedAt }; unfinished ones are marked queued.
export const toSaved = (entries) =>
  Object.values(entries || {}).flatMap((e) => {
    if (isDone(e)) return [{ id: e.id, track: e.track, uri: e.uri, bytes: e.bytes, addedAt: e.addedAt }];
    if (isPending(e)) return [{ id: e.id, track: e.track, uri: null, bytes: 0, addedAt: e.addedAt, status: "queued" }];
    return [];
  });

// How far a collection is from being fully offline. statusOf(id) -> queued|downloading|done|error|null.
// Failed songs count as remaining, so "Download all" retries them.
export const collectionStatus = (tracks, statusOf) => {
  const seen = new Set();
  const s = { total: 0, done: 0, pending: 0, remaining: 0 };
  for (const t of tracks || []) {
    if (!isDownloadable(t) || seen.has(t.id)) continue;
    seen.add(t.id);
    s.total++;
    const status = statusOf(t.id);
    if (status === "done") s.done++;
    else if (status === "queued" || status === "downloading") s.pending++;
    else s.remaining++;
  }
  return s;
};

// Songs still to queue win over songs on their way: one song downloading from its own menu
// must not hide "Download all" for the rest of the playlist.
export const collectionLabel = (s) => {
  if (!s.total) return null;
  if (s.remaining) return `Download all · ${s.remaining}`;
  if (s.pending) return `Downloading ${Math.min(s.done + 1, s.total)} of ${s.total}`;
  return "Downloaded";
};

// Outcomes of a batch -> one line of feedback.
export const summarizeOutcomes = (outcomes) => {
  const s = { count: outcomes.length, done: 0, failed: 0, cancelled: 0, error: null, code: null };
  for (const o of outcomes) {
    if (o?.status === "done") s.done++;
    else if (o?.status === "cancelled") s.cancelled++;
    else if (o?.status === "error") {
      s.failed++;
      if (!s.error || o.code === "space") {
        s.error = o.error;
        s.code = o.code || null;
      }
    }
  }
  return s;
};
