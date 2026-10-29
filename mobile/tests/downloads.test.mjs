import test from "node:test";
import assert from "node:assert/strict";
import {
  MIN_AUDIO_BYTES,
  audioProblem,
  baseName,
  collectionLabel,
  collectionStatus,
  decodeBase64,
  downloadSource,
  fileNameFor,
  isDownloadable,
  newestFirst,
  percent,
  restoreEntries,
  sniff,
  summarizeOutcomes,
  toSaved,
  totalBytes,
} from "../src/utils/downloads.js";
import { header } from "../src/utils/http.js";

const audius = (id, extra = {}) => ({ kind: "track", source: "audius", id, title: id, artist: "a", ...extra });
const archive = (id) => ({ kind: "track", source: "archive", id, title: id, url: `https://archive.org/download/${id}` });
const radio = { kind: "radio", id: "station-1", url: "https://stream.example/live" };

test("only Audius and Internet Archive songs are downloadable", () => {
  assert.equal(downloadSource(audius("r96NV")), "audius");
  assert.equal(downloadSource({ kind: "track", id: "old" }), "audius");
  assert.equal(downloadSource(archive("ia:item/song.mp3")), "archive");
  assert.equal(downloadSource({ ...archive("ia:x/y.mp3"), url: undefined }), null);
  assert.equal(downloadSource(radio), null);
  assert.equal(downloadSource(null), null);
  assert.equal(isDownloadable({ kind: "track", source: "itunes", id: "1" }), false);
});

test("file names are safe and keep ids apart", () => {
  const ids = [
    "r96NV",
    "r96nv",
    "R96NV",
    "ia:item/Song Name.mp3",
    "ia:item/Song_Name.mp3",
    "ia:item/Song-Name.mp3",
    "ia:item/folder/Song Name.mp3",
    "ia:item/गाना.mp3",
    "ia:item/a~0020b",
    "ia:item/a b",
    "",
  ];
  const names = ids.map(fileNameFor);
  for (const n of names) {
    assert.match(n, /^[a-z0-9_~-]+\.mp3$/, n);
    assert.ok(n.length < 200, n);
  }
  assert.equal(new Set(names).size, ids.length);
  // Distinct even on a case-insensitive disk.
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, ids.length);
  assert.equal(fileNameFor("r96NV"), fileNameFor("r96NV"));
  assert.equal(fileNameFor("r96NV"), "r96_n_v.mp3");
});

test("very long ids are cut to a bounded, still distinct name", () => {
  const long = "ia:item/" + "Very Long Song Title ".repeat(20);
  const a = fileNameFor(long + "A.mp3");
  const b = fileNameFor(long + "B.mp3");
  assert.notEqual(a, b);
  assert.ok(a.length <= 120, `${a.length}`);
  assert.match(a, /^[a-z0-9_~-]+\.mp3$/);
});

test("base names come from file URIs", () => {
  assert.equal(baseName("file:///data/user/0/app/files/downloads/r96_n_v.mp3"), "r96_n_v.mp3");
  assert.equal(baseName("file:///a/b/"), "b");
  assert.equal(baseName(null), "");
});

test("headers are read regardless of case", () => {
  assert.equal(header({ "Content-Type": "audio/mpeg" }, "content-type"), "audio/mpeg");
  assert.equal(header({ "content-length": "42" }, "Content-Length"), "42");
  assert.equal(header(null, "content-type"), "");
});

test("base64 decodes the first bytes of a file", () => {
  assert.deepEqual(decodeBase64(Buffer.from("ID3\x04").toString("base64")), [0x49, 0x44, 0x33, 0x04]);
  assert.deepEqual(decodeBase64(""), []);
});

test("sniffing tells audio from error pages", () => {
  const bytes = (s) => [...Buffer.from(s, "latin1")];
  assert.equal(sniff(bytes("ID3\x04\x00")), "audio");
  assert.equal(sniff([0xff, 0xfb, 0x90, 0x64]), "audio");
  assert.equal(sniff(bytes("\x00\x00\x00\x20ftypM4A ")), "audio");
  assert.equal(sniff(bytes("OggS")), "audio");
  assert.equal(sniff(bytes("<html>")), "text");
  assert.equal(sniff(bytes("\r\n  <!DOCTYPE html>")), "text");
  assert.equal(sniff(bytes('{"code":400')), "text");
  assert.equal(sniff([0x00, 0x01]), "unknown");
  assert.equal(sniff([]), "unknown");
});

