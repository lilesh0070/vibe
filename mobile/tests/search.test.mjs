import test from "node:test";
import assert from "node:assert/strict";
import {
  bestArtist,
  coverage,
  detectLanguage,
  foldName,
  matchArtist,
  nameMatches,
  parseDuration,
  rankByName,
  rankTracks,
  relevanceScore,
  sameName,
  songKeys,
  stripSiteTags,
  tidyTitle,
  titleKey,
} from "../src/services/matching.js";
import { indianArtists } from "../src/services/indianArtists.js";

const track = (title, artist = "Uploader", extra = {}) => ({
  kind: "track",
  id: `${title}|${artist}`,
  title,
  artist,
  genre: "Rock",
  plays: 0,
  duration: 200,
  ...extra,
});

test("Hinglish spellings fold onto the same name", () => {
  assert.ok(sameName("sidhu moosewala", "Sidhu Moose Wala"));
  assert.ok(sameName("dhanda noliywala", "Dhanda Nyoliwala"));
  assert.ok(sameName("karan ojla", "Karan Aujla"));
  assert.ok(sameName("masum sharma", "Masoom Sharma"));
  assert.ok(sameName("jubin notiyal", "Zubin Nautiyal"));
  assert.equal(foldName("Diljit Dosanjh"), foldName("diljit dosanj"));
});

test("misspelled singers still match their uploads", () => {
  assert.ok(nameMatches("sidhu moselvala", "SYL -SIDHU MOOSE WALA"));
  assert.ok(nameMatches("sidhu moselvala", "Sidhumoosewala"));
  assert.ok(nameMatches("moselvala", "295 - Sidhu Moose Wala"));
  assert.ok(nameMatches("Sidhu Moose Wala", "OLD_SKOOL__karanaujla, sidhumoosewala"));
  assert.ok(nameMatches("dhanda noliywala", "Dhanda Nyoliwala - Zigane (Official Music Video)"));
  assert.ok(nameMatches("karan ojla", "On Top - Karan Aujla"));
  assert.ok(nameMatches("arjit sing", "Tum Hi Ho - Arijit Singh"));
  assert.ok(nameMatches("Dhanda Nyoliwala", "dhanda-nyoliwala-backbite-2.mp3"));
});

test("Indian names do not match unrelated English words", () => {
  for (const text of ["Dark Side", "East Side Flow", "Sidewalk Stories", "Side by Side"]) assert.equal(nameMatches("sidhu", text), false, text);
  assert.equal(nameMatches("sidhu moselvala", "Moose Lodge Blues"), false);
  assert.equal(nameMatches("karan ojla", "Karen O - Ojai"), false);
  assert.equal(nameMatches("Dhanda Nyoliwala", "4HANDZ"), false);
  assert.equal(nameMatches("Dhanda Nyoliwala", "danda"), false);
  assert.equal(nameMatches("Shubh", "Subway"), false);
});

test("the last typed word may be unfinished", () => {
  assert.ok(nameMatches("diljit dos", "G.O.A.T - Diljit Dosanjh", { prefix: true }));
  assert.equal(nameMatches("diljit dos", "G.O.A.T - Diljit Dosanjh"), false);
  assert.equal(coverage("sidhu moose wala", "Sidhu Moosewala Fan Page").query, 1);
});

test("queries resolve to curated Indian artists", () => {
  const cases = {
    "sidhu moselvala": "Sidhu Moose Wala",
    moselvala: "Sidhu Moose Wala",
    "dhanda noliywala": "Dhanda Nyoliwala",
    "masum sharma": "Masoom Sharma",
    "karan ojla": "Karan Aujla",
    "arjit sing": "Arijit Singh",
    "khesari lal": "Khesari Lal Yadav",
    "renuka panwar": "Renuka Panwar",
    diljit: "Diljit Dosanjh",
    "honey sing": "Yo Yo Honey Singh",
    "sapna chaudhry": "Sapna Choudhary",
    "arijit singh songs": "Arijit Singh",
  };
  for (const [query, name] of Object.entries(cases)) assert.equal(bestArtist(query, indianArtists)?.artist.name, name, query);
  const extra = bestArtist("sidhu moose wala 295", indianArtists);
  assert.equal(extra.artist.name, "Sidhu Moose Wala");
  assert.deepEqual(extra.missed, ["295"]);
});

