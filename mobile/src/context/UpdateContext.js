import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { isAbort } from "../services/net";
import { storage } from "../services/storage";
import { canInstall, checkForUpdate, cleanupDownloads, currentVersion, downloadUpdate, installApk } from "../services/updates";
import { isNewerVersion } from "../utils/version";

const UpdateContext = createContext(null);
// Download ticks live apart so the Home banner and Library badge don't re-render with every percent.
const ProgressContext = createContext(0);

const STORE_KEY = "updates";
const AUTO_CHECK_EVERY = 12 * 60 * 60 * 1000;
// GitHub allows 60 unauthenticated calls an hour per IP, so repeated taps reuse a fresh answer.
const MIN_CHECK_GAP = 60 * 1000;

const initial = {
  status: "idle", // idle | checking | available | upToDate | downloading | ready | error
  latest: null,
  error: null,
  lastChecked: 0,
  fileUri: null,
  // Set when the installer came back without updating us, usually because "Install unknown apps" is off.
  installTried: false,
};

const isAvailable = (latest) => !!latest && isNewerVersion(latest.version, currentVersion());
const settled = (latest) => (isAvailable(latest) ? "available" : "upToDate");
// A check stamped in the future (the clock was ahead back then) counts as stale, not as fresh forever.
const isFresh = (ts, maxAge) => {
  const age = Date.now() - ts;
  return age >= 0 && age < maxAge;
};

export function UpdateProvider({ children }) {
  const [state, setState] = useState(initial);
  const [progress, setProgress] = useState(0);
  const latestState = useRef(state);
  latestState.current = state;
  const checking = useRef(null); // { ctrl, silent }
  const downloading = useRef(null);
  // Settles once the last download has finished, including the cleanup a cancelled one still runs.
  const lastDownload = useRef(Promise.resolve());
  // The APK finished while Vibe was in the background; Android would silently block the installer then.
  const pendingInstall = useRef(null);
  const restored = useRef(false);

  // Patches may be functions of the previous state; returning null skips the render.
  const set = useCallback(
    (patch) =>
      setState((s) => {
        const p = typeof patch === "function" ? patch(s) : patch;
        return p ? { ...s, ...p } : s;
      }),
    [],
  );

  const check = useCallback(
    async ({ silent = false } = {}) => {
      const s = latestState.current;
      if (downloading.current) return;
      if (checking.current) {
        // A tap during the quiet background check takes it over, so its answer or error shows up.
        if (!silent && checking.current.silent) {
          checking.current.silent = false;
          set({ status: "checking", error: null });
        }
        return;
      }
      if (!silent && s.status !== "error" && isFresh(s.lastChecked, MIN_CHECK_GAP)) {
        set({ status: s.fileUri ? "ready" : settled(s.latest), error: null });
        return;
      }
      const run = { ctrl: new AbortController(), silent };
      checking.current = run;
      if (!silent) set({ status: "checking", error: null });
      try {
        const { latest } = await checkForUpdate(run.ctrl.signal);
        const lastChecked = Date.now();
        storage.write(STORE_KEY, { latest, lastChecked });
        set((prev) =>
          // A finished download of the same version stays ready to install.
          prev.fileUri && prev.latest?.version === latest?.version
            ? { latest, lastChecked, status: "ready", error: null }
            : { latest, lastChecked, status: settled(latest), error: null, fileUri: null, installTried: false },
        );
      } catch (e) {
        // Background checks fail quietly; the next launch tries again.
        if (run.silent || (isAbort(e) && run.ctrl.signal.aborted)) return;
        set({ status: "error", error: e?.message || "Couldn't check for updates." });
      } finally {
        if (checking.current === run) checking.current = null;
      }
    },
    [set],
  );

  const install = useCallback(
    async (uri) => {
      const fileUri = uri || latestState.current.fileUri;
      if (!fileUri) return;
      set({ error: null });
      try {
        await installApk(fileUri);
        set({ installTried: true });
      } catch (e) {
        if (e?.missing) set((s) => ({ fileUri: null, status: settled(s.latest), error: e.message }));
        else set({ installTried: true, error: e?.message || "Android couldn't start the installer." });
      }
    },
    [set],
  );

  const download = useCallback(async () => {
    const { latest } = latestState.current;
    if (!isAvailable(latest) || downloading.current) return;
    checking.current?.ctrl.abort();
    const ctrl = new AbortController();
    downloading.current = ctrl;
    pendingInstall.current = null;
    setProgress(0);
    set({ status: "downloading", error: null, fileUri: null, installTried: false });
    // A cancelled download may still be deleting its partial file, which has the same name as ours.
    const run = lastDownload.current.then(() =>
      downloadUpdate(
        latest,
        // Whole percents are enough for the bar and keep re-renders down.
        (p) => ctrl.signal.aborted || setProgress((prev) => (Math.round(p * 100) === Math.round(prev * 100) ? prev : p)),
        ctrl.signal,
      ),
    );
    lastDownload.current = run.catch(() => {});
    try {
      const fileUri = await run;
      if (ctrl.signal.aborted) return;
      set({ status: "ready", fileUri });
      if (AppState.currentState === "active") install(fileUri);
      else pendingInstall.current = fileUri;
    } catch (e) {
      if (isAbort(e) || ctrl.signal.aborted) return;
      set({ status: "error", error: e?.message || "The download didn't finish." });
    } finally {
      if (downloading.current === ctrl) downloading.current = null;
    }
  }, [install, set]);

  const cancel = useCallback(() => {
    checking.current?.ctrl.abort();
    downloading.current?.abort();
    checking.current = null;
    downloading.current = null;
    set((s) => ({ status: s.lastChecked ? settled(s.latest) : "idle", error: null }));
  }, [set]);

  // Restore the last answer, then check quietly at most every 12 hours: on launch
  // and whenever Vibe returns to the front (music apps live in the background for days).
  useEffect(() => {
    if (!canInstall) return;
    let alive = true;
    const autoCheck = (lastChecked) => {
      if (restored.current && !isFresh(lastChecked, AUTO_CHECK_EVERY)) check({ silent: true });
    };
    storage.read(STORE_KEY, null).then((saved) => {
      if (!alive) return;
      const latest = saved?.latest || null;
      const lastChecked = Number(saved?.lastChecked) || 0;
      setState((s) => (s.lastChecked ? s : { ...s, latest, lastChecked, status: s.status === "idle" && lastChecked ? settled(latest) : s.status }));
      restored.current = true;
      cleanupDownloads(isAvailable(latest) ? latest.version : null);
      autoCheck(lastChecked);
    });
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      const uri = pendingInstall.current;
      pendingInstall.current = null;
      if (!uri) autoCheck(latestState.current.lastChecked);
      // Skipped when a newer check replaced the download meanwhile.
      else if (uri === latestState.current.fileUri) install(uri);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [check, install]);

  useEffect(
    () => () => {
      checking.current?.ctrl.abort();
      downloading.current?.abort();
    },
    [],
  );

  const value = useMemo(
    () => ({ ...state, current: currentVersion(), available: isAvailable(state.latest), canInstall, check, download, install, cancel }),
    [state, check, download, install, cancel],
  );

  return (
    <UpdateContext.Provider value={value}>
      <ProgressContext.Provider value={progress}>{children}</ProgressContext.Provider>
    </UpdateContext.Provider>
  );
}

export const useUpdates = () => useContext(UpdateContext);

// 0..1 while an update downloads; only the updates screen reads it.
export const useUpdateProgress = () => useContext(ProgressContext);
