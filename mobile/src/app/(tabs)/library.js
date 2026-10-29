import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useDownloads } from "../../context/DownloadContext";
import { useLibrary } from "../../context/LibraryContext";
import { useUpdates } from "../../context/UpdateContext";
import { genreLabel } from "../../services/audius";
import { canDownload } from "../../services/downloads";
import { Artwork } from "../../components/Artwork";
import { TabScreen } from "../../components/Screen";
import { PromptSheet } from "../../components/Sheets";
import { useToast } from "../../components/Toast";
import { AccentDot, SoftDisc } from "../../components/Tiles";
import { Rail, StationCard, TrackList } from "../../components/Tracks";
import { EmptyState, IconButton, Neu, NeuPressable, PillButton, SectionHeader, T } from "../../components/ui";
import { colors, font, gradients, radius } from "../../theme";
import { songs } from "../../utils/format";
import { megabytes } from "../../utils/release";

const downloadsLine = ({ tracks, totalBytes, pending }) => {
  if (tracks.length) return `${songs(tracks.length)} · ${megabytes(totalBytes)}`;
  if (pending.length) return `Downloading ${songs(pending.length)}…`;
  return "Listen without internet";
};

// Its own component, so download progress re-renders this card rather than the whole library.
function DownloadsCard() {
  const downloads = useDownloads();
  const line = downloadsLine(downloads);
  return (
    <NeuPressable onPress={() => router.push("/downloads")} r={radius.xl} depth="md" style={styles.liked} accessibilityLabel={`Downloads, ${line}`}>
      <AccentDot icon="download" size={52} />
      <View style={{ flex: 1 }}>
        <T variant="h2">Downloads</T>
        <T variant="small" numberOfLines={1}>{line}</T>
      </View>
      <Feather name="chevron-right" size={22} color={colors.muted} />
    </NeuPressable>
  );
}

export default function Library() {
  const library = useLibrary();
  const { available } = useUpdates();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  const vibes = useMemo(() => {
    const counts = {};
    library.history.forEach((t) => {
      if (t.kind === "track" && t.genre) counts[t.genre] = (counts[t.genre] || 0) + (t.playCount || 1);
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([genre, n]) => ({ genre, share: Math.round((n / total) * 100) }));
  }, [library.history]);

  return (
    <TabScreen>
      <View style={styles.header}>
        <T variant="display" style={{ flex: 1 }}>Your library</T>
        <View>
          <IconButton
            name="download-cloud"
            size={48}
            label={available ? "App updates, new version available" : "App updates"}
            onPress={() => router.push("/updates")}
          />
          {available ? <View pointerEvents="none" style={styles.badge} /> : null}
        </View>
        <IconButton name="plus" size={48} label="New playlist" onPress={() => setCreating(true)} />
      </View>

      {vibes.length ? (
        <Neu r={radius.xl} style={styles.stats}>
          <View style={{ flex: 1, gap: 12 }}>
            <View>
              <T variant="caption">Your top vibe</T>
              <T variant="h2">{genreLabel(vibes[0].genre)}</T>
            </View>
            {vibes.map((v) => (
              <View key={v.genre}>
                <View style={styles.statLine}>
                  <T variant="small" numberOfLines={1} style={{ flex: 1 }}>{genreLabel(v.genre)}</T>
                  <T variant="small" style={{ fontFamily: font.bold, color: colors.text }}>{v.share}%</T>
                </View>
                <Neu inset depth="sm" r={5} style={styles.statTrack}>
                  <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.statFill, { width: `${v.share}%` }]} />
                </Neu>
              </View>
            ))}
          </View>
          <SoftDisc size={112}>
            <T variant="h1" style={{ color: colors.accentText }}>{vibes[0].share}%</T>
          </SoftDisc>
        </Neu>
      ) : null}

      <NeuPressable
        onPress={() => router.push("/playlist/liked")}
        r={radius.xl}
        depth="md"
        style={[styles.liked, canDownload && styles.stacked]}
        accessibilityLabel={`Liked songs, ${songs(library.liked.length)}`}
      >
        <AccentDot icon="heart" size={52} />
        <View style={{ flex: 1 }}>
          <T variant="h2">Liked songs</T>
          <T variant="small">{songs(library.liked.length)}</T>
        </View>
        <Feather name="chevron-right" size={22} color={colors.muted} />
      </NeuPressable>

      {canDownload ? <DownloadsCard /> : null}

      <SectionHeader title="Playlists" action={library.playlists.length ? "New" : null} onAction={() => setCreating(true)} />
      {library.playlists.length ? (
        <View style={styles.playlists}>
          {library.playlists.map((p) => (
            <NeuPressable key={p.id} onPress={() => router.push(`/playlist/${p.id}`)} r={radius.lg} style={styles.playlist} accessibilityLabel={`${p.name}, ${songs(p.songs.length)}`}>
              <Artwork uri={p.songs[0]?.artwork} size={56} title={p.name} r={14} />
              <View style={{ flex: 1 }}>
                <T variant="h3" numberOfLines={1}>{p.name}</T>
                <T variant="small">{songs(p.songs.length)}</T>
              </View>
              <Feather name="chevron-right" size={20} color={colors.muted} />
            </NeuPressable>
          ))}
        </View>
      ) : (
        <EmptyState icon="list" title="No playlists yet" message="Collect your favourite songs in one place.">
          <PillButton label="Create playlist" icon="plus" accent onPress={() => setCreating(true)} style={{ marginTop: 18 }} />
        </EmptyState>
      )}

      <View style={{ height: 28 }} />
      <Rail title="Saved stations" state={{ data: library.stations, loading: false, error: null }} renderItem={(item, list) => <StationCard item={item} list={list} />} round />

      {library.history.length ? (
        <>
          <SectionHeader title="Recently played" action="Clear" onAction={() => { library.clearHistory(); toast("History cleared"); }} />
          <TrackList items={library.history} limit={10} />
        </>
      ) : null}

      <PromptSheet
        visible={creating}
        title="New playlist"
        placeholder="Playlist name"
        confirmLabel="Create"
        onClose={() => setCreating(false)}
        onSubmit={(name) => {
          const p = library.createPlaylist(name);
          toast(`Created ${p.name}`);
        }}
      />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, marginBottom: 22 },
  badge: { position: "absolute", top: 1, right: 1, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg },
  stats: { marginHorizontal: 20, marginBottom: 22, padding: 18, flexDirection: "row", alignItems: "center", gap: 16 },
  statLine: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  statTrack: { height: 8, overflow: "hidden" },
  statFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 5 },
  liked: { marginHorizontal: 20, marginBottom: 30, padding: 18, flexDirection: "row", alignItems: "center", gap: 16 },
  stacked: { marginBottom: 16 },
  playlists: { paddingHorizontal: 20, gap: 14 },
  playlist: { flexDirection: "row", alignItems: "center", gap: 14, padding: 10 },
});
