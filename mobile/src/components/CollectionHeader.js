import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useDownloads } from "../context/DownloadContext";
import { usePlayer } from "../context/PlayerContext";
import { canDownload } from "../services/downloads";
import { colors, radius } from "../theme";
import { collectionLabel, collectionStatus } from "../utils/downloads";
import { songs } from "../utils/format";
import { Artwork } from "./Artwork";
import { MenuRow, Sheet } from "./Sheets";
import { useToast } from "./Toast";
import { AccentButton, IconButton, Neu, PillButton, T } from "./ui";

// 2x2 cover collage for playlists, falling back to a single generated cover.
export function Collage({ items = [], title, size = 168 }) {
  const covers = items.map((t) => t.artwork).filter(Boolean).slice(0, 4);
  const inner = size - 20;
  return (
    <Neu r={radius.xl} style={{ padding: 10 }}>
      {covers.length >= 4 ? (
        <View style={[styles.grid, { width: inner, height: inner }]}>
          {covers.map((uri, i) => (
            <Artwork key={i} uri={uri} size={inner / 2} title={title} r={0} />
          ))}
        </View>
      ) : (
        <Artwork uri={covers[0]} size={inner} title={title} r={radius.lg} />
      )}
    </Neu>
  );
}

// Bigger batches ask first: an artist or genre page can be 50-80 songs and hundreds of MB.
const CONFIRM_OVER = 20;

function DownloadAll({ tracks }) {
  const downloads = useDownloads();
  const toast = useToast();
  const [sheet, setSheet] = useState(null); // "confirm" | "stop"
  const s = collectionStatus(tracks, downloads.statusOf);
  const label = collectionLabel(s);
  if (!label) return null;
  const close = () => setSheet(null);
  const start = () => {
    close();
    toast(`Downloading ${songs(s.remaining)}`, "download");
    downloads.downloadMany(tracks).then((r) => {
      if (r.code === "space") toast(r.error, "alert-circle");
      else if (r.failed) toast(`${songs(r.failed)} didn't download. Tap Download all to retry.`, "alert-circle");
      else if (r.done && !r.cancelled) toast(`Downloaded ${songs(r.done)}`, "download");
    });
  };
  const stop = () => {
    close();
    if (downloads.cancelMany(tracks.map((t) => t.id))) toast("Downloads stopped", "x");
  };
  const onPress = s.remaining
    ? () => (s.remaining > CONFIRM_OVER ? setSheet("confirm") : start())
    : s.pending
      ? () => setSheet("stop")
      : () => toast("Every song here is on your phone", "check-circle");
  return (
    <>
      <PillButton
        label={label}
        icon={s.remaining ? "download" : s.pending ? "loader" : "check-circle"}
        onPress={onPress}
        style={styles.download}
      />
      <Sheet visible={sheet === "confirm"} onClose={close}>
        <T variant="h2">Download {songs(s.remaining)}?</T>
        <T variant="small" style={{ marginTop: 6 }}>They save in the background and can take a lot of space and data, so Wi-Fi is best.</T>
        <MenuRow icon="download" label={`Download ${songs(s.remaining)}`} onPress={start} />
        <MenuRow icon="x" label="Not now" onPress={close} />
      </Sheet>
      <Sheet visible={sheet === "stop"} onClose={close}>
        <T variant="h2">Stop these downloads?</T>
        <T variant="small" style={{ marginTop: 6 }}>Songs that already finished stay on your phone. Find them in Library › Downloads.</T>
        <MenuRow icon="x" danger label="Stop downloading these" onPress={stop} />
        <MenuRow icon="download" label="Keep downloading" onPress={close} />
      </Sheet>
    </>
  );
}

// `downloadable` adds a "Download all" pill under the play row (Android and iOS only).
export function CollectionHeader({ art, eyebrow, title, subtitle, tracks, right, downloadable }) {
  const { playAll } = usePlayer();
  const ready = tracks?.length > 0;
  return (
    <View style={styles.wrap}>
      {art}
      {eyebrow ? <T variant="caption" style={{ marginTop: 20, color: colors.accentText }}>{eyebrow}</T> : null}
      <T variant="h1" style={[styles.title, !eyebrow && { marginTop: 20 }]} numberOfLines={2}>{title}</T>
      {subtitle ? <T variant="small" style={styles.subtitle} numberOfLines={3}>{subtitle}</T> : null}
      <View style={styles.actions}>
        <IconButton name="shuffle" size={50} label="Shuffle play" disabled={!ready} onPress={() => playAll(tracks, { shuffle: true })} />
        <AccentButton name="play" size={64} label="Play all" onPress={() => ready && playAll(tracks)} />
        {right || <View style={{ width: 50 }} />}
      </View>
      {downloadable && canDownload && ready ? <DownloadAll tracks={tracks} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  grid: { flexDirection: "row", flexWrap: "wrap", borderRadius: radius.lg, overflow: "hidden" },
  title: { textAlign: "center", marginTop: 2 },
  subtitle: { textAlign: "center", marginTop: 4, maxWidth: 420 },
  actions: { flexDirection: "row", alignItems: "center", gap: 26, marginTop: 20 },
  download: { marginTop: 18, paddingHorizontal: 18, height: 40 },
});
