// Soft UI (neumorphism): one base surface, a light highlight from the top-left
// and a cool shade to the bottom-right. Text colors keep at least 4.5:1 contrast
// against the base so the soft look does not cost readability.
export const colors = {
  bg: "#E7EAF0",
  text: "#2D3340",
  muted: "#586074",
  faint: "#8C94A6",
  accent: "#FF8A3D",
  accentDeep: "#E8611F",
  accentText: "#B8460F",
  onAccent: "#FFFFFF",
  live: "#E5484D",
  highlight: "rgba(255,255,255,0.95)",
  shade: "rgba(160,170,190,0.62)",
};

export const gradients = {
  accent: ["#FFB36B", "#FF7A2F"],
  warm: ["#FFD3A8", "#FFA36B"],
};

const raised = (d, blur) =>
  `-${d}px -${d}px ${blur}px ${colors.highlight}, ${d}px ${d}px ${blur}px ${colors.shade}`;
const inset = (d, blur) =>
  `inset ${d}px ${d}px ${blur}px ${colors.shade}, inset -${d}px -${d}px ${blur}px ${colors.highlight}`;

export const shadow = {
  raised: { boxShadow: raised(7, 16) },
  raisedSm: { boxShadow: raised(4, 9) },
  raisedXs: { boxShadow: raised(2, 5) },
  inset: { boxShadow: inset(4, 9) },
  insetSm: { boxShadow: inset(2, 5) },
  glow: {
    boxShadow: `-5px -5px 12px ${colors.highlight}, 6px 8px 16px rgba(232,97,31,0.38)`,
  },
};

export const radius = { sm: 12, md: 18, lg: 24, xl: 30, round: 999 };

export const font = {
  regular: "Nunito_400Regular",
  medium: "Nunito_600SemiBold",
  bold: "Nunito_700Bold",
  black: "Nunito_800ExtraBold",
};

export const space = { xs: 6, sm: 10, md: 16, lg: 22, xl: 30 };

// Tab bar and mini player float over the content; screens pad their bottom by this.
export const BOTTOM_CHROME = 168;
