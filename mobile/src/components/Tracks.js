import { memo } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useDownloadProgress, useDownloads } from "../context/DownloadContext";
import { usePlayer } from "../context/PlayerContext";
import { colors, font, radius, shadow } from "../theme";
import { compact, formatTime } from "../utils/format";
import { Artwork } from "./Artwork";
import { useTrackMenu } from "./Sheets";
import { LiveBadge, Neu, NeuPressable, SectionHeader, Skeleton, T } from "./ui";

function Equalizer() {
  return (
    <View style={styles.eq} accessibilityLabel="Now playing">
      {[10, 16, 8].map((h, i) => (
        <View key={i} style={[styles.eqBar, { height: h }]} />
      ))}
    </View>
  );
}

function DownloadPercent({ id }) {
  const pct = useDownloadProgress(id);
  return <T variant="small" style={styles.pct}>{pct}%</T>;
}

// Download state reads live here, so a status or percent change re-renders the mark, not the row.
function DownloadMark({ id }) {
  const status = useDownloads().statusOf(id);
  if (status === "done") return <Feather name="arrow-down-circle" size={14} color={colors.accentDeep} accessibilityLabel="Downloaded" />;
  if (status === "downloading") return <DownloadPercent id={id} />;
  if (status === "queued") return <Feather name="clock" size={13} color={colors.faint} accessibilityLabel="Waiting to download" />;
  return null;
}

export const TrackRow = memo(function TrackRow({ item, list, playlistId, index }) {
  const { current, playing, playItem } = usePlayer();
  const openMenu = useTrackMenu();
  const active = current?.id === item.id;
  const isRadio = item.kind === "radio";
  return (
    <View style={[styles.row, active && shadow.raisedSm]}>
      <Pressable
        onPress={() => playItem(item, list)}
        onLongPress={() => openMenu(item, { playlistId })}
        accessibilityRole="button"
        accessibilityLabel={`${item.title} by ${item.artist}`}
        style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.6 }]}
      >
        {index != null ? <T variant="small" style={styles.index}>{index + 1}</T> : null}
        <View>
          <Artwork uri={item.artwork} size={52} title={item.title} kind={item.kind} round={isRadio} r={14} />
          {active && playing ? (
            <View style={[StyleSheet.absoluteFill, styles.overlay, isRadio && { borderRadius: 26 }]}>
              <Equalizer />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <T variant="h3" numberOfLines={1} style={active && { color: colors.accentText }}>{item.title}</T>
          <T variant="small" numberOfLines={1}>{item.artist}</T>
        </View>
        {isRadio ? (
          active && playing ? <LiveBadge /> : <T variant="small">Radio</T>
        ) : (
          <View style={styles.meta}>
            <DownloadMark id={item.id} />
            <T variant="small">{formatTime(item.duration)}</T>
          </View>
        )}
      </Pressable>
      <Pressable
        onPress={() => openMenu(item, { playlistId })}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`More options for ${item.title}`}
        style={styles.more}
      >
        <Feather name="more-vertical" size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
});

export function TrackList({ items, playlistId, numbered, limit }) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <View style={{ paddingHorizontal: 12, gap: 4 }}>
      {shown.map((t, i) => (
        <TrackRow key={t.id} item={t} list={items} playlistId={playlistId} index={numbered ? i : undefined} />
      ))}
    </View>
  );
}

export function TrackListSkeleton({ count = 6 }) {
  return (
    <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 6 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <Skeleton width={52} height={52} r={14} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="70%" height={12} r={6} />
            <Skeleton width="45%" height={10} r={5} />
          </View>
        </View>
      ))}
    </View>
  );
}

const CARD = 150;