test("finished transfers are checked before they count as songs", () => {
  const ok = { status: 200, contentType: "audio/mpeg", contentLength: 3073105, size: 3073105, head: [0x49, 0x44, 0x33] };
  assert.equal(audioProblem(ok), null);
  assert.equal(audioProblem({ ...ok, contentLength: 0 }), null);
  assert.equal(audioProblem({ ...ok, contentType: "" }), null);
  assert.equal(audioProblem({ ...ok, contentType: "application/octet-stream", head: [0, 1] }), null);
  assert.match(audioProblem({ ...ok, status: 404 }), /404/);
  assert.match(audioProblem({ ...ok, contentType: "text/html; charset=utf-8" }), /Not audio/);
  assert.match(audioProblem({ ...ok, contentType: "application/json" }), /Not audio/);
  assert.match(audioProblem({ ...ok, size: 0, contentLength: 0 }), /small/);
  assert.match(audioProblem({ ...ok, size: MIN_AUDIO_BYTES - 1, contentLength: 0 }), /small/);
  assert.match(audioProblem({ ...ok, size: 2000000 }), /Incomplete/);
  assert.match(audioProblem({ ...ok, contentType: "", head: [0x3c, 0x68] }), /Not audio/);
});

test("percent is a whole number between 0 and 100", () => {
  assert.equal(percent(0, 100), 0);
  assert.equal(percent(499, 1000), 49);
  assert.equal(percent(1000, 1000), 100);
  assert.equal(percent(2000, 1000), 100);
  assert.equal(percent(10, -1), 0);
});

const done = (id, addedAt, bytes = 100) => ({ id, track: audius(id), uri: `file:///d/downloads/${id}.mp3`, bytes, addedAt, status: "done", error: null });

test("lists show finished songs newest first and add up their size", () => {
  const entries = {
    a: done("a", 1, 10),
    b: done("b", 3, 20),
    c: { ...done("c", 2), status: "downloading", uri: null, bytes: 0 },
    d: { ...done("d", 5), status: "error", error: "x" },
  };
  assert.deepEqual(newestFirst(entries).map((e) => e.id), ["b", "a"]);
  assert.equal(totalBytes(entries), 30);
  assert.equal(totalBytes(newestFirst(entries)), 30);
  assert.equal(totalBytes({}), 0);
});

test("saving and restoring keeps finished songs and re-queues interrupted ones", () => {
  const entries = {
    a: done("a", 1, 10),
    b: { ...done("b", 2), status: "downloading", uri: null, bytes: 0 },
    c: { ...done("c", 3), status: "queued", uri: null, bytes: 0 },
    d: { ...done("d", 4), status: "error", error: "offline", uri: null },
  };
  const saved = toSaved(entries);
  assert.deepEqual(saved[0], { id: "a", track: entries.a.track, uri: entries.a.uri, bytes: 10, addedAt: 1 });
  assert.deepEqual(saved.map((e) => e.status), [undefined, "queued", "queued"]);
  const restored = restoreEntries(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(Object.keys(restored), ["a", "b", "c"]);
  assert.equal(restored.a.status, "done");
  assert.equal(restored.a.uri, entries.a.uri);
  assert.equal(restored.b.status, "queued");
  assert.equal(restored.c.status, "queued");
});

test("restoring ignores garbage and radio", () => {
  const bad = [null, 5, {}, { id: "x" }, { id: "r", track: radio, uri: "file:///r.mp3" }, { id: "m", track: audius("other"), uri: "file:///m.mp3" }, { id: "n", track: audius("n") }];
  assert.deepEqual(restoreEntries(bad), {});
  assert.deepEqual(restoreEntries(null), {});
  assert.deepEqual(restoreEntries({ not: "an array" }), {});
});

test("collection status counts each downloadable song once", () => {
  const statuses = { a: "done", b: "downloading", c: "queued", d: "error" };
  const tracks = [audius("a"), audius("a"), audius("b"), audius("c"), audius("d"), audius("e"), radio];
  const s = collectionStatus(tracks, (id) => statuses[id] || null);
  // Failed songs are left to retry.
  assert.deepEqual(s, { total: 5, done: 1, pending: 2, remaining: 2 });
  assert.equal(collectionLabel(s), "Download all · 2");
  assert.equal(collectionLabel({ ...s, remaining: 0 }), "Downloading 2 of 5");
  assert.equal(collectionLabel({ total: 3, done: 3, pending: 0, remaining: 0 }), "Downloaded");
  assert.equal(collectionLabel(collectionStatus([radio], () => null)), null);
});

test("one song downloading on its own leaves Download all for the rest", () => {
  const tracks = Array.from({ length: 20 }, (_, i) => audius(`t${i}`));
  const s = collectionStatus(tracks, (id) => (id === "t3" ? "downloading" : null));
  assert.deepEqual(s, { total: 20, done: 0, pending: 1, remaining: 19 });
  assert.equal(collectionLabel(s), "Download all · 19");
});

test("batch outcomes summarise to one message, preferring the storage error", () => {
  const s = summarizeOutcomes([
    { status: "done" },
    { status: "error", error: "offline", code: "network" },
    { status: "error", error: "full", code: "space" },
    { status: "cancelled" },
  ]);
  assert.deepEqual(s, { count: 4, done: 1, failed: 2, cancelled: 1, error: "full", code: "space" });
});