test("song names and common words are not taken for a similar singer", () => {
  for (const q of ["kesariya", "manike", "gulabi", "kamar", "mashup"]) assert.equal(bestArtist(q, indianArtists), null, q);
  // A name typed exactly beats a respelled one, and a single word is only a guess to check.
  const jasmine = bestArtist("jasmine", indianArtists);
  assert.equal(jasmine.artist.name, "Jasmine Sandlas");
  assert.equal(jasmine.weak, true);
  assert.equal(bestArtist("mehndi", indianArtists).weak, true);
  assert.equal(bestArtist("diljit", indianArtists).weak, true);
  assert.equal(bestArtist("moselvala", indianArtists).weak, true);
  assert.equal(bestArtist("sidhu moselvala", indianArtists).weak, false);
  assert.equal(bestArtist("karan ojla", indianArtists).weak, false);
});

test("a misspelled singer plus a song word still resolves", () => {
  const m = bestArtist("sidhu moselvala 295", indianArtists);
  assert.equal(m.artist.name, "Sidhu Moose Wala");
  assert.deepEqual(m.missed, ["295"]);
  assert.equal(bestArtist("karan ojla softly", indianArtists)?.artist.name, "Karan Aujla");
});

test("shared surnames stay unresolved however they are spelled", () => {
  for (const q of ["dhillon", "dhilon", "dhillion", "sandhu", "sandu", "malik", "malick"]) assert.equal(bestArtist(q, indianArtists), null, q);
});

test("plain English searches are not taken over by an artist", () => {
  const plain = ["lofi", "chill", "love", "sad songs", "taylor swift", "king", "stan", "side", "sub", "money", "honey", "royal", "jordan",
    "bohemian rhapsody", "punjabi", "new punjabi songs", "haryanvi", "night drive", "dark side", "sidhu", "ap", "dhillon", "lofi hindi"];
  for (const q of plain) assert.equal(bestArtist(q, indianArtists), null, q);
  // Outside the curated list only a full-name match counts.
  assert.equal(matchArtist("lofi hindi", "Lofi Hindi Songs", { strict: true }), null);
  assert.ok(matchArtist("tailor swift", "Taylor Swift", { strict: true }));
});

test("the curated list is sane and every name finds itself", () => {
  assert.ok(indianArtists.length >= 60, `${indianArtists.length} artists`);
  const names = indianArtists.map((a) => a.name);
  assert.equal(new Set(names.map((n) => foldName(n))).size, names.length, "no duplicate names");
  for (const a of indianArtists) {
    assert.ok(["Punjabi", "Haryanvi", "Hindi", "Bhojpuri"].includes(a.language), a.name);
    for (const name of [a.name, ...a.aliases]) assert.equal(bestArtist(name, indianArtists)?.artist.name, a.name, name);
  }
});

test("artist searches put the artist's songs first and drop unrelated ones", () => {
  const theirs = Array.from({ length: 9 }, (_, i) => track(`Song ${i} - Sidhu Moose Wala`, "Fan", { plays: i * 10 }));
  const items = [track("Moose Lodge Blues", "Country Joe", { plays: 1e6 }), ...theirs, track("Never Fold", "Sidhu Moose Wala")];
  const ranked = rankTracks(items, { query: "Sidhu Moose Wala", artist: "Sidhu Moose Wala", focused: true });
  assert.equal(ranked.length, 10);
  assert.ok(!ranked.some((t) => t.title === "Moose Lodge Blues"));
  assert.equal(ranked[0].title, "Song 8 - Sidhu Moose Wala", "plays break ties");
});

test("scarce matches keep a few other results at the bottom", () => {
  const items = [track("Lonely Road", "A"), track("Zigane - Dhanda Nyoliwala"), track("Pind", "B"), track("Desi Beat (Haryanvi)", "C")];
  const ranked = rankTracks(items, { query: "Dhanda Nyoliwala", artist: "Dhanda Nyoliwala", focused: true, keep: 2 });
  assert.equal(ranked[0].title, "Zigane - Dhanda Nyoliwala");
  assert.equal(ranked.length, 3);
  assert.equal(ranked[1].title, "Desi Beat (Haryanvi)", "Indian-language signals rank higher");
});

test("near-identical uploads collapse to one", () => {
  const items = [
    track("Vaar-Sidhu Moose Wala", "Tribute", { plays: 5000 }),
    track("VAAR - Sidhu Moose wala (DJJOhAL.Com)", "fun15", { plays: 20 }),
    track("Vaar", "Sidhu Moose Wala", { plays: 1 }),
    track("295", "Sidhu Moose Wala"),
  ];
  const ranked = rankTracks(items, { artist: "Sidhu Moose Wala", query: "Sidhu Moose Wala", focused: true });
  assert.deepEqual(ranked.map((t) => t.title), ["Vaar-Sidhu Moose Wala", "295"]);
  assert.equal(titleKey("2 AM Ft Roach Killa - Karan Aujla (DJJOhAL.Com)"), titleKey("2 AM ft Roach Killa - Karan Aujla"));
});

