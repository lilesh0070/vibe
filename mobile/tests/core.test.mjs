import test from "node:test";
import assert from "node:assert/strict";
import { buildProfile, rankRecommendations } from "../src/services/recommendationEngine.js";
import { compact, formatTime, shuffleArray } from "../src/utils/format.js";

const track = (id, artistId = "a", genre = "Punjabi") => ({ id, artistId, artist: artistId, title: id, genre, plays: 10 });

test("likes and playlist additions build artist and genre preferences", () => {
  const t = track("one");
  const p = buildProfile({ liked: [t], playlists: [{ songs: [t] }] });
  assert.equal(p.artists.a, 20);
  assert.equal(p.genres.Punjabi, 18);
});

test("recommendations spread artists and push recently played tracks down", () => {
  const one = track("one");
  const ranked = rankRecommendations(
    [one, one, track("two"), track("three"), track("four", "b"), track("five", "c")],
    buildProfile({ liked: [one] }),
    [one],
  );
  assert.equal(new Set(ranked.map((t) => t.id)).size, ranked.length);
  assert.notEqual(ranked[0].id, "one");
  assert.ok(ranked.slice(0, 3).filter((t) => t.artistId === "a").length <= 2);
});

test("time and count formatting", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(197), "3:17");
  assert.equal(formatTime(3725), "1:02:05");
  assert.equal(compact(950), "950");
  assert.equal(compact(1520), "1.5K");
  assert.equal(compact(23_400_000), "23M");
});

test("shuffle keeps every item exactly once", () => {
  const items = Array.from({ length: 50 }, (_, i) => i);
  assert.deepEqual([...shuffleArray(items)].sort((a, b) => a - b), items);
});
