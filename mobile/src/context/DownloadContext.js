import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { slim } from "./LibraryContext";
import { useStableArray } from "../hooks/useStableArray";
import { canDownload, downloadTrack, removeAllDownloads, removeDownload, verifyDownloads } from "../services/downloads";
import { abortError, isAbort, uniqueBy } from "../services/net";
import { storage } from "../services/storage";
import { isDownloadable, isPending, newestFirst, percent, restoreEntries, summarizeOutcomes, toSaved, totalBytes } from "../utils/downloads";

const DownloadContext = createContext(null);
const SavedContext = createContext({ list: [], tracks: [], totalBytes: 0 });
// Percent ticks live apart, per song, so only the row or button showing that song re-renders.
const ProgressContext = createContext(null);

const STORE_KEY = "downloads";
const CONCURRENCY = 2;

function createProgressStore() {
  const values = new Map();
  const listeners = new Map();
  const emit = (id) => listeners.get(id)?.forEach((fn) => fn());
  return {
    get: (id) => values.get(id) ?? 0,
    set(id, value) {
      if (values.get(id) === value) return;
      values.set(id, value);
      emit(id);
    },
    clear(id) {
      if (values.delete(id)) emit(id);
    },
    subscribe(id, fn) {
      if (!listeners.has(id)) listeners.set(id, new Set());
      const set = listeners.get(id);
      set.add(fn);
      return () => {
        set.delete(fn);
        if (!set.size) listeners.delete(id);
      };
    },
  };
}

