import { useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useSavedDownloads } from "../../context/DownloadContext";
import { useLibrary } from "../../context/LibraryContext";
import { usePlayer } from "../../context/PlayerContext";
import { useUpdates } from "../../context/UpdateContext";
import { useAsync } from "../../hooks/useAsync";
import { genres, getDesi, getRecommendations, getTrending, getUnderground } from "../../services/audius";
import { getStations } from "../../services/radio";
import { TabScreen } from "../../components/Screen";
import { AccentDot, GenreGrid, QuickTile, SoftDisc } from "../../components/Tiles";
import { Rail, StationCard, TrackCard } from "../../components/Tracks";
import { AccentButton, IconButton, Neu, NeuPressable, PillButton, SectionHeader, T } from "../../components/ui";
import { colors, radius } from "../../theme";
import { greeting, songs } from "../../utils/format";

const cardFor = (item, list) =>
  item.kind === "radio" ? <StationCard item={item} list={list} /> : <TrackCard item={item} list={list} />;

export default function Home() {
  const library = useLibrary();
  // Only the finished list, so Home doesn't re-render on every step of a download queue.
  const downloads = useSavedDownloads();
  const { playAll } = usePlayer();
  const updates = useUpdates();
  const [refresh, setRefresh] = useState(0);

  const desi = useAsync((s) => getDesi("Desi", s), [refresh]);
  const stations = useAsync((s) => getStations("bollywood", s), [refresh]);
  const trending = useAsync((s) => getTrending(undefined, s), [refresh]);
  const punjabi = useAsync((s) => getDesi("Punjabi", s), [refresh]);
  const hindi = useAsync((s) => getDesi("Hindi", s), [refresh]);
  const haryanvi = useAsync((s) => getDesi("Haryanvi", s), [refresh]);
  const hasTaste = library.liked.length > 0 || library.history.some((t) => t.kind === "track");
  const forYou = useAsync(
    (s) => (hasTaste ? getRecommendations(library, s) : getUnderground(s)),
    [library.ready, hasTaste, refresh],
    { enabled: library.ready },
  );

  const recent = { data: library.history.slice(0, 12), loading: false, error: null };
  const seeAll = (name) => () => router.push(`/genre/${name}`);
  const openUpdates = () => router.push("/updates");
  // Both main rails failing with nothing cached means no internet; point at what still plays.
  const offline = !!desi.error && !desi.data && !!trending.error && !trending.data;
  const saved = downloads.tracks.length;

  return (
    <TabScreen
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => setRefresh((n) => n + 1)} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <T variant="caption">{greeting()}</T>
          <T variant="display">Find your{"\n"}frequency</T>
        </View>
        <IconButton name="heart" size={48} label="Liked songs" onPress={() => router.push("/playlist/liked")} />
      </View>

      {updates.available ? (
        <NeuPressable
          onPress={openUpdates}
          r={radius.lg}
          style={styles.update}
          accessibilityLabel={`Update available, version ${updates.latest.version}. Open app updates`}
        >
          <AccentDot icon="download-cloud" size={36} />
          <View style={{ flex: 1 }}>
            <T variant="h3" numberOfLines={1}>Update available</T>
            <T variant="small" numberOfLines={1}>v{updates.latest.version}{updates.status === "ready" ? " · downloaded" : ""}</T>
          </View>
          <PillButton label="Update" accent onPress={openUpdates} />
        </NeuPressable>
      ) : null}

      {offline && saved ? (
        <NeuPressable
          onPress={() => router.push("/downloads")}
          r={radius.lg}
          style={styles.update}
          accessibilityLabel={`You're offline. Play your downloads, ${songs(saved)}`}
        >
          <AccentDot icon="wifi-off" size={36} />
          <View style={{ flex: 1 }}>
            <T variant="h3" numberOfLines={1}>You're offline</T>
            <T variant="small" numberOfLines={1}>Play your downloads · {songs(saved)}</T>
          </View>
          <Feather name="chevron-right" size={20} color={colors.muted} />
        </NeuPressable>
      ) : null}

      <Neu r={radius.xl} style={styles.hero}>
        <View style={{ flex: 1 }}>
          <T variant="caption" style={{ color: colors.accentText }}>Today's mix</T>
          <T variant="h1" style={{ marginTop: 2 }}>Desi Vibes</T>
          <T variant="small" style={{ marginTop: 4 }}>Bollywood, Punjabi & Hindi. Full songs, free.</T>
          <View style={styles.heroActions}>
            <AccentButton
              name="play"
              size={54}
              label="Shuffle Desi Vibes"
              busy={desi.loading && !desi.data}
              onPress={() => playAll(desi.data, { shuffle: true })}
            />
            <View>
              <T variant="h3">{desi.data ? songs(desi.data.length) : "Loading…"}</T>
              <T variant="small">Shuffle play</T>
            </View>
          </View>
        </View>
        <SoftDisc size={118} icon="headphones" />
      </Neu>

      <View style={styles.quickRow}>
        <QuickTile icon="heart" label="Liked songs" value={library.liked.length} onPress={() => router.push("/playlist/liked")} />
        <QuickTile icon="radio" label="Live radio" value="Live" onPress={() => router.push("/radio")} />
        <QuickTile icon="list" label="Playlists" value={library.playlists.length} onPress={() => router.push("/library")} />
      </View>

      <Rail title="Continue listening" state={recent} renderItem={cardFor} />
      <Rail
        title="Live Desi radio"
        subtitle="Bollywood stations, streaming now"
        action="See all"
        onAction={() => router.push("/radio")}
        state={stations}
        renderItem={(item, list) => <StationCard item={item} list={list} />}
        round
      />
      <Rail title="Trending this week" subtitle="Most played on Audius" action="Play all" onAction={() => playAll(trending.data)} state={trending} renderItem={cardFor} />
      <Rail title="Punjabi hits" action="See all" onAction={seeAll("Punjabi")} state={punjabi} renderItem={cardFor} />
      <Rail title="Hindi & Bollywood" action="See all" onAction={seeAll("Hindi")} state={hindi} renderItem={cardFor} />
      <Rail title="Haryanvi beats" action="See all" onAction={seeAll("Haryanvi")} state={haryanvi} renderItem={cardFor} />
      <Rail
        title={hasTaste ? "Made for you" : "Fresh finds"}
        subtitle={hasTaste ? "Based on your likes and plays" : "Rising independent artists"}
        action="Play all"
        onAction={() => playAll(forYou.data)}
        state={forYou}
        renderItem={cardFor}
      />

      <SectionHeader title="Browse" subtitle="Moods, genres and languages" />
      <GenreGrid items={genres} />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 20, marginBottom: 22 },
  update: { marginHorizontal: 20, marginBottom: 22, padding: 12, paddingLeft: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  hero: { marginHorizontal: 20, padding: 20, flexDirection: "row", alignItems: "center", gap: 12 },
  heroActions: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 18 },
  quickRow: { flexDirection: "row", gap: 16, paddingHorizontal: 20, marginTop: 24, marginBottom: 30 },
});
