export const formatTime = (seconds = 0) => {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = String(n % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

// Hermes' Intl does not reliably support compact notation, so format by hand.
export const compact = (n = 0) => {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${trim(v / 1e6)}M`;
  if (v >= 1e3) return `${trim(v / 1e3)}K`;
  return String(Math.round(v));
};
const trim = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);

export const songs = (n = 0) => `${n} ${n === 1 ? "song" : "songs"}`;

export const greeting =(date = new Date()) => {
  const h = date.getHours();
  if (h < 5) return "Late night vibes";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

export const shuffleArray = (items) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