test("one song uploaded with different credits collapses to one", () => {
  const artist = "Sidhu Moose Wala";
  const items = [
    track("295 - Sidhu Moose Wala", "Punjabi Songs", { duration: 273 }),
    track("295 - Sidhu Moose Wala x The Kidd", "Tribute", { duration: 273 }),
    track("295 Official Audio The Kidd Moosetape", artist, { duration: 273 }),
    track("LEVELS Sidhu Moose Wala x Sunny Malton x The Kidd", "Tribute", { duration: 231 }),
    track("LEVELS Official Video ft Sunny Malton The Kidd", artist, { duration: 231 }),
    track("THE LAST RIDE - Sidhu Moose Wala x Wazir Parar", "Tribute", { duration: 275 }),
    track("THE LAST RIDE Offical Video Wazir Patar", artist, { duration: 275 }),
    track("LEGEND - SIDHU MOOSE WALA", "Tribute", { duration: 283 }),
    track("LEGEND The Kidd Gold Media Latest Punjabi Songs 2020", artist, { duration: 283 }),
    track("Sidhu Son | Sidhu Moosewala | Moosetape", "Sidhu Moosewala", { duration: 217 }),
    track("Son", artist, { duration: 217 }),
    // Different songs that share a first word stay apart.
    track("Jatt Da Muqabla - Sidhu Moose Wala", "Tribute", { duration: 209 }),
    track("Jatt Da Muqabla Remix Sidhu Moose Wala", "DJ", { duration: 320 }),
  ];
  const ranked = rankTracks(items, { artist, query: artist, focused: true });
  const songs = ranked.map((t) => t.title.split(/[\s-]/)[0].toLowerCase()).sort();
  assert.deepEqual(songs, ["295", "jatt", "jatt", "legend", "levels", "sidhu", "the"]);
  assert.equal(titleKey("Moosetape - 295", artist) === titleKey("Moosetape - Signed To God", artist), false);
});

test("titles in other scripts keep distinct keys", () => {
  const titles = ["夜の街", "最愛演唱會", "Ты моя любовь", "Любовь", "عشق", "دل", "사랑", "💔", "🔥"];
  for (const t of titles) assert.ok(titleKey(t), t);
  const items = titles.map((t) => track(t, "Same Uploader"));
  assert.equal(rankTracks(items, { query: "lofi" }).length, titles.length);
  assert.equal(rankTracks(items.slice(4, 6), { query: "x", artist: "Nusrat Fateh Ali Khan", focused: true }).length, 2);
});

test("artist searches drop clips and karaoke but keep what was typed", () => {
  const artist = "Jass Manak";
  const items = [
    track("Lehanga - Jass Manak", "A", { duration: 214 }),
    track("Rabb Wangu - Jass manak", "B", { duration: 29 }),
    track("Lehanga (Jass Manak) Karaoke Track", "C"),
    track("Jatt Brothers (Dialogue Promo 2) - Jass Manak", "D"),
    track("Jasmine Flower", "E"),
  ];
  const ranked = rankTracks(items, { artist, query: artist, typed: "jasmine", focused: true });
  assert.deepEqual(ranked.map((t) => t.title), ["Lehanga - Jass Manak", "Jasmine Flower"]);
  const asked = rankTracks(items, { artist, query: `${artist} karaoke`, focused: true });
  assert.ok(asked.some((t) => /karaoke/i.test(t.title)), "kept when asked for");
});

test("plain searches keep the service order, matching titles first", () => {
  const items = [track("Rainy day", "Beats"), track("lofi type beat", "bsdu"), track("Coffee", "lofi girl"), track("Rainy day", "Beats")];
  const ranked = rankTracks(items, { query: "lofi" });
  assert.deepEqual(ranked.map((t) => t.title), ["lofi type beat", "Coffee", "Rainy day"]);
});

test("relevance rewards the artist, known songs and Indian signals", () => {
  const terms = { query: "Karan Aujla", artist: "Karan Aujla", songs: songKeys(["Softly", "Wavy"]) };
  const base = relevanceScore(track("Something"), terms);
  assert.ok(relevanceScore(track("On Top", "Karan Aujla"), terms) > base + 9);
  assert.ok(relevanceScore(track("Softly"), terms) > base);
  assert.ok(relevanceScore(track("Something", "x", { genre: "Punjabi" }), terms) > base);
  assert.ok(relevanceScore(track("Ringtone - Karan Aujla", "x", { duration: 30 }), terms) < relevanceScore(track("Ringtone - Karan Aujla"), terms));
});

