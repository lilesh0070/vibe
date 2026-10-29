// No imports on purpose: node tests load this file directly.

// "v3.0.1", "3.0", " V3.0.1-beta.2 " -> { core: [3, 0, 1], pre: "beta.2" }; anything else -> null.
export const parseVersion = (input) => {
  const m = String(input ?? "")
    .trim()
    .match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/i);
  if (!m) return null;
  return { core: [m[1], m[2], m[3]].map((n) => Number(n) || 0), pre: m[4] || "" };
};

// Like Array.sort comparators: negative when a is older, 0 when equal, positive when newer.
export const compareVersions = (a, b) => {
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] - b.core[i];
  }
  // A pre-release ships before its final version: 3.0.1-beta < 3.0.1.
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return a.pre.localeCompare(b.pre, "en", { numeric: true });
};

// Unknown or garbage versions never count as newer, so a bad tag cannot cause an update loop.
export const isNewerVersion = (latest, current) => {
  const l = parseVersion(latest);
  const c = parseVersion(current);
  return !!l && !!c && compareVersions(l, c) > 0;
};

// "v3.0.1" -> "3.0.1", for labels and file names.
export const cleanVersion = (input) => {
  const v = parseVersion(input);
  return v ? v.core.join(".") + (v.pre ? `-${v.pre}` : "") : null;
};
