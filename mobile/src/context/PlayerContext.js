import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import {
  createAudioPlayer,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayerStatus,
} from "expo-audio";
import { useDownloads } from "./DownloadContext";
import { slim, useLibrary } from "./LibraryContext";
import { streamHostCount, streamUrl } from "../services/audius";
import { reportClick } from "../services/radio";
import { storage } from "../services/storage";
import { shuffleArray } from "../utils/format";

const PlayerContext = createContext(null);

// Audius tracks stream by id (older saved tracks have no source); radio stations
// and Internet Archive tracks carry their own URL.
const fromAudius = (item) => item.kind === "track" && (item.source || "audius") === "audius";

const sourceFor = (item, attempt) => (fromAudius(item) ? streamUrl(item.id, attempt) : item.url);

const lockScreenOptions = (item) => {
  const live = item.kind === "radio";
  return { showSeekForward: !live, showSeekBackward: !live, isLiveStream: live };
};

const lockScreenMetadata = (item) => ({
  title: item.title,
  artist: item.artist,
  albumTitle: item.kind === "radio" ? "Vibe Radio" : "Vibe",
  artworkUrl: item.artwork || undefined,
});

// One audio player lives for the whole app. Screens read slow-changing state
// (queue, playing, errors) from context and subscribe to the fast-changing
// position separately through useProgress, so the app does not re-render twice a second.
export function PlayerProvider({ children }) {
  const library = useLibrary();
  const lib = useRef(library);
  lib.current = library;
  // Read through a ref so download progress never changes the player's callbacks.
  const downloads = useDownloads();
  const offline = useRef(downloads);
  offline.current = downloads;

  const [player] = useState(() => createAudioPlayer(null, { updateInterval: 500 }));
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(-1);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("off");
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState(null);
  const [sleepAt, setSleepAt] = useState(null);
  const [restored, setRestored] = useState(false);

  const live = useRef({});
  live.current = { queue, index, shuffle, repeat, current: queue[index] || null };
  const loaded = useRef(null);
  const pendingSeek = useRef(null);
  const resumeAt = useRef(0);
  const original = useRef(null);
  const askedNotifications = useRef(false);
  const handlers = useRef({});

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    }).catch(() => {});
  }, []);

  const load = useCallback(
    (item, { startAt = 0 } = {}) => {
      // A downloaded song plays from the phone, so it works offline and saves data.
      const local = item.kind === "track" ? offline.current.localUri(item.id) : null;
      loaded.current = { id: item.id, attempt: 0, failed: false, local: !!local };
      pendingSeek.current = startAt > 1 ? startAt : null;
      setError(null);
      setBuffering(true);
      player.replace({ uri: local || sourceFor(item, 0), name: item.title });
      player.play();
      if (Platform.OS === "android" && !askedNotifications.current) {
        askedNotifications.current = true;
        requestNotificationPermissionsAsync().catch(() => {});
      }
      try {
        player.setActiveForLockScreen(true, lockScreenMetadata(item), lockScreenOptions(item));
      } catch {}
      if (item.kind === "radio") reportClick(item.uuid);
      lib.current.addHistory(item);
      lib.current.recordEvent("started", item);
    },
    [player],
  );

  const goTo = useCallback(
    (list, i) => {
      live.current.queue = list;
      live.current.index = i;
      setQueue(list);
      setIndex(i);
      load(list[i]);
    },
    [load],
  );

  const advance = useCallback(
    (auto = false) => {
      const { queue, index, repeat, current } = live.current;
      if (!queue.length) return;
      if (!auto) lib.current.recordEvent("skipped", current, { seconds: player.currentTime });
      let n = index + 1;
      if (n >= queue.length) {
        if (auto && repeat !== "all") {
          player.pause();
          player.seekTo(0).catch(() => {});
          return;
        }
        n = 0;
      }
      goTo(queue, n);
    },
    [goTo, player],
  );

  handlers.current = {
    onFinish() {
      const { current, repeat } = live.current;
      if (!current || current.kind === "radio") return;
      lib.current.recordEvent("completed", current, { seconds: current.duration || player.duration });
      if (repeat === "one") {
        player
          .seekTo(0)
          .then(() => player.play())
          .catch(() => {});
        return;
      }
      advance(true);
    },
    onError() {
      const item = live.current.current;
      const state = loaded.current;
      if (!item || !state || state.id !== item.id || state.failed) return;
      // The saved file is gone or won't decode; stream the song instead, from where the file
      // stopped (a download removed mid-song fails on the next seek, not at the start).
      if (state.local) {
        state.local = false;
        if (pendingSeek.current == null && player.currentTime > 1) pendingSeek.current = player.currentTime;
        player.replace({ uri: sourceFor(item, 0), name: item.title });
        player.play();
        return;
      }
      // Audius serves the same stream from more than one host; try the next one first.
      if (fromAudius(item) && state.attempt + 1 < streamHostCount) {
        state.attempt += 1;
        player.replace({ uri: sourceFor(item, state.attempt), name: item.title });
        player.play();
        return;
      }
      state.failed = true;
      setBuffering(false);
      setError(
        item.kind === "radio"
          ? "This station is offline right now. Try another one."
          : "This song couldn't be played. Try the next one.",
      );
    },
  };

  useEffect(() => {
    const sub = player.addListener("playbackStatusUpdate", (s) => {
      setPlaying(s.playing);
      setBuffering(Boolean(loaded.current) && !loaded.current.failed && !s.error && (s.isBuffering || !s.isLoaded));
      if (s.isLoaded && pendingSeek.current != null) {
        const to = pendingSeek.current;
        pendingSeek.current = null;
        player.seekTo(to).catch(() => {});
      }
      if (s.error) handlers.current.onError();
      if (s.didJustFinish) handlers.current.onFinish();
    });
    return () => sub.remove();
  }, [player]);

  const start = useCallback(
    (items, startIndex = 0, forceShuffle) => {
      let list = items.filter(Boolean);
      if (!list.length) return;
      let i = Math.min(Math.max(0, startIndex), list.length - 1);
      const useShuffle = forceShuffle ?? live.current.shuffle;
      original.current = useShuffle ? list : null;
      if (useShuffle) {
        list = [list[i], ...shuffleArray(list.filter((_, k) => k !== i))];
        i = 0;
      }
      if (forceShuffle !== undefined) setShuffle(forceShuffle);
      goTo(list, i);
    },
    [goTo],
  );

  const toggle = useCallback(() => {
    const { current } = live.current;
    if (!current) return;
    if (loaded.current?.id !== current.id || loaded.current?.failed) {
      load(current, { startAt: resumeAt.current });
      resumeAt.current = 0;
      return;
    }
    if (player.playing) player.pause();
    // A paused live stream is stale; reconnect to the live edge instead of resuming.
    else if (current.kind === "radio") load(current);
    else player.play();
  }, [load, player]);

  const playItem = useCallback(
    (item, list) => {
      if (live.current.current?.id === item.id) {
        if (!player.playing) toggle();
        return;
      }
      const items = list?.length ? list : [item];
      const i = items.findIndex((t) => t.id === item.id);
      start(i < 0 ? [item, ...items] : items, Math.max(0, i));
    },
    [player, start, toggle],
  );

  const playAll = useCallback(
    (items, { shuffle: random = false } = {}) => {
      if (!items?.length) return;
      start(items, random ? Math.floor(Math.random() * items.length) : 0, random);
    },
    [start],
  );

  const previous = useCallback(() => {
    const { queue, index, current } = live.current;
    if (!current) return;
    if ((current.kind === "track" && player.currentTime > 4) || index <= 0) {
      player.seekTo(0).catch(() => {});
      return;
    }
    goTo(queue, index - 1);
  }, [goTo, player]);

  const toggleShuffle = useCallback(() => {
    const { queue, index, shuffle, current } = live.current;
    if (!shuffle && queue.length > 1) {
      original.current = queue;
      setQueue([current, ...shuffleArray(queue.filter((_, k) => k !== index))]);
      setIndex(0);
    } else if (shuffle && original.current) {
      const extra = queue.filter((t) => !original.current.some((o) => o.id === t.id));
      const list = [...original.current, ...extra];
      setQueue(list);
      setIndex(Math.max(0, list.findIndex((t) => t.id === current?.id)));
      original.current = null;
    }
    setShuffle(!shuffle);
  }, []);

  const insert = useCallback(
    (item, atNext) => {
      const { queue, index, current } = live.current;
      if (index < 0) return start([item], 0);
      if (current?.id === item.id) return;
      const rest = queue.filter((t, k) => k <= index || t.id !== item.id);
      setQueue(atNext ? [...rest.slice(0, index + 1), item, ...rest.slice(index + 1)] : [...rest, item]);
    },
    [start],
  );

  const removeAt = useCallback((i) => {
    const { queue, index } = live.current;
    if (i === index) return;
    setQueue(queue.filter((_, k) => k !== i));
    if (i < index) setIndex(index - 1);
  }, []);

  const move = useCallback((i, dir) => {
    const { queue, index } = live.current;
    const j = i + dir;
    if (i <= index || j <= index || j >= queue.length) return;
    const list = [...queue];
    [list[i], list[j]] = [list[j], list[i]];
    setQueue(list);
  }, []);

  useEffect(() => {
    if (!sleepAt) return;
    const timer = setTimeout(() => {
      player.pause();
      setSleepAt(null);
    }, Math.max(0, sleepAt - Date.now()));
    return () => clearTimeout(timer);
  }, [sleepAt, player]);

  // Restore the last session paused; playback resumes where it stopped on the next tap.
  useEffect(() => {
    storage.read("player", null).then((saved) => {
      if (saved?.queue?.length) {
        setQueue(saved.queue);
        setIndex(Math.min(Math.max(0, saved.index ?? 0), saved.queue.length - 1));
        setShuffle(!!saved.shuffle);
        setRepeat(saved.repeat || "off");
        resumeAt.current = saved.position || 0;
      }
      setRestored(true);
    });
  }, []);

  const save = useCallback(() => {
    const { queue, index, shuffle, repeat, current } = live.current;
    const position =
      current?.kind === "track" && loaded.current?.id === current.id ? player.currentTime : resumeAt.current;
    storage.write("player", { queue: queue.slice(0, 200).map(slim), index, shuffle, repeat, position });
  }, [player]);

  useEffect(() => {
    if (restored) save();
  }, [queue, index, shuffle, repeat, restored, save]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(save, 10000);
    return () => clearInterval(timer);
  }, [playing, save]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s !== "active" && save());
    return () => sub.remove();
  }, [save]);

  const value = useMemo(
    () => ({
      player,
      queue,
      index,
      current: queue[index] || null,
      playing,
      buffering,
      error,
      shuffle,
      repeat,
      sleepAt,
      playItem,
      playAll,
      toggle,
      next: () => advance(false),
      previous,
      seek: (seconds) => player.seekTo(Math.max(0, seconds)).catch(() => {}),
      toggleShuffle,
      cycleRepeat: () => setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off")),
      addToQueue: (item) => insert(item, false),
      playNext: (item) => insert(item, true),
      removeAt,
      move,
      clearUpcoming: () => setQueue((q) => q.slice(0, live.current.index + 1)),
      jumpTo: (i) => goTo(live.current.queue, i),
      setSleepTimer: (minutes) => setSleepAt(minutes ? Date.now() + minutes * 60000 : null),
      dismissError: () => setError(null),
    }),
    [player, queue, index, playing, buffering, error, shuffle, repeat, sleepAt, playItem, playAll, toggle, advance, previous, toggleShuffle, insert, removeAt, move, goTo],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export const usePlayer = () => useContext(PlayerContext);

export function useProgress() {
  const { player, current } = usePlayer();
  const status = useAudioPlayerStatus(player);
  return {
    position: status.currentTime || 0,
    duration: status.duration || current?.duration || 0,
    isLive: current?.kind === "radio",
  };
}