test("artist, playlist and station lists filter by name", () => {
  const users = ["4HANDZ", "CHANDAN", "Dhanda Nyoliwala Fan", "Amanda"].map((name) => ({ name }));
  const text = (u) => u.name;
  assert.deepEqual(rankByName(users, "Dhanda Nyoliwala", { text, focused: true }).map((u) => u.name), ["Dhanda Nyoliwala Fan"]);
  const plain = rankByName([{ name: "Rain" }, { name: "Lofi Beats" }, { name: "Lofi" }], "lofi", { text });
  assert.deepEqual(plain.map((u) => u.name), ["Lofi Beats", "Lofi", "Rain"]);
  const typed = rankByName([{ name: "Mehndi Songs" }, { name: "Daler Mehndi" }, { name: "Rock" }], "Daler Mehndi", { text, focused: true, also: "mehndi" });
  assert.deepEqual(typed.map((u) => u.name), ["Daler Mehndi", "Mehndi Songs"]);
});

test("titles lose watermarks, labels and the artist's own name", () => {
  assert.equal(stripSiteTags("2 AM Ft Roach Killa - Karan Aujla (DJJOhAL.Com)"), "2 AM Ft Roach Killa - Karan Aujla");
  assert.equal(stripSiteTags("[DJHR.IN] Chachhi Gandas"), "Chachhi Gandas");
  assert.equal(stripSiteTags("Agar Tum Saath Ho_320(PagalWorld.com.se)"), "Agar Tum Saath Ho");
  assert.equal(stripSiteTags("y2mate.com - Bande Khani"), "Bande Khani");
  assert.equal(stripSiteTags("Admirin You - PagalNew"), "Admirin You");
  assert.equal(stripSiteTags("Mamla Chori Ke 320 Kbps"), "Mamla Chori Ke");
  assert.equal(stripSiteTags("Tere Bina (feat. A.R. Rahman)"), "Tere Bina (feat. A.R. Rahman)");
  assert.equal(stripSiteTags("Y 2mate.com ADHI RAAT Satti Dhillon GK Digital Geet MP 3"), "ADHI RAAT Satti Dhillon GK Digital");
  assert.equal(stripSiteTags("Arijit Singh Mashup (2014) - www."), "Arijit Singh Mashup (2014)");
  const artist = "Dhanda Nyoliwala";
  assert.equal(tidyTitle("Block – Dhanda Nyoliwala (Music Video) | Deepesh Goyal | VYRL Haryanvi", artist), "Block");
  assert.equal(tidyTitle("NO MERCY : Dhanda Nyoliwala | Desi Melbourniye", artist), "NO MERCY");
  assert.equal(tidyTitle("Dhanda Nyoliwala - 4 Days (Official Music Video) | New Haryanvi Song 2023", artist), "4 Days");
  assert.equal(tidyTitle("Burberry ! Sidhu Moose Wala ! Punjabi", "Sidhu Moose Wala"), "Burberry");
  assert.equal(tidyTitle("Paapi Sidhu Moose Wala", "Sidhu Moose Wala"), "Paapi");
  assert.equal(tidyTitle("Dark Love Sidhu Moosewala", ["Sidhu Moose Wala", "Sidhu Moosewala"]), "Dark Love");
  assert.equal(tidyTitle("Sidhu Moose Wala", "Sidhu Moose Wala"), "Sidhu Moose Wala");
});

test("durations and languages from archive metadata", () => {
  assert.equal(parseDuration("205.08"), 205.08);
  assert.equal(parseDuration("3:25"), 205);
  assert.equal(parseDuration("1:02:03"), 3723);
  assert.equal(parseDuration(undefined), 0);
  assert.equal(parseDuration("n/a"), 0);
  assert.equal(detectLanguage("", ["pan"]), "Punjabi");
  assert.equal(detectLanguage("", "bho"), "Bhojpuri");
  assert.equal(detectLanguage("New Haryanvi Song 2023"), "Haryanvi");
  assert.equal(detectLanguage("ਸਿੱਧੂ ਮੂਸੇ ਵਾਲਾ"), "Punjabi");
  assert.equal(detectLanguage("तुम ही हो"), "Hindi");
  assert.equal(detectLanguage("Blinding Lights"), null);
});
