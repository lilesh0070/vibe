import { abortError, fetchJson, isAbort, uniqueBy } from "./net";

// Radio Browser is a free, community-run directory of public internet radio
// streams. Only HTTPS MP3/AAC streams are kept so they play on Android, iOS and web.
const hosts = [
  "https://de1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://all.api.radio-browser.info",
];
const headers = { "User-Agent": "Vibe/3.0 (io.github.lilesh0070.vibe)" };
const cache = new Map();

export const radioCategories = [
  { key: "bollywood", label: "Bollywood", specs: ["tag=bollywood"] },
  { key: "india", label: "All India", specs: ["countrycode=IN"] },
  { key: "hindi", label: "Hindi", specs: ["tag=hindi"] },
  { key: "punjabi", label: "Punjabi", specs: ["tag=punjabi", "tag=punjab", "name=punjabi"] },
  { key: "haryanvi", label: "Haryanvi", specs: ["tag=haryanvi", "name=haryanvi", "name=haryana"] },
  { key: "bhojpuri", label: "Bhojpuri", specs: ["tag=bhojpuri"] },
  { key: "retro", label: "Retro", specs: ["tag=retro&countrycode=IN", "tag=90s&countrycode=IN", "tag=oldies&countrycode=IN"] },
  { key: "bhakti", label: "Bhakti", specs: ["tag=devotional&countrycode=IN", "tag=bhajan", "tag=sufi"] },
  { key: "tamil", label: "Tamil", specs: ["tag=tamil"] },
];

const usable = (s) =>
  s.url_resolved?.startsWith("https://") &&
  ["MP3", "AAC", "AAC+"].includes(s.codec) &&
  s.lastcheckok !== 0;

const titleCase = (w) => w.charAt(0).toUpperCase() + w.slice(1);

export function normalizeStation(s) {
  const tags = (s.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t && t.length < 18)
    .slice(0, 3)
    .map(titleCase);
  return {
    kind: "radio",
    id: "radio:" + s.stationuuid,
    uuid: s.stationuuid,
    title: s.name.trim().replace(/\s+/g, " "),
    artist: tags.join(" · ") || s.language || s.country || "Live radio",
    artwork: s.favicon?.startsWith("https://") ? s.favicon : null,
    url: s.url_resolved,
    bitrate: s.bitrate || 0,
    codec: s.codec,
    country: s.countrycode,
    genre: "Radio",
    duration: 0,
  };
}

async function request(path, signal) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < 300000) return hit.data;
  let last;
  for (const host of hosts) {
    try {
      const data = await fetchJson(host + path, { signal, headers, timeout: 8000 });
      cache.set(path, { at: Date.now(), data });
      return data;
    } catch (e) {
      if (isAbort(e) && signal?.aborted) throw e;
      last = e;
    }
  }
  throw new Error("Radio directory is unreachable. Check your connection.", { cause: last });
}

const search = (spec, limit, signal) =>
  request(
    `/json/stations/search?${spec}&hidebroken=true&is_https=true&order=clickcount&reverse=true&limit=${limit}`,
    signal,
  ).then((list) => (list || []).filter(usable).map(normalizeStation));

const dedupe = (stations) =>
  uniqueBy(stations, (s) => s.title.toLowerCase().replace(/[^a-z0-9]/g, ""));

export async function getStations(key = "bollywood", signal) {
  const category = radioCategories.find((c) => c.key === key) || radioCategories[0];
  const sets = await Promise.allSettled(category.specs.map((spec) => search(spec, 60, signal)));
  if (signal?.aborted) throw abortError();
  if (sets.every((s) => s.status === "rejected")) throw sets[0].reason;
  return dedupe(sets.filter((s) => s.status === "fulfilled").flatMap((s) => s.value));
}

export const searchStations = (q, signal) =>
  search(`name=${encodeURIComponent(q)}`, 40, signal).then(dedupe);

// Radio Browser asks clients to report plays so its popularity ranking stays useful.
export const reportClick = (uuid) => {
  if (uuid) request(`/json/url/${uuid}`).catch(() => {});
};
