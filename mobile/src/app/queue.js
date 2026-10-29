import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { usePlayer } from "../context/PlayerContext";
import { Artwork } from "../components/Artwork";
import { goBack } from "../components/Screen";
import { TrackRow } from "../components/Tracks";
import { EmptyState, IconButton, PillButton, SectionHeader, T } from "../components/ui";
import { colors, radius } from "../theme";

export default function Queue() {
  const insets = useSafeAreaInsets();
  const p = usePlayer();
  const upcoming = p.queue.slice(p.index + 1);

  return (
    <View style={[styles.fill, { paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <IconButton name="chevron-down" label="Close queue" onPress={goBack} />
        <T variant="h2" style={{ flex: 1, textAlign: "center" }}>Queue</T>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
        {p.current ? (
          <>
            <SectionHeader title="Now playing" />
            <View style={{ paddingHorizontal: 12, marginBottom: 26 }}>
              <TrackRow item={p.current} />
            </View>
          </>
        ) : null}
        <SectionHeader title={`Up next · ${upcoming.length}`} />
        {upcoming.length ? (
          <>
            <View style={{ paddingHorizontal: 12, gap: 4 }}>
              {upcoming.map((t, k) => {
                const i = p.index + 1 + k;
                return (
                  <Pressable key={t.id} onPress={() => p.jumpTo(i)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={`Play ${t.title}`}>
                    <Artwork uri={t.artwork} size={46} title={t.title} kind={t.kind} round={t.kind === "radio"} r={12} />
                    <View style={{ flex: 1 }}>
                      <T variant="h3" numberOfLines={1}>{t.title}</T>
                      <T variant="small" numberOfLines={1}>{t.artist}</T>
                    </View>
                    <Small icon="arrow-up" label="Move up" disabled={k === 0} onPress={() => p.move(i, -1)} />
                    <Small icon="arrow-down" label="Move down" disabled={k === upcoming.length - 1} onPress={() => p.move(i, 1)} />
                    <Small icon="x" label="Remove" onPress={() => p.removeAt(i)} />
                  </Pressable>
                );
              })}
            </View>
            <View style={{ alignItems: "center", marginTop: 22 }}>
              <PillButton label="Clear up next" icon="trash-2" onPress={p.clearUpcoming} />
            </View>
          </>
        ) : (
          <EmptyState icon="list" title="Nothing up next" message="Use “Add to queue” or “Play next” from any song's menu." />
        )}
      </ScrollView>
    </View>
  );
}

function Small({ icon, label, onPress, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityLabel={label} style={[styles.small, disabled && { opacity: 0.3 }]}>
      <Feather name={icon} size={17} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, marginBottom: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 8, borderRadius: radius.md },
  small: { width: 30, height: 40, alignItems: "center", justifyContent: "center" },
});
