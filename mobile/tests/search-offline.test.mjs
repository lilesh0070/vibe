import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// search.js imports the network services without file extensions, which Node
// cannot resolve. This hook adds ".js" and swaps every network service for a
// stub that fails like a phone with no connection.
const offline = `
const fail = () => Promise.reject(new Error("offline"));
export const searchTracks = fail, searchArtists = fail, searchPlaylists = fail, getArtistTracks = fail;
export const searchArchive = fail, findArtists = fail, findSongs = fail, searchStations = fail;
`;
const hooks = `
const stub = "data:text/javascript," + encodeURIComponent(${JSON.stringify(offline)});
export async function resolve(specifier, context, next) {
  if (/^\\.\\/(audius|archive|itunes|radio)$/.test(specifier)) return { url: stub, shortCircuit: true };
  if (specifier.startsWith(".") && !/\\.m?js$/.test(specifier)) return next(specifier + ".js", context);
  return next(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);
const { searchAll } = await import("../src/services/search.js");

test("with every service down a search fails instead of finding nothing", async () => {
  for (const query of ["lofi", "sidhu moselvala", "diljit"]) {
    for (const filter of ["All", "Songs", "Artists", "Playlists", "Radio"]) {
      await assert.rejects(searchAll(query, filter), /offline/, `${query} / ${filter}`);
    }
  }
});
