import test from "node:test";
import assert from "node:assert/strict";
import { cleanVersion, isNewerVersion, parseVersion } from "../src/utils/version.js";
import { megabytes, plainNotes, readRelease } from "../src/utils/release.js";

test("versions parse with or without the v prefix", () => {
  assert.deepEqual(parseVersion("v3.0.1"), { core: [3, 0, 1], pre: "" });
  assert.deepEqual(parseVersion(" V3.0 "), { core: [3, 0, 0], pre: "" });
  assert.deepEqual(parseVersion("3.1.0-beta.2"), { core: [3, 1, 0], pre: "beta.2" });
  assert.equal(cleanVersion("v3.0.1"), "3.0.1");
  assert.equal(cleanVersion("v3.0.1-rc.1"), "3.0.1-rc.1");
});

test("garbage and missing versions parse to null", () => {
  for (const bad of [null, undefined, "", "latest", "version 3", {}, NaN]) assert.equal(parseVersion(bad), null);
  assert.equal(cleanVersion("nightly"), null);
});

test("newer versions are detected numerically, not as strings", () => {
  assert.equal(isNewerVersion("v3.0.1", "3.0.0"), true);
  assert.equal(isNewerVersion("3.10.0", "3.9.9"), true);
  assert.equal(isNewerVersion("4", "3.99.99"), true);
  assert.equal(isNewerVersion("3.0.0", "3.0.0"), false);
  assert.equal(isNewerVersion("v3.0", "3.0.0"), false);
  assert.equal(isNewerVersion("v2.1.0", "3.0.0"), false);
});

test("pre-releases sort before their final version", () => {
  assert.equal(isNewerVersion("3.0.1-beta", "3.0.0"), true);
  assert.equal(isNewerVersion("3.0.1-beta", "3.0.1"), false);
  assert.equal(isNewerVersion("3.0.1", "3.0.1-beta"), true);
  assert.equal(isNewerVersion("3.0.1-beta.10", "3.0.1-beta.9"), true);
});

test("unknown versions never trigger an update", () => {
  assert.equal(isNewerVersion("v3.0.1", null), false);
  assert.equal(isNewerVersion("v3.0.1", "garbage"), false);
  assert.equal(isNewerVersion(undefined, "3.0.0"), false);
  assert.equal(isNewerVersion("nightly", "3.0.0"), false);
});

const release = (over = {}) => ({
  tag_name: "v3.0.1",
  html_url: "https://github.com/lilesh0070/vibe/releases/tag/v3.0.1",
  published_at: "2026-10-29T10:00:00Z",
  body: "## What's new\n\n- **Faster** search\n- See [the site](https://example.com)",
  assets: [
    { name: "SHA256SUMS.txt", size: 76, state: "uploaded", browser_download_url: "https://x/SHA256SUMS.txt" },
    { name: "Vibe.apk", size: 15_000_000, state: "uploaded", browser_download_url: "https://x/Vibe.apk" },
  ],
  ...over,
});

test("a GitHub release is reduced to the fields the updater needs", () => {
  assert.deepEqual(readRelease(release()), {
    version: "3.0.1",
    notes: "What's new\n\n• Faster search\n• See the site",
    apkUrl: "https://x/Vibe.apk",
    apkSize: 15_000_000,
    pageUrl: "https://github.com/lilesh0070/vibe/releases/tag/v3.0.1",
    publishedAt: "2026-10-29T10:00:00Z",
  });
});

test("releases without a finished APK keep the page link but no download", () => {
  const none = readRelease(release({ assets: [] }));
  assert.equal(none.apkUrl, null);
  assert.equal(none.apkSize, 0);
  assert.ok(none.pageUrl);
  const partial = readRelease(release({ assets: [{ name: "Vibe.apk", size: 10, state: "starter", browser_download_url: "https://x" }] }));
  assert.equal(partial.apkUrl, null);
  assert.equal(readRelease(release({ assets: undefined })).apkUrl, null);
});

test("unusable release payloads read as null", () => {
  assert.equal(readRelease(null), null);
  assert.equal(readRelease({ message: "Not Found" }), null);
  assert.equal(readRelease(release({ tag_name: "nightly" })), null);
  assert.equal(readRelease(release({ draft: true })), null);
});

test("release notes become trimmed plain text", () => {
  assert.equal(plainNotes(null), "");
  assert.equal(plainNotes("  # Title\r\n\r\n\r\n\r\nUse `vibe` now  "), "Title\n\nUse vibe now");
  assert.equal(plainNotes("![shot](a.png)\n---\n> quoted"), "quoted");
  const long = plainNotes("word ".repeat(600));
  assert.ok(long.length <= 1201 && long.endsWith("…"));
});

test("sizes read in megabytes", () => {
  assert.equal(megabytes(15_000_000), "14 MB");
  assert.equal(megabytes(5 * 1024 * 1024), "5 MB");
  assert.equal(megabytes(16846), "0.1 MB");
  assert.equal(megabytes(0), "0 MB");
});
