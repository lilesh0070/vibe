import { AppState, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { streamHostCount, streamUrl } from "./audius";
import { abortError, isAbort } from "./net";
import { MIN_AUDIO_BYTES, MIN_FREE_BYTES, audioProblem, baseName, decodeBase64, downloadSource, fileNameFor } from "../utils/downloads";
import { header } from "../utils/http";
import { megabytes } from "../utils/release";

// Downloads are app-private: they live in Vibe's own documents folder (not the cache, which
// Android may clear when space runs low) and only Vibe plays them.
const DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}downloads/` : null;

export const canDownload = Platform.OS !== "web" && !!DIR;

const fail = (message, code) => Object.assign(new Error(message), { code });

// With intermediates an existing folder is fine; a real failure surfaces when the transfer starts.
const ensureDir = () => FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});

// Only ever touch files inside the downloads folder, whatever a saved URI says.
const inDir = (uri) => {
  const name = baseName(uri);
  return name ? DIR + name : null;
};

const sourcesFor = (track) =>
  downloadSource(track) === "audius"
    ? Array.from({ length: streamHostCount }, (_, i) => streamUrl(track.id, i))
    : [track.url];

// A write that fails for lack of space leaves next to nothing free.
const FULL_BYTES = 16 * 1024 * 1024;

const freeBytes = () => FileSystem.getFreeDiskStorageAsync().catch(() => null);

async function checkSpace() {
  // An unknown answer should not block downloads; a transfer that fills the disk is caught below.
  const free = await freeBytes();
  if (typeof free === "number" && free < MIN_FREE_BYTES)
    throw fail(`Only ${megabytes(free)} free on this phone. Free up some space to download songs.`, "space");
}

// Ask before the partial file is deleted, which frees the space again.
async function ranOutOfSpace(e) {
  if (/ENOSPC|no space/i.test(e?.message || "")) return true;
  const free = await freeBytes();
  return typeof free === "number" && free < FULL_BYTES;
}

const readHead = (uri) =>
  FileSystem.readAsStringAsync(uri, { encoding: "base64", position: 0, length: 16 })
    .then(decodeBase64)
    .catch(() => []);

// iOS runs these in a background session, which never gives up while offline, so one song could
// hold its queue slot forever. Give up after a minute of foreground time without progress;
// progress events stop while the app is in the background, so that time doesn't count.
const STALL_TICK_MS = 5000;
const STALL_MS = 60000;

function watchStall(onStall) {
  let quiet = 0;
  const timer = setInterval(() => {
    quiet = AppState.currentState === "active" ? quiet + STALL_TICK_MS : 0;
    if (quiet < STALL_MS) return;
    clearInterval(timer);
    onStall();
  }, STALL_TICK_MS);
  return { touch: () => (quiet = 0), stop: () => clearInterval(timer) };
}

// One attempt from one URL. Resolves to the saved size; rejects with code "invalid" when the
// reply is not a song (error pages still "succeed" and land in the file).
async function transfer(url, fileUri, onProgress, signal) {
  let stalled = false;
  const task = FileSystem.createDownloadResumable(url, fileUri, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
    stall?.touch();
    if (totalBytesExpectedToWrite > 0) onProgress?.(Math.min(1, totalBytesWritten / totalBytesExpectedToWrite));
  });
  const cancel = () => task.cancelAsync().catch(() => {});
  const stall =
    Platform.OS === "ios"
      ? watchStall(() => {
          stalled = true;
          cancel();
        })
      : null;
  signal?.addEventListener?.("abort", cancel);
  try {
    // Resolves empty when cancelled; after a stall any rejection just means "stopped".
    const result = await task.downloadAsync().catch((e) => {
      if (!stalled) throw e;
    });
    if (signal?.aborted) throw abortError();
    if (!result || stalled) throw fail("Transfer stopped", "network");
    const info = await FileSystem.getInfoAsync(fileUri);
    const size = info.exists && !info.isDirectory ? info.size : 0;
    const problem = audioProblem({
      status: result.status,
      // Android reports the type only as a header; iOS also fills mimeType.
      contentType: header(result.headers, "content-type") || result.mimeType || "",
      contentLength: Number(header(result.headers, "content-length")) || 0,
      size,
      head: size ? await readHead(fileUri) : [],
    });
    if (problem) throw fail(problem, "invalid");
    return size;
  } finally {
    stall?.stop();
    signal?.removeEventListener?.("abort", cancel);
    // downloadAsync never drops its progress listener; only cancelAsync does, and on a
    // finished task that is all it does.
    cancel();
  }
}

// Saves a song for offline play and resolves to { uri, bytes }. Audius streams try every
// API host like the player does; Internet Archive tracks use their direct MP3 link.
// Aborting `signal` cancels the transfer and rejects with an AbortError. Nothing is left on
// disk when it fails or is cancelled.
export async function downloadTrack(track, { onProgress, signal } = {}) {
  if (!canDownload) throw fail("Downloads work in the Vibe app on your phone.", "unsupported");
  if (!downloadSource(track)) throw fail("Live radio can't be downloaded.", "unsupported");
  if (signal?.aborted) throw abortError();
  await checkSpace();
  await ensureDir();
  const fileUri = DIR + fileNameFor(track.id);
  let last;
  for (const url of sourcesFor(track)) {
    if (signal?.aborted) break;
    try {
      const bytes = await transfer(url, fileUri, onProgress, signal);
      onProgress?.(1);
      return { uri: fileUri, bytes };
    } catch (e) {
      last = e;
      // A disk that filled up mid-song fails like a dropped connection; the next host would
      // only fill it again, and every later song in the queue would too.
      const full = !isAbort(e) && !signal?.aborted && e?.code !== "invalid" && (await ranOutOfSpace(e));
      await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
      if (full) throw fail("Your phone ran out of space for this song. Free up some space to download songs.", "space");
      if (isAbort(e)) break;
      onProgress?.(0);
    }
  }
  if (signal?.aborted || isAbort(last)) throw abortError();
  if (last?.code === "invalid") throw fail("This song isn't available to download right now.", "invalid");
  throw fail("The download didn't finish. Check your connection and try again.", "network");
}

export async function removeDownload(uri) {
  const file = canDownload && inDir(uri);
  if (file) await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {});
}

export async function removeAllDownloads() {
  if (canDownload) await FileSystem.deleteAsync(DIR, { idempotent: true }).catch(() => {});
}

// Startup check. `entries` are the finished downloads from storage; resolves to a Map of
// id -> { uri, bytes } for the ones whose file is still there and whole. Every other file in
// the folder (a partial left by a download the app was closed during) is deleted.
export async function verifyDownloads(entries) {
  if (!canDownload) return new Map();
  await ensureDir();
  const listed = await FileSystem.readDirectoryAsync(DIR).catch(() => null);
  // Can't look: trust the saved list rather than dropping every song.
  if (!listed) return new Map(entries.map((e) => [e.id, { uri: inDir(e.uri), bytes: e.bytes }]));
  const names = new Set(listed);
  const kept = new Map();
  await Promise.all(
    entries.map(async (e) => {
      const name = baseName(e.uri);
      if (!names.has(name)) return;
      const info = await FileSystem.getInfoAsync(DIR + name).catch(() => null);
      if (!info) {
        kept.set(e.id, { uri: DIR + name, bytes: e.bytes });
        return;
      }
      if (!info.exists || info.isDirectory || info.size < MIN_AUDIO_BYTES) return;
      if (e.bytes > 0 && info.size !== e.bytes) return;
      kept.set(e.id, { uri: DIR + name, bytes: info.size });
    }),
  );
  const keep = new Set([...kept.values()].map((k) => baseName(k.uri)));
  await Promise.all(
    listed.filter((n) => !keep.has(n)).map((n) => FileSystem.deleteAsync(DIR + n, { idempotent: true }).catch(() => {})),
  );
  return kept;
}
