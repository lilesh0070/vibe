import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useLibrary } from "../../context/LibraryContext";
import { usePlayer } from "../../context/PlayerContext";
import { useAsync } from "../../hooks/useAsync";
import { getStations, radioCategories } from "../../services/radio";
import { Artwork } from "../../components/Artwork";
import { TabScreen } from "../../components/Screen";
import { useToast } from "../../components/Toast";
import { SoftDisc } from "../../components/Tiles";
import { Rail, StationCard, TrackListSkeleton } from "../../components/Tracks";
import { AccentButton, Chip, EmptyState, ErrorState, LiveBadge, Neu, SectionHeader, T } from "../../components/ui";
import { colors, radius, shadow } from "../../theme";

export default function Radio() {
  const library = useLibrary();
  const [category, setCategory] = useState("bollywood");
  const stations = useAsync((s) => getStations(category, s), [category]);
  const label = radioCategories.find((c) => c.key === category)?.label;

  return (
    <TabScreen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <T variant="display">Live radio</T>
          <T variant="small" style={{ marginTop: 4 }}>Desi stations from across India and beyond, streaming live.</T>
        </View>
        <SoftDisc size={86} icon="radio" />
      </View>

      <Rail title="Saved stations" state={{ data: library.stations, loading: false, error: null }} renderItem={(item, list) => <StationCard item={item} list={list} />} round />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {radioCategories.map((c) => (
          <Chip key={c.key} label={c.label} active={c.key === category} onPress={() => setCategory(c.key)} />
        ))}
      </ScrollView>

      <SectionHeader title={label} subtitle={stations.data ? `${stations.data.length} stations` : " "} />
      {stations.error && !stations.data ? (
        <ErrorState message={stations.error} onRetry={stations.reload} />
      ) : !stations.data || stations.loading ? (
        <TrackListSkeleton />
      ) : !stations.data.length ? (
        <EmptyState icon="radio" title="No stations here yet" message="Try another category." />
      ) : (
        <View style={{ paddingHorizontal: 16, gap: 14 }}>
          {stations.data.map((s) => (
            <StationRow key={s.id} station={s} list={stations.data} />
          ))}
        </View>
      )}
    </TabScreen>
  );
}

function StationRow({ station, list }) {
  const { current, playing, buffering, playItem, toggle } = usePlayer();
  const library = useLibrary();
  const toast = useToast();
  const active = current?.id === station.id;
  const saved = library.isStationSaved(station.id);
  const play = () => (active ? toggle() : playItem(station, list));
  return (
    <Neu depth="sm" r={radius.lg} style={[styles.station, active && shadow.insetSm]}>
      <Pressable onPress={play} accessibilityRole="button" accessibilityLabel={`${station.title}, live radio`} style={({ pressed }) => [styles.stationMain, pressed && { opacity: 0.6 }]}>
        <Neu inset depth="sm" r={32} style={styles.logo}>
          <Artwork uri={station.artwork} size={50} title={station.title} kind="radio" round />
        </Neu>
        <View style={{ flex: 1 }}>
          <T variant="h3" numberOfLines={1} style={active && { color: colors.accentText }}>{station.title}</T>
          <T variant="small" numberOfLines={1}>{station.artist}</T>
          <View style={styles.meta}>
            {active && playing ? <LiveBadge /> : null}
            <T variant="small" style={{ fontSize: 12 }}>{[station.codec, station.bitrate ? `${station.bitrate} kbps` : null].filter(Boolean).join(" · ")}</T>
          </View>
        </View>
      </Pressable>
      <Pressable
        onPress={() => toast(library.toggleStation(station) ? "Station saved" : "Station removed", "bookmark")}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={saved ? "Remove from saved stations" : "Save station"}
        style={styles.save}
      >
        <Feather name="bookmark" size={18} color={saved ? colors.accentDeep : colors.muted} />
      </Pressable>
      <AccentButton size={44} name={active && playing ? "pause" : "play"} busy={active && buffering} label={active && playing ? "Pause" : "Play"} onPress={play} />
    </Neu>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 20, marginBottom: 26 },
  chips: { gap: 12, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 22 },
  station: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  stationMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 62, height: 62, alignItems: "center", justifyContent: "center" },
  meta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  save: { width: 32, height: 44, alignItems: "center", justifyContent: "center" },
});