export function TrackCard({ item, list }) {
  const { current, playItem } = usePlayer();
  const openMenu = useTrackMenu();
  const active = current?.id === item.id;
  return (
    <Pressable
      onPress={() => playItem(item, list)}
      onLongPress={() => openMenu(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title} by ${item.artist}`}
      style={({ pressed }) => [{ width: CARD }, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <Neu r={radius.lg} style={styles.cardFrame}>
        <Artwork uri={item.artwork} size={CARD - 16} title={item.title} kind={item.kind} r={radius.md} />
      </Neu>
      <T variant="h3" numberOfLines={1} style={[{ marginTop: 12 }, active && { color: colors.accentText }]}>{item.title}</T>
      <T variant="small" numberOfLines={1}>{item.artist}</T>
    </Pressable>
  );
}

export function StationCard({ item, list }) {
  const { current, playing, playItem } = usePlayer();
  const active = current?.id === item.id;
  return (
    <Pressable
      onPress={() => playItem(item, list)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, live radio`}
      style={({ pressed }) => [{ width: 118, alignItems: "center" }, pressed && { transform: [{ scale: 0.96 }] }]}
    >
      <Neu r={59} style={[styles.disc, active && shadow.insetSm]}>
        <Neu inset depth="sm" r={46} style={styles.discInner}>
          <Artwork uri={item.artwork} size={70} title={item.title} kind="radio" round />
        </Neu>
      </Neu>
      <T variant="h3" numberOfLines={1} style={[{ marginTop: 12, textAlign: "center" }, active && { color: colors.accentText }]}>{item.title}</T>
      {active && playing ? <LiveBadge style={{ marginTop: 2 }} /> : <T variant="small" numberOfLines={1}>{item.artist}</T>}
    </Pressable>
  );
}

export function CollectionCard({ title, subtitle, artwork, onPress, round }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{ width: CARD }, pressed && { transform: [{ scale: 0.97 }] }]}>
      <Neu r={round ? CARD / 2 : radius.lg} style={styles.cardFrame}>
        <Artwork uri={artwork} size={CARD - 16} title={title} round={round} r={radius.md} />
      </Neu>
      <T variant="h3" numberOfLines={1} style={{ marginTop: 12, textAlign: round ? "center" : "left" }}>{title}</T>
      {subtitle ? <T variant="small" numberOfLines={1} style={round && { textAlign: "center" }}>{subtitle}</T> : null}
    </Pressable>
  );
}

// A titled horizontal rail with its own loading and error states.
export function Rail({ title, subtitle, action, onAction, state, renderItem, keyExtractor = (t) => t.id, round }) {
  const { data, loading, error, reload } = state;
  if (!loading && !error && !data?.length) return null;
  return (
    <View style={{ marginBottom: 30 }}>
      <SectionHeader title={title} subtitle={subtitle} action={data?.length ? action : null} onAction={onAction} />
      {error && !data?.length ? (
        <NeuPressable onPress={reload} r={radius.md} style={styles.railError}>
          <Feather name="refresh-cw" size={16} color={colors.accentDeep} />
          <T variant="small">Couldn't load. Tap to retry.</T>
        </NeuPressable>
      ) : loading && !data?.length ? (
        <View style={styles.railSkeleton}>
          {[0, 1, 2].map((i) => (
            <View key={i}>
              <Skeleton width={CARD} height={round ? 118 : CARD} r={round ? 59 : radius.lg} />
              <Skeleton width={100} height={12} r={6} style={{ marginTop: 12 }} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          horizontal
          data={data}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => renderItem(item, data)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
          initialNumToRender={4}
          windowSize={5}
        />
      )}
    </View>
  );
}

export function ArtistChip({ artist }) {
  return (
    <CollectionCard
      round
      title={artist.name}
      subtitle={artist.followers ? `${compact(artist.followers)} followers` : "Artist"}
      artwork={artist.image}
      onPress={() => router.push(`/artist/${artist.id}`)}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 8, borderRadius: radius.md, backgroundColor: colors.bg },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  index: { width: 22, textAlign: "center", fontFamily: font.bold },
  overlay: { backgroundColor: "rgba(45,51,64,0.35)", borderRadius: 14, alignItems: "center", justifyContent: "center" },
  eq: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 18 },
  eqBar: { width: 4, borderRadius: 2, backgroundColor: "#FFFFFF" },
  more: { width: 28, height: 40, alignItems: "center", justifyContent: "center" },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  pct: { fontFamily: font.bold, fontSize: 11, lineHeight: 14, fontVariant: ["tabular-nums"] },
  cardFrame: { padding: 8 },
  disc: { width: 118, height: 118, alignItems: "center", justifyContent: "center" },
  discInner: { width: 92, height: 92, alignItems: "center", justifyContent: "center" },
  rail: { paddingHorizontal: 20, gap: 18, paddingBottom: 14, paddingTop: 4 },
  railSkeleton: { flexDirection: "row", gap: 18, paddingHorizontal: 20 },
  railError: { marginHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 10, padding: 16 },
});
