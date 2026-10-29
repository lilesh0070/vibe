import { useCallback, useEffect, useRef, useState } from "react";
import { isAbort } from "../services/net";

// Runs an abortable loader whenever deps change; keeps the last data while reloading.
export function useAsync(loader, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(loader);
  latest.current = loader;

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    latest
      .current(ctrl.signal)
      .then((data) => !ctrl.signal.aborted && setState({ data, loading: false, error: null }))
      .catch((error) => {
        if (ctrl.signal.aborted || isAbort(error)) return;
        setState((s) => ({ ...s, loading: false, error: error?.message || "Something went wrong" }));
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt, enabled]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
