import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useDownloadProgress, useDownloads } from "../context/DownloadContext";
import { useLibrary } from "../context/LibraryContext";
import { usePlayer, useProgress } from "../context/PlayerContext";
import { Artwork } from "../components/Artwork";
import { SeekBar } from "../components/PlayerBits";
import { goBack } from "../components/Screen";
import { MenuRow, Sheet, useTrackMenu } from "../components/Sheets";
import { useToast } from "../components/Toast";
import { AccentButton, EmptyState, IconButton, LiveBadge, Neu, NeuPressable, PillButton, T } from "../components/ui";
import { canDownload } from "../services/downloads";
import { colors, font, radius } from "../theme";
import { isDownloadable } from "../utils/downloads";

function SpinningDisc({ size, item, spinning }) {
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!spinning) return;
    const loop = Animated.loop(Animated.timing(rotation, { toValue: 1, duration: 24000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spinning, rotation]);
  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const art = size * 0.74;
  return (
    <Neu r={size / 2} style={[styles.center, { width: size, height: size }]}>
      <Neu inset r={size * 0.44} style={[styles.center, { width: size * 0.88, height: size * 0.88 }]}>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Artwork uri={item.artwork} size={art} title={item.title} kind={item.kind} round />
        </Animated.View>
        <Neu depth="sm" r={size * 0.07} style={[styles.hub, { width: size * 0.14, height: size * 0.14 }]}>
          <View style={styles.hubDot} />
        </Neu>
      </Neu>
    </Neu>
  );
}

function Progress() {
  const { seek } = usePlayer();
  const { position, duration, isLive } = useProgress();
  if (isLive)
    return (
      <View style={styles.liveRow}>
        <Neu inset depth="sm" r={radius.round} style={styles.livePill}>
          <LiveBadge />
          <T variant="small">Streaming live</T>
        </Neu>
      </View>
    );
  return <SeekBar position={position} duration={duration} onSeek={seek} />;
}

// Round, so it sits between the Sleep and Queue pills even at 375px. It reads the download state
// (and owns its remove sheet) itself, so queue steps re-render this button, not the player.
function DownloadButton({ item }) {
  const downloads = useDownloads();
  const pct = useDownloadProgress(item.id);
  const toast = useToast();
  const [removeOpen, setRemoveOpen] = useState(false);
  const status = downloads.statusOf(item.id);
  const cancel = () => {
    downloads.cancel(item.id);
    toast("Download cancelled", "x");
  };
  let button;
  if (status === "downloading")
    button = (
      <NeuPressable r={23} hitSlop={6} style={[styles.center, styles.dl]} accessibilityLabel={`Downloading, ${pct}%. Tap to cancel`} onPress={cancel}>
        <T variant="small" style={styles.dlPct}>{pct}%</T>
      </NeuPressable>
    );
  else if (status === "queued") button = <IconButton name="clock" size={46} label="Waiting to download. Tap to cancel" onPress={cancel} />;
  else if (status === "done")
    button = <IconButton name="check-circle" size={46} active label="Downloaded. Tap to remove" onPress={() => setRemoveOpen(true)} />;
  else
    button = (
      <IconButton
        name="download"
        size={46}
        label={status === "error" ? "Retry download" : "Download for offline"}
        onPress={() => {
          toast("Downloading…", "download");
          downloads.download(item).then((r) => {
            if (r.status === "done") toast(`Downloaded “${item.title}”`, "download");
            else if (r.status === "error") toast(r.error, "alert-circle");
          });
        }}
      />
    );
  return (
    <>
      {button}
      <Sheet visible={removeOpen} onClose={() => setRemoveOpen(false)}>
        <T variant="h2">Remove this download?</T>
        <T variant="small" style={{ marginTop: 6 }} numberOfLines={3}>“{item.title}” will need internet to play again. It stays in your library.</T>
        <MenuRow icon="trash-2" danger label="Remove download" onPress={() => { downloads.remove(item.id); setRemoveOpen(false); toast("Download removed", "trash-2"); }} />
        <MenuRow icon="x" label="Keep it" onPress={() => setRemoveOpen(false)} />
      </Sheet>
    </>
  );
}

