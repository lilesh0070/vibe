// Hermes lacks AbortSignal.timeout/any, so requests combine the caller's signal
// with their own timeout here.
export async function fetchJson(url, { signal, timeout = 9000, headers } = {}) {
  if (signal?.aborted) throw abortError();
  const ctrl = new AbortController();
  const forward = () => ctrl.abort();
  const timer = setTimeout(forward, timeout);
  signal?.addEventListener?.("abort", forward);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers });
    if (!r.ok) throw Object.assign(new Error(`Request failed (${r.status})`), { status: r.status });
    return await r.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", forward);
  }
}

export const abortError = () => {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
};

export const isAbort = (e) => e?.name === "AbortError";

export const uniqueBy = (items, key = (t) => t.id) => [
  ...new Map(items.filter(Boolean).map((t) => [key(t), t])).values(),
];
