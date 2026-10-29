import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@expo/vector-icons/Feather";
import { useUpdateProgress, useUpdates } from "../context/UpdateContext";
import { openInstallSettings, openReleasePage } from "../services/updates";
import { DetailScreen } from "../components/Screen";
import { SoftDisc } from "../components/Tiles";
import { Neu, PillButton, T } from "../components/ui";
import { colors, font, gradients, radius, shadow } from "../theme";
import { megabytes } from "../utils/release";

const appIcon = require("../../assets/icon.png");
const web = Platform.OS === "web";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ago = (ts) => {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
};

// Hand-formatted because Hermes' Intl date options vary between Android versions.
const released = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d) ? `Released ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : null;
};

const statusLine = (u) => {
  if (web) return "The web app always runs the newest build.";
  const v = u.latest?.version;
  switch (u.status) {
    case "checking":
      return "Looking for a newer version…";
    case "available":
      return `Version ${v} is ready to download.`;
    case "downloading":
      return `Downloading version ${v}…`;
    case "ready":
      return `Version ${v} is downloaded and ready to install.`;
    case "upToDate":
      return `You're up to date · checked ${ago(u.lastChecked)}`;
    case "error":
      return u.available ? `Version ${v} is available.` : "The last check didn't finish.";
    default:
      return "Tap below to look for a newer version.";
  }
};

const PageLink = ({ url, style }) => (
  <Pressable onPress={() => openReleasePage(url)} hitSlop={10} accessibilityRole="link" style={[styles.pageLink, style]}>
    <Feather name="external-link" size={14} color={colors.accentText} />
    <T variant="small" style={styles.link}>Open download page</T>
  </Pressable>
);

