import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { storage } from "../services/storage";

const LibraryContext = createContext(null);

const initial = {
  liked: [],
  playlists: [],
  history: [],
  stations: [],
  searches: [],
  stats: {},
};

// Only the fields screens and the player need, so storage stays small.
export const slim = (t) => ({
  kind: t.kind,
  source: t.source,
  id: t.id,
  uuid: t.uuid,
  title: t.title,
  artist: t.artist,
  artistId: t.artistId,
  artwork: t.artwork,
  duration: t.duration,
  genre: t.genre,
  plays: t.plays,
  url: t.url,
});

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function LibraryProvider({ children }) {
  const [state, setState] = useState(initial);
  const [ready, setReady] = useState(false);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    storage.read("library", initial).then((saved) => {
      setState({ ...initial, ...saved });
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => storage.write("library", state), 400);
    return () => clearTimeout(timer);
  }, [state, ready]);

  const actions = useMemo(() => {
    const update = (fn) => setState((s) => ({ ...s, ...fn(s) }));
    const editPlaylist = (id, fn) =>
      update((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? { ...p, ...fn(p) } : p)) }));
    return {
      // Return the new state so callers can confirm it in a toast.
      toggleLike: (track) => {
        const liked = !latest.current.liked.some((t) => t.id === track.id);
        update((s) => ({
          liked: liked ? [slim(track), ...s.liked.filter((t) => t.id !== track.id)] : s.liked.filter((t) => t.id !== track.id),
        }));
        return liked;
      },
      toggleStation: (station) => {
        const saved = !latest.current.stations.some((t) => t.id === station.id);
        update((s) => ({
          stations: saved ? [slim(station), ...s.stations.filter((t) => t.id !== station.id)] : s.stations.filter((t) => t.id !== station.id),
        }));
        return saved;
      },
      createPlaylist: (name, track) => {
        const playlist = { id: newId(), name: name.trim() || "My playlist", songs: track ? [slim(track)] : [], createdAt: Date.now() };
        update((s) => ({ playlists: [playlist, ...s.playlists] }));
        return playlist;
      },
      renamePlaylist: (id, name) => editPlaylist(id, () => ({ name: name.trim() || "My playlist" })),
      deletePlaylist: (id) => update((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),
      addToPlaylist: (id, track) =>
        editPlaylist(id, (p) => ({
          songs: p.songs.some((t) => t.id === track.id) ? p.songs : [...p.songs, slim(track)],
        })),
      removeFromPlaylist: (id, trackId) => editPlaylist(id, (p) => ({ songs: p.songs.filter((t) => t.id !== trackId) })),
      addHistory: (track) =>
        update((s) => {
          const prev = s.history.find((t) => t.id === track.id);
          const entry = { ...slim(track), playedAt: Date.now(), playCount: (prev?.playCount || 0) + 1 };
          return { history: [entry, ...s.history.filter((t) => t.id !== track.id)].slice(0, 100) };
        }),
      clearHistory: () => update(() => ({ history: [] })),
      addSearch: (q) =>
        update((s) => ({
          searches: [q, ...s.searches.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 12),
        })),
      clearSearches: () => update(() => ({ searches: [] })),
      // Listening signals for recommendations, same weights as the web app.
      recordEvent: (type, track, extra = {}) => {
        if (track?.kind !== "track") return;
        update((s) => {
          const prev = s.stats[track.id] || { plays: 0, completed: 0, skipped: 0, seconds: 0, artistId: track.artistId, genre: track.genre };
          const next = { ...prev };
          if (type === "started") next.plays++;
          if (type === "completed") next.completed++;
          if (type === "skipped" && (extra.seconds ?? 0) < 30) next.skipped++;
          if (extra.seconds) next.seconds += extra.seconds;
          const stats = { ...s.stats, [track.id]: next };
          const keys = Object.keys(stats);
          if (keys.length > 500) delete stats[keys[0]];
          return { stats };
        });
      },
    };
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      ...actions,
      ready,
      isLiked: (id) => state.liked.some((t) => t.id === id),
      isStationSaved: (id) => state.stations.some((t) => t.id === id),
    }),
    [state, actions, ready],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export const useLibrary = () => useContext(LibraryContext);
