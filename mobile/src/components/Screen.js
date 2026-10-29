import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme";
import { MiniPlayer } from "./PlayerBits";
import { IconButton, T } from "./ui";

export const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

// Tab screens: the tab bar (with the mini player) sits below, so only the top inset is needed.
export function TabScreen({ children, refreshControl }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

// Pushed screens: back button on top, mini player docked at the bottom.
export function DetailScreen({ title, right, children }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.fill}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton name="chevron-left" label="Back" onPress={goBack} />
        <T variant="h3" numberOfLines={1} style={styles.title}>{title}</T>
        {right || <View style={{ width: 44 }} />}
      </View>
      <ScrollView style={styles.fill} contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      <MiniPlayer docked />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 10, backgroundColor: colors.bg, zIndex: 1 },
  title: { flex: 1, textAlign: "center" },
});
