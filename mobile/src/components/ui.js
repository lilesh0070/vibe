import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@expo/vector-icons/Feather";
import { colors, font, gradients, radius, shadow } from "../theme";

const variants = StyleSheet.create({
  display: { fontFamily: font.black, fontSize: 30, lineHeight: 36, color: colors.text, letterSpacing: -0.4 },
  h1: { fontFamily: font.black, fontSize: 24, lineHeight: 30, color: colors.text },
  h2: { fontFamily: font.bold, fontSize: 19, lineHeight: 25, color: colors.text },
  h3: { fontFamily: font.bold, fontSize: 15, lineHeight: 20, color: colors.text },
  body: { fontFamily: font.medium, fontSize: 15, lineHeight: 21, color: colors.text },
  small: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: colors.muted },
  caption: { fontFamily: font.bold, fontSize: 11, lineHeight: 15, color: colors.muted, letterSpacing: 1, textTransform: "uppercase" },
});

export function T({ variant = "body", style, ...rest }) {
  return <Text {...rest} style={[variants[variant], style]} />;
}

const raisedBy = { xs: shadow.raisedXs, sm: shadow.raisedSm, md: shadow.raised };

export function Neu({ inset, depth = "md", r = radius.lg, style, children, ...rest }) {
  const s = inset ? (depth === "md" ? shadow.inset : shadow.insetSm) : raisedBy[depth];
  return (
    <View {...rest} style={[{ backgroundColor: colors.bg, borderRadius: r }, s, style]}>
      {children}
    </View>
  );
}

// Pressing sinks the surface into the base (raised -> inset), the core soft-UI feedback.
export function NeuPressable({ style, r = radius.lg, depth = "sm", active, disabled, children, ...rest }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      {...rest}
      style={({ pressed }) => [
        { backgroundColor: colors.bg, borderRadius: r },
        pressed || active ? shadow.insetSm : raisedBy[depth],
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function IconButton({ name, size = 44, iconSize, active, color, label, style, icon: Icon = Feather, ...rest }) {
  return (
    <NeuPressable
      accessibilityLabel={label}
      active={active}
      r={size / 2}
      hitSlop={6}
      style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}
      {...rest}
    >
      <Icon name={name} size={iconSize || Math.round(size * 0.42)} color={active ? colors.accentDeep : color || colors.muted} />
    </NeuPressable>
  );
}

export function AccentButton({ name, size = 56, label, busy, style, iconSize, ...rest }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      {...rest}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2 },
        shadow.glow,
        pressed && { transform: [{ scale: 0.95 }] },
        style,
      ]}
    >
      <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.center, { flex: 1, borderRadius: size / 2 }]}>
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Feather
            name={name}
            size={iconSize || Math.round(size * 0.4)}
            color={colors.onAccent}
            // The play glyph is optically left-heavy; nudge it to look centered.
            style={name === "play" && { marginLeft: size * 0.06 }}
          />
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function PillButton({ label, icon, onPress, accent, style }) {
  if (accent)
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{ borderRadius: radius.round }, shadow.glow, pressed && { transform: [{ scale: 0.97 }] }, style]}>
        <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pill}>
          {icon && <Feather name={icon} size={16} color={colors.onAccent} />}
          <T variant="h3" style={{ color: colors.onAccent }}>{label}</T>
        </LinearGradient>
      </Pressable>
    );
  return (
    <NeuPressable onPress={onPress} r={radius.round} style={[styles.pill, style]}>
      {icon && <Feather name={icon} size={16} color={colors.accentDeep} />}
      <T variant="h3">{label}</T>
    </NeuPressable>
  );
}

export function Chip({ label, active, onPress, icon }) {
  return (
    <NeuPressable onPress={onPress} active={active} r={radius.round} depth="xs" accessibilityState={{ selected: !!active }} style={styles.chip}>
      {icon && <Feather name={icon} size={13} color={active ? colors.accentDeep : colors.muted} />}
      <T variant="small" style={{ fontFamily: font.bold, color: active ? colors.accentText : colors.muted }}>
        {label}
      </T>
    </NeuPressable>
  );
}

export function LiveBadge({ style }) {
  return (
    <View style={[styles.live, style]}>
      <View style={styles.liveDot} />
      <T variant="caption" style={{ color: colors.live, letterSpacing: 0.6 }}>Live</T>
    </View>
  );
}

export function SectionHeader({ title, subtitle, action, onAction }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <T variant="h2">{title}</T>
        {subtitle ? <T variant="small">{subtitle}</T> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <T variant="small" style={{ color: colors.accentText, fontFamily: font.bold }}>{action}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ icon = "music", title, message, children }) {
  return (
    <View style={styles.empty}>
      <Neu r={36} style={[styles.center, { width: 72, height: 72 }]}>
        <Feather name={icon} size={28} color={colors.accentDeep} />
      </Neu>
      <T variant="h3" style={{ marginTop: 16, textAlign: "center" }}>{title}</T>
      {message ? <T variant="small" style={{ textAlign: "center", marginTop: 4 }}>{message}</T> : null}
      {children}
    </View>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <EmptyState icon="wifi-off" title="Couldn't load this" message={message}>
      {onRetry ? <PillButton label="Try again" icon="refresh-cw" onPress={onRetry} style={{ marginTop: 16 }} /> : null}
    </EmptyState>
  );
}

export function Skeleton({ width, height, r = radius.md, style }) {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: colors.bg, opacity: pulse }, shadow.insetSm, style]} />;
}

export const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, height: 46, borderRadius: radius.round },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, height: 36 },
  live: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.live },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 20, marginBottom: 14, gap: 12 },
  empty: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 32 },
});
