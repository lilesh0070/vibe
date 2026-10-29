import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { usePlayer, useProgress } from "../context/PlayerContext";
import { colors, gradients, radius, shadow } from "../theme";
import { formatTime } from "../utils/format";
import { Artwork } from "./Artwork";
import { AccentButton, IconButton, LiveBadge, Neu, T } from "./ui";

export function SeekBar({ position, duration, onSeek, disabled }) {
  const [width, setWidth] = useState(1);
  const [drag, setDrag] = useState(null);
  const fraction = drag ?? (duration > 0 ? Math.min(1, position / duration) : 0);
  const at = (e) => Math.min(1, Math.max(0, e.nativeEvent.locationX / width));
  const live = !disabled && duration > 0;
  return (
    <View>
      <View
        style={styles.seekArea}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width || 1)}
        onStartShouldSetResponder={() => live}
        onMoveShouldSetResponder={() => live}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => setDrag(at(e))}
        onResponderMove={(e) => setDrag(at(e))}
        onResponderRelease={(e) => {
          const f = at(e);
          setDrag(null);
          onSeek(f * duration);
        }}
        onResponderTerminate={() => setDrag(null)}
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(position), text: formatTime(position) }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => onSeek(position + (e.nativeEvent.actionName === "increment" ? 10 : -10))}
      >
        <Neu inset depth="sm" r={6} style={styles.track} pointerEvents="none">
          <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${fraction * 100}%` }]} />
        </Neu>
        <View pointerEvents="none" style={[styles.knob, shadow.raisedSm, { left: fraction * width - 11 }]}>
          <View style={styles.knobDot} />
        </View>
      </View>
      <View style={styles.times}>
        <T variant="small">{formatTime(drag != null ? drag * duration : position)}</T>
        <T variant="small">{formatTime(duration)}</T>
      </View>
    </View>
  );
}

function MiniProgress() {
  const { position, duration, isLive } = useProgress();
  if (isLive || !duration) return null;
  return (
    <View style={styles.miniTrack}>
      <View style={[styles.miniFill, { width: `${Math.min(1, position / duration) * 100}%` }]} />
    </View>
  );
}

export function MiniPlayer({ docked }) {
  const insets = useSafeAreaInsets();
  const { current, playing, buffering, error, toggle, next } = usePlayer();
  if (!current) return null;
  const isRadio = current.kind === "radio";
  return (
    <View style={[styles.miniWrap, docked && { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <Neu r={radius.lg} style={styles.mini}>
        <Pressable
          onPress={() => router.push("/player")}
          accessibilityRole="button"
          accessibilityLabel={`Now playing ${current.title}. Open player`}
          style={styles.miniOpen}
        >
          <Artwork uri={current.artwork} size={46} title={current.title} kind={current.kind} round={isRadio} r={12} />
          <View style={{ flex: 1 }}>
            <T variant="h3" numberOfLines={1}>{current.title}</T>
            {error ? (
              <T variant="small" numberOfLines={1} style={{ color: colors.live }}>{error}</T>
            ) : isRadio ? (
              playing ? <LiveBadge /> : <T variant="small">Live radio · paused</T>
            ) : (
              <T variant="small" numberOfLines={1}>{current.artist}</T>
            )}
          </View>
        </Pressable>
        <AccentButton size={44} name={playing ? "pause" : "play"} busy={buffering && !error} label={playing ? "Pause" : "Play"} onPress={toggle} />
        {!isRadio ? <IconButton name="skip-forward" size={40} label="Next" onPress={next} /> : null}
        <MiniProgress />
      </Neu>
    </View>
  );
}

const tabs = {
  index: { label: "Home", icon: "home" },
  search: { label: "Search", icon: "search" },
  radio: { label: "Radio", icon: "radio" },
  library: { label: "Library", icon: "layers" },
};

// Expo Router's JS tabs hand custom bars an emitter and navigateToTab, not a navigation object.
export function SoftTabBar({ state, emitter, navigateToTab }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <MiniPlayer />
      <Neu r={28} style={styles.bar}>
        {state.routes.map((route, i) => {
          const tab = tabs[route.name];
          if (!tab) return null;
          const focused = state.index === i;
          const onPress = () => {
            const e = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !e.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable key={route.key} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={tab.label} style={styles.tab}>
              <View style={[styles.tabIcon, focused && shadow.insetSm]}>
                <Feather name={tab.icon} size={20} color={focused ? colors.accentDeep : colors.muted} />
              </View>
              <T variant="small" style={{ fontSize: 11, lineHeight: 14, color: focused ? colors.accentText : colors.muted }}>{tab.label}</T>
            </Pressable>
          );
        })}
      </Neu>
    </View>
  );
}

const styles = StyleSheet.create({
  seekArea: { height: 36, justifyContent: "center" },
  track: { height: 10, overflow: "hidden", justifyContent: "center" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 6 },
  knob: { position: "absolute", width: 22, height: 22, borderRadius: 11, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  knobDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  times: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  miniWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, backgroundColor: colors.bg },
  mini: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, paddingRight: 12 },
  miniOpen: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  miniTrack: { position: "absolute", left: 18, right: 18, bottom: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(160,170,190,0.35)" },
  miniFill: { height: 3, borderRadius: 2, backgroundColor: colors.accent },
  tabWrap: { backgroundColor: colors.bg },
  bar: { marginHorizontal: 16, marginTop: 8, flexDirection: "row", justifyContent: "space-around", paddingVertical: 8 },
  tab: { alignItems: "center", gap: 2, minWidth: 64, paddingVertical: 2 },
  tabIcon: { width: 40, height: 34, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});