export default function Updates() {
  const u = useUpdates();
  const progress = useUpdateProgress();
  const [allNotes, setAllNotes] = useState(false);
  const release = u.available ? u.latest : null;
  const longNotes = !!release && (release.notes.length > 360 || release.notes.split("\n").length > 8);
  const pct = Math.round(progress * 100);

  return (
    <DetailScreen title="App updates">
      <Neu r={radius.xl} style={styles.hero}>
        <SoftDisc size={128}>
          <View style={[styles.icon, shadow.glow]}>
            <Image source={appIcon} style={styles.icon} contentFit="cover" />
          </View>
        </SoftDisc>
        <T variant="h1" style={{ marginTop: 18 }}>{u.current ? `Vibe ${u.current}` : "Vibe"}</T>
        <T variant="small" style={styles.centerText}>{statusLine(u)}</T>

        {u.error ? (
          <Neu inset depth="sm" r={radius.md} style={styles.notice} accessibilityLiveRegion="polite">
            <Feather name="alert-circle" size={18} color={colors.live} />
            <T variant="small" style={{ flex: 1, color: colors.text }}>{u.error}</T>
          </Neu>
        ) : null}

        {web ? (
          <PillButton label="Get the Android app" icon="smartphone" accent onPress={() => openReleasePage()} style={styles.heroAction} />
        ) : u.status === "checking" ? (
          <Neu inset depth="sm" r={radius.round} style={[styles.busy, styles.heroAction]}>
            <ActivityIndicator color={colors.accentDeep} />
            <T variant="h3">Checking…</T>
          </Neu>
        ) : u.status !== "downloading" ? (
          <PillButton label="Check for updates" icon="refresh-cw" accent={!release} onPress={() => u.check()} style={styles.heroAction} />
        ) : null}

        {/* A failed first check (rate limit, outage) still leaves a way to the APK. */}
        {!web && !release && u.status === "error" ? <PageLink style={{ marginTop: 14 }} /> : null}
      </Neu>

      {release ? (
        <Neu r={radius.xl} style={styles.card}>
          <T variant="caption" style={{ color: colors.accentText }}>New version</T>
          <T variant="h2">Vibe {release.version}</T>
          <T variant="small">{[release.apkSize ? megabytes(release.apkSize) : null, released(release.publishedAt)].filter(Boolean).join(" · ")}</T>

          {release.notes ? (
            <Neu inset depth="sm" r={radius.md} style={styles.notes}>
              <T variant="caption" style={{ marginBottom: 6 }}>What's new</T>
              <T variant="body" numberOfLines={allNotes || !longNotes ? undefined : 8}>{release.notes}</T>
              {longNotes ? (
                <Pressable onPress={() => setAllNotes((v) => !v)} hitSlop={10} accessibilityRole="button" style={{ marginTop: 8 }}>
                  <T variant="small" style={styles.link}>{allNotes ? "Show less" : "Show all"}</T>
                </Pressable>
              ) : null}
            </Neu>
          ) : null}

          <View style={styles.actions}>
            {!u.canInstall ? (
              <PillButton label="Open download page" icon="external-link" accent onPress={() => openReleasePage(release.pageUrl)} />
            ) : !release.apkUrl ? (
              <T variant="small" style={styles.centerText}>The APK for this version isn't uploaded yet. The download page will have it soon.</T>
            ) : u.status === "downloading" ? (
              <View style={{ alignSelf: "stretch" }}>
                <View style={styles.progressLine}>
                  <T variant="h3" style={{ flex: 1 }}>Downloading</T>
                  <T variant="h3" style={{ color: colors.accentText }}>{pct}%</T>
                </View>
                <Neu
                  inset
                  depth="sm"
                  r={6}
                  style={styles.track}
                  accessibilityRole="progressbar"
                  accessibilityLabel="Download progress"
                  accessibilityValue={{ min: 0, max: 100, now: pct }}
                >
                  <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${pct}%` }]} />
                </Neu>
                {release.apkSize ? (
                  <T variant="small" style={{ marginTop: 8 }}>{megabytes(progress * release.apkSize)} of {megabytes(release.apkSize)}</T>
                ) : null}
                <PillButton label="Cancel" icon="x" onPress={u.cancel} style={{ alignSelf: "center", marginTop: 16 }} />
              </View>
            ) : u.status === "ready" ? (
              <>
                <PillButton label="Install" icon="package" accent onPress={() => u.install()} />
                <T variant="small" style={styles.centerText}>Android will ask you to confirm the update. Your library stays as it is.</T>
              </>
            ) : (
              <PillButton label="Download & install" icon="download" accent onPress={u.download} />
            )}

            {u.canInstall && u.installTried && u.status === "ready" ? (
              <Neu inset depth="sm" r={radius.md} style={styles.helper}>
                <View style={styles.helperHead}>
                  <Feather name="shield" size={18} color={colors.accentDeep} />
                  <T variant="h3" style={{ flex: 1 }}>Didn't install?</T>
                </View>
                <T variant="small">
                  Android only installs apps from sources you trust. Turn on "Allow from this source" for Vibe, come back, then tap Install again.
                </T>
                <PillButton label="Allow installs from Vibe" icon="settings" onPress={openInstallSettings} style={{ alignSelf: "flex-start", marginTop: 12 }} />
              </Neu>
            ) : null}

            {u.canInstall ? <PageLink url={release.pageUrl} /> : null}
          </View>
        </Neu>
      ) : null}
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: 20, marginTop: 8, padding: 24, alignItems: "center" },
  icon: { width: 60, height: 60, borderRadius: 30 },
  centerText: { textAlign: "center", marginTop: 6 },
  notice: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginTop: 16 },
  heroAction: { marginTop: 20 },
  busy: { flexDirection: "row", alignItems: "center", gap: 10, height: 46, paddingHorizontal: 22 },
  card: { marginHorizontal: 20, marginTop: 22, padding: 20 },
  notes: { padding: 14, marginTop: 16 },
  link: { color: colors.accentText, fontFamily: font.bold },
  actions: { alignItems: "center", gap: 14, marginTop: 20 },
  progressLine: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  track: { height: 10, overflow: "hidden" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 6 },
  helper: { alignSelf: "stretch", padding: 14 },
  helperHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  pageLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
});
