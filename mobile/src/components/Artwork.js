import { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@expo/vector-icons/Feather";
import { radius } from "../theme";
import { T } from "./ui";

const palettes = [
  ["#FFD3A8", "#FF9A5C"],
  ["#FFC9B0", "#F2846B"],
  ["#FBE0B5", "#F4AE5A"],
  ["#D9DDF5", "#A9B2E3"],
  ["#CDE8E1", "#8CC7B8"],
  ["#F3D5E6", "#D99ABD"],
];

const hash = (s = "") => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

const initials = (s = "") =>
  s
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

// Shows the cover when it loads; otherwise a warm gradient with initials so
// stations and tracks without art still look intentional.
export function Artwork({ uri, size, title, kind, round, r = radius.md, style }) {
  const [failed, setFailed] = useState(false);
  const shape = { width: size, height: size, borderRadius: round ? size / 2 : r, overflow: "hidden" };
  if (uri && !failed)
    return (
      <Image
        source={{ uri }}
        style={[shape, { backgroundColor: "#DADFE8" }, style]}
        contentFit="cover"
        transition={180}
        recyclingKey={uri}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    );
  const [from, to] = palettes[hash(title) % palettes.length];
  const label = initials(title);
  return (
    <View style={[shape, style]}>
      <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        {label && size >= 56 ? (
          <T style={{ fontFamily: "Nunito_800ExtraBold", fontSize: size * 0.3, lineHeight: size * 0.38, color: "rgba(255,255,255,0.95)" }}>{label}</T>
        ) : (
          <Feather name={kind === "radio" ? "radio" : "music"} size={size * 0.4} color="rgba(255,255,255,0.95)" />
        )}
      </LinearGradient>
    </View>
  );
}
