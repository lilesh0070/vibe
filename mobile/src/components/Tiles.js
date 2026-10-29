import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { colors, gradients, radius, shadow } from "../theme";
import { genreLabel } from "../services/audius";
import { Neu, NeuPressable, T } from "./ui";

export function AccentDot({ icon, size = 38 }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2 }, shadow.glow]}>
      <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.center, { flex: 1, borderRadius: size / 2 }]}>
        <Feather name={icon} size={size * 0.45} color={colors.onAccent} />
      </LinearGradient>
    </View>
  );
}

// The decorative "coin in a dish" from the soft-UI reference: raised disc, inset ring, glowing center.
export function SoftDisc({ size = 132, icon = "music", children }) {
  return (
    <Neu r={size / 2} style={[styles.center, { width: size, height: size }]}>
      <Neu inset r={size * 0.38} style={[styles.center, { width: size * 0.76, height: size * 0.76 }]}>
        {children || <AccentDot icon={icon} size={size * 0.42} />}
      </Neu>
    </Neu>
  );
}

export function QuickTile({ icon, label, value, onPress }) {
  return (
    <NeuPressable onPress={onPress} r={radius.lg} depth="md" style={styles.quick} accessibilityLabel={`${label}${value != null ? `, ${value}` : ""}`}>
      <AccentDot icon={icon} size={34} />
      <T variant="h3" style={{ marginTop: 10 }}>{value}</T>
      <T variant="small" numberOfLines={1}>{label}</T>
    </NeuPressable>
  );
}

export function GenreGrid({ items }) {
  return (
    <View style={styles.grid}>
      {items.map((g) => (
        <NeuPressable key={g.name} onPress={() => router.push(`/genre/${encodeURIComponent(g.name)}`)} r={radius.lg} depth="sm" style={styles.genre} accessibilityLabel={genreLabel(g.name)}>
          <Neu inset depth="sm" r={16} style={[styles.center, { width: 42, height: 42 }]}>
            <Feather name={g.icon} size={18} color={colors.accentDeep} />
          </Neu>
          <View style={{ flex: 1 }}>
            <T variant="h3" numberOfLines={1}>{genreLabel(g.name)}</T>
            <T variant="small" numberOfLines={1}>{g.subtitle}</T>
          </View>
        </NeuPressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  quick: { flex: 1, padding: 14, minHeight: 112 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16, paddingHorizontal: 20 },
  genre: { flexBasis: "46%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
});