// entries: { [id]: { id, track, uri, bytes, addedAt, status, error } } where status is
// queued | downloading | done | error. A ref mirrors the state so actions see changes at once
// and two quick taps on the same song never start two downloads.
export function DownloadProvider({ children }) {
  const [entries, setEntries] = useState({});
  const [progress] = useState(createProgressStore);
  const store = useRef({});
  const jobs = useRef(new Map()); // id -> job while queued or downloading
  const queue = useRef([]); // jobs waiting for a free slot, in order
  const active = useRef(new Set());
  // Per song, settles once its last file work (a transfer, a cancel's cleanup, a removal) is over,
  // so a new download never races a delete of the same file.
  const settling = useRef(new Map());
  const wiping = useRef(Promise.resolve());
  // Bumped by removeAll, so a startup restore still in flight doesn't bring the old list back.
  const epoch = useRef(0);
  // Nothing starts (or is saved over the stored list) before the startup check, which deletes
  // files it doesn't recognise.
  const started = useRef(false);
  const saving = useRef({ busy: false, again: false });

  const actions = useMemo(() => {
    // Every change is saved straight away, one write at a time, with no timer: Android pauses JS
    // timers in the background while downloads keep finishing, and a song that finished there
    // must still count as downloaded if the app is killed before it comes back.
    const save = () => {
      const s = saving.current;
      if (!started.current) return;
      if (s.busy) {
        s.again = true;
        return;
      }
      s.busy = true;
      s.again = false;
      storage.write(STORE_KEY, toSaved(store.current)).finally(() => {
        s.busy = false;
        if (s.again) save();
      });
    };

    const commit = (fn) => {
      const next = fn(store.current);
      if (next === store.current) return;
      store.current = next;
      setEntries(next);
      save();
    };
    const patch = (id, fields) => commit((s) => (s[id] ? { ...s, [id]: { ...s[id], ...fields } } : s));
    const drop = (ids) =>
      commit((s) => {
        if (!ids.some((id) => s[id])) return s;
        const next = { ...s };
        ids.forEach((id) => delete next[id]);
        return next;
      });

    const settle = (id, promise) => {
      const done = promise.then(
        () => {},
        () => {},
      );
      settling.current.set(id, done);
      done.then(() => settling.current.get(id) === done && settling.current.delete(id));
    };

    const finish = (job, outcome) => {
      job.over = true;
      if (jobs.current.get(job.id) === job) jobs.current.delete(job.id);
      active.current.delete(job);
      job.resolve(outcome);
    };

    const run = (job) => {
      const { id } = job;
      const ctrl = new AbortController();
      job.ctrl = ctrl;
      active.current.add(job);
      patch(id, { status: "downloading", error: null });
      progress.set(id, 0);
      // Late progress events (they cross the native bridge) must not revive a finished bar.
      const onProgress = (p) => job.over || progress.set(id, percent(p, 1));
      const work = Promise.all([settling.current.get(id), wiping.current]).then(async () => {
        if (ctrl.signal.aborted) throw abortError();
        const result = await downloadTrack(job.track, { onProgress, signal: ctrl.signal });
        // Cancelled in the moment it finished: the file goes too.
        if (ctrl.signal.aborted) {
          await removeDownload(result.uri);
          throw abortError();
        }
        return result;
      });
      settle(id, work);
      work
        .then(
          ({ uri, bytes }) => {
            // Cancelled meanwhile; the startup check deletes the stray file.
            if (job.over) return;
            patch(id, { status: "done", uri, bytes, addedAt: Date.now(), error: null });
            finish(job, { status: "done" });
          },
          (e) => {
            if (ctrl.signal.aborted || isAbort(e)) return finish(job, { status: "cancelled" });
            const error = e?.message || "The download didn't finish.";
            patch(id, { status: "error", error });
            finish(job, { status: "error", error, code: e?.code });
            // Every song after this one would hit the same full disk; stop the queue instead.
            if (e?.code === "space") dropQueued({ status: "error", error, code: "space" });
          },
        )
        .finally(() => {
          // A new download of the same song may already own the bar.
          if (!jobs.current.has(id)) progress.clear(id);
          pump();
        });
    };

    const pump = () => {
      if (!started.current) return;
      while (active.current.size < CONCURRENCY && queue.current.length) {
        const job = queue.current.shift();
        if (jobs.current.get(job.id) === job && !job.ctrl) run(job);
      }
    };

    const dropQueued = (outcome) => {
      const waiting = queue.current;
      queue.current = [];
      waiting.forEach((job) => finish(job, outcome));
      drop(waiting.map((job) => job.id));
    };

    // `first` puts the songs ahead of the songs already waiting (a running batch).
    const enqueue = (tracks, first = false) => {
      const created = tracks.map((t) => {
        let resolve;
        const promise = new Promise((r) => (resolve = r));
        return { id: t.id, track: slim(t), ctrl: null, over: false, resolve, promise };
      });
      created.forEach((job) => jobs.current.set(job.id, job));
      queue.current = first ? [...created, ...queue.current] : [...queue.current, ...created];
      const addedAt = Date.now();
      commit((s) => {
        const next = { ...s };
        created.forEach((job) => {
          next[job.id] = { id: job.id, track: job.track, uri: null, bytes: 0, addedAt, status: "queued", error: null };
        });
        return next;
      });
      pump();
      return created.map((job) => job.promise);
    };

    const wanted = (t) => isDownloadable(t) && !jobs.current.has(t.id) && store.current[t.id]?.status !== "done";

    const cancelJobs = (list) => {
      if (!list.length) return;
      const gone = new Set(list);
      // Out of the queue first, so stopping a running job doesn't hand its slot to a doomed one.
      queue.current = queue.current.filter((job) => !gone.has(job));
      list.forEach((job) => {
        job.ctrl?.abort();
        finish(job, { status: "cancelled" });
        progress.clear(job.id);
      });
      drop(list.map((job) => job.id));
      pump();
    };

    const cancelAll = () => cancelJobs([...jobs.current.values()]);

    // Stops these songs wherever they are in the queue; returns how many were on their way.
    const cancelMany = (ids) => {
      const unique = [...new Set(ids)];
      const list = unique.map((id) => jobs.current.get(id)).filter(Boolean);
      // Restored from storage but not picked up yet (the startup check is still running).
      const restored = unique.filter((id) => !jobs.current.has(id) && isPending(store.current[id]));
      cancelJobs(list);
      drop(restored);
      return list.length + restored.length;
    };

    return {
      // Resolves once this song is finished: { status: done | error | cancelled | skipped, error? }.
      // A song asked for on its own starts next, ahead of a running "Download all".
      download(t) {
        if (!canDownload || !isDownloadable(t)) return Promise.resolve({ status: "skipped" });
        const job = jobs.current.get(t.id);
        if (job) {
          if (!job.ctrl) queue.current = [job, ...queue.current.filter((j) => j !== job)];
          return job.promise;
        }
        if (store.current[t.id]?.status === "done") return Promise.resolve({ status: "done" });
        return enqueue([t], true)[0];
      },
      // Skips radio and songs already saved or on their way; failed ones are retried.
      // Resolves to a summary once every song in the batch is finished.
      downloadMany(tracks) {
        const picked = canDownload ? uniqueBy((tracks || []).filter(wanted)) : [];
        if (!picked.length) return Promise.resolve(summarizeOutcomes([]));
        return Promise.all(enqueue(picked)).then(summarizeOutcomes);
      },
      cancel: (id) => cancelMany([id]) > 0,
      cancelMany,
      cancelAll,
      remove(id) {
        const job = jobs.current.get(id);
        if (job) {
          cancelJobs([job]);
          return true;
        }
        const entry = store.current[id];
        if (!entry) return false;
        drop([id]);
        if (entry.uri) settle(id, removeDownload(entry.uri));
        return true;
      },
      removeAll() {
        epoch.current++;
        cancelAll();
        commit(() => ({}));
        const pending = [...settling.current.values(), wiping.current];
        wiping.current = Promise.all(pending).then(removeAllDownloads).catch(() => {});
      },
      // Startup: show saved songs at once, check their files, then resume unfinished downloads.
      async restore(isAlive) {
        const since = epoch.current;
        const saved = await storage.read(STORE_KEY, []);
        if (!isAlive()) return;
        const restored = epoch.current === since ? restoreEntries(saved) : {};
        // Songs tapped before storage answered win over their saved copies.
        commit((s) => ({ ...restored, ...s }));
        const finished = Object.values(restored).filter((e) => e.status === "done");
        const kept = await verifyDownloads(finished);
        if (!isAlive()) return;
        commit((s) => {
          const next = { ...s };
          for (const e of finished) {
            // Removed or replaced while the check ran: leave it alone.
            if (next[e.id] !== e) continue;
            const file = kept.get(e.id);
            if (file) next[e.id] = { ...e, ...file };
            else delete next[e.id];
          }
          return next;
        });
        const resume = Object.values(store.current).filter((e) => e.status === "queued" && !jobs.current.has(e.id));
        if (resume.length) {
          drop(resume.map((e) => e.id));
          enqueue(resume.map((e) => e.track));
        }
        started.current = true;
        save();
        pump();
      },
      stopAll() {
        jobs.current.forEach((job) => job.ctrl?.abort());
      },
    };
  }, [progress]);

  useEffect(() => {
    if (!canDownload) return;
    let alive = true;
    actions.restore(() => alive);
    return () => {
      alive = false;
      actions.stopAll();
    };
  }, [actions]);

  // Finished downloads, newest first: { id, track, uri, bytes, addedAt }. Kept as the same
  // arrays while the finished set is unchanged, so queue steps don't re-render every saved row.
  const list = useStableArray(useMemo(() => newestFirst(entries), [entries]));
  const saved = useMemo(() => ({ list, tracks: list.map((e) => e.track), totalBytes: totalBytes(list) }), [list]);

  const value = useMemo(() => {
    const { restore, stopAll, ...rest } = actions;
    const all = Object.values(entries);
    return {
      ...rest,
      ...saved,
      available: canDownload,
      pending: all.filter(isPending),
      failed: all.filter((e) => e.status === "error"),
      isDownloaded: (id) => entries[id]?.status === "done",
      statusOf: (id) => entries[id]?.status || null,
      localUri: (id) => (entries[id]?.status === "done" ? entries[id].uri : null),
    };
  }, [entries, saved, actions]);

  return (
    <DownloadContext.Provider value={value}>
      <SavedContext.Provider value={saved}>
        <ProgressContext.Provider value={progress}>{children}</ProgressContext.Provider>
      </SavedContext.Provider>
    </DownloadContext.Provider>
  );
}

export const useDownloads = () => useContext(DownloadContext);

// Only the finished downloads ({ list, tracks, totalBytes }), for screens that show what is on
// the phone and needn't re-render on every queue step.
export const useSavedDownloads = () => useContext(SavedContext);

// 0..100 while `id` downloads; re-renders only when that song's whole percent changes.
export function useDownloadProgress(id) {
  const store = useContext(ProgressContext);
  const subscribe = useCallback((fn) => store.subscribe(id, fn), [store, id]);
  const read = () => store.get(id);
  return useSyncExternalStore(subscribe, read, read);
}