function useSleepLabel(sleepAt) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!sleepAt) return;
    const timer = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(timer);
  }, [sleepAt]);
  return sleepAt ? `${Math.max(1, Math.round((sleepAt - Date.now()) / 60000))} min` : "Sleep";
}

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const p = usePlayer();
  const library = useLibrary();
  const toast = useToast();
  const openMenu = useTrackMenu();
  const [sleepOpen, setSleepOpen] = useState(false);
  const sleepLabel = useSleepLabel(p.sleepAt);
  const item = p.current;

  if (!item)
    return (
      <View style={[styles.fill, { paddingTop: insets.top + 8 }]}>
        <View style={styles.top}>
          <IconButton name="chevron-down" label="Close player" onPress={goBack} />
        </View>
        <EmptyState icon="music" title="Nothing playing" message="Pick a song or a station to start listening." />
      </View>
    );

  const isRadio = item.kind === "radio";
  const liked = isRadio ? library.isStationSaved(item.id) : library.isLiked(item.id);
  const disc = Math.min(width - 64, height * 0.4, 340);
  const like = () => {
    const on = isRadio ? library.toggleStation(item) : library.toggleLike(item);
    toast(isRadio ? (on ? "Station saved" : "Station removed") : on ? "Added to liked songs" : "Removed from liked songs", "heart");
  };

  return (
    <View style={[styles.fill, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 18 }]}>
      <View style={styles.top}>
        <IconButton name="chevron-down" label="Close player" onPress={goBack} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <T variant="caption">{isRadio ? "Live radio" : "Now playing"}</T>
          <T variant="small" numberOfLines={1}>{p.queue.length > 1 ? `${p.index + 1} of ${p.queue.length}` : isRadio ? "Vibe Radio" : "Vibe"}</T>
        </View>
        <IconButton name="more-horizontal" label="More options" onPress={() => openMenu(item)} />
      </View>

      <View style={[styles.center, { flex: 1 }]}>
        <SpinningDisc size={disc} item={item} spinning={p.playing} />
      </View>

      <View style={styles.body}>
        <View style={styles.info}>
          <View style={{ flex: 1 }}>
            <T variant="h1" numberOfLines={2}>{item.title}</T>
            <Pressable onPress={() => router.push(`/artist/${item.artistId}`)} disabled={!item.artistId} accessibilityRole={item.artistId ? "link" : undefined}>
              <T variant="body" numberOfLines={1} style={{ color: colors.muted, marginTop: 2 }}>{item.artist}</T>
            </Pressable>
          </View>
          <IconButton
            icon={Ionicons}
            name={liked ? "heart" : "heart-outline"}
            size={48}
            iconSize={22}
            active={liked}
            label={liked ? "Remove from liked" : "Like"}
            onPress={like}
          />
        </View>

        {p.error ? (
          <Neu inset depth="sm" r={radius.md} style={styles.error}>
            <T variant="small" style={{ color: colors.live, flex: 1 }}>{p.error}</T>
            {p.queue.length > 1 ? <PillButton label="Next" icon="skip-forward" onPress={p.next} /> : null}
          </Neu>
        ) : null}

        <Progress />

        <View style={styles.controls}>
          <IconButton name="shuffle" size={44} active={p.shuffle} disabled={isRadio} label={p.shuffle ? "Shuffle on" : "Shuffle off"} onPress={p.toggleShuffle} />
          <IconButton name="skip-back" size={58} label="Previous" onPress={p.previous} />
          <AccentButton name={p.playing ? "pause" : "play"} size={80} busy={p.buffering && !p.error} label={p.playing ? "Pause" : "Play"} onPress={p.toggle} />
          <IconButton name="skip-forward" size={58} label="Next" onPress={p.next} disabled={p.queue.length < 2} />
          <View>
            <IconButton name="repeat" size={44} active={p.repeat !== "off"} disabled={isRadio} label={`Repeat ${p.repeat}`} onPress={p.cycleRepeat} />
            {p.repeat === "one" ? <T style={styles.repeatOne}>1</T> : null}
          </View>
        </View>

        <View style={styles.bottomRow}>
          <PillButton label={sleepLabel} icon="moon" onPress={() => setSleepOpen(true)} />
          {canDownload && isDownloadable(item) ? <DownloadButton item={item} /> : null}
          <PillButton label="Queue" icon="list" onPress={() => router.push("/queue")} />
        </View>
      </View>

      <Sheet visible={sleepOpen} onClose={() => setSleepOpen(false)}>
        <T variant="h2" style={{ marginBottom: 10 }}>Sleep timer</T>
        {[15, 30, 45, 60, 90].map((m) => (
          <MenuRow key={m} icon="moon" label={`${m} minutes`} onPress={() => { p.setSleepTimer(m); setSleepOpen(false); toast(`Music stops in ${m} minutes`, "moon"); }} />
        ))}
        {p.sleepAt ? <MenuRow icon="x" danger label="Turn off timer" onPress={() => { p.setSleepTimer(null); setSleepOpen(false); toast("Sleep timer off", "moon"); }} /> : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20 },
  hub: { position: "absolute", alignItems: "center", justifyContent: "center" },
  hubDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  body: { paddingHorizontal: 26, gap: 18, width: "100%", maxWidth: 560, alignSelf: "center" },
  info: { flexDirection: "row", alignItems: "center", gap: 14 },
  error: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  liveRow: { height: 60, justifyContent: "center", alignItems: "center" },
  livePill: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingVertical: 10 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  repeatOne: { position: "absolute", right: -2, top: -4, fontFamily: font.black, fontSize: 11, color: colors.accentText },
  bottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dl: { width: 46, height: 46 },
  dlPct: { fontFamily: font.black, fontSize: 12, color: colors.accentText, fontVariant: ["tabular-nums"] },
});
