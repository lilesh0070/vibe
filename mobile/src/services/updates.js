import { Linking, Platform } from "react-native";
import * as Application from "expo-application";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { abortError, fetchJson, isAbort } from "./net";
import { header } from "../utils/http";
import { readRelease } from "../utils/release";
import { cleanVersion, isNewerVersion } from "../utils/version";

const REPO = "lilesh0070/vibe";
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const PACKAGE_ID = "io.github.lilesh0070.vibeapp";
const APK_MIME = "application/vnd.android.package-archive";
const FLAG_GRANT_READ_URI_PERMISSION = 1;

// Only Android can install an APK from inside the app; iOS and web get the release page.
export const canInstall = Platform.OS === "android";

export const currentVersion = () => cleanVersion(Application.nativeApplicationVersion || Constants.expoConfig?.version);

const friendlyCheckError = (e, signal) => {
  if (isAbort(e) && signal?.aborted) return e;
  if (isAbort(e)) return new Error("GitHub took too long to answer. Try again in a moment.");
  if (e?.status === 403 || e?.status === 429) return new Error("Too many update checks from this network. Try again in an hour.");
  if (e?.status >= 500) return new Error("GitHub is having trouble right now. Try again later.");
  if (e?.status) return new Error(`Couldn't read the latest release (${e.status}).`);
  return new Error("No internet connection. Check your network and try again.");
};

// Resolves to null when the repo has no published release yet (GitHub answers 404).
export async function fetchLatestRelease(signal) {
  try {
    const json = await fetchJson(LATEST_API, { signal, timeout: 12000, headers: { Accept: "application/vnd.github+json" } });
    return readRelease(json);
  } catch (e) {
    if (e?.status === 404) return null;
    throw friendlyCheckError(e, signal);
  }
}

export async function checkForUpdate(signal) {
  const latest = await fetchLatestRelease(signal);
  return { latest, available: !!latest && isNewerVersion(latest.version, currentVersion()) };
}

const apkName = (version) => `Vibe-${String(version).replace(/[^\w.-]/g, "")}.apk`;

// The APK that delivered an update stays in the cache after installing; drop every
// download except the one for `keepVersion` (a newer release not installed yet).
export async function cleanupDownloads(keepVersion) {
  const dir = FileSystem.cacheDirectory;
  if (!canInstall || !dir) return;
  const keep = keepVersion ? apkName(keepVersion) : null;
  const names = await FileSystem.readDirectoryAsync(dir).catch(() => []);
  await Promise.all(
    names
      .filter((n) => /^Vibe-.+\.apk$/.test(n) && n !== keep)
      .map((n) => FileSystem.deleteAsync(dir + n, { idempotent: true }).catch(() => {})),
  );
}

// Downloads the release APK into the cache and resolves to its file:// URI.
// Aborting `signal` cancels the transfer and rejects with an AbortError.
export async function downloadUpdate(release, onProgress, signal) {
  if (!canInstall) throw new Error("Updates install from the download page on this device.");
  if (!release?.apkUrl) throw new Error("This release has no APK yet. Open the download page instead.");
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error("Vibe can't save files on this device. Use the download page instead.");
  const fileUri = dir + apkName(release.version);
  await cleanupDownloads(release.version);

  // Only trust a leftover file when GitHub told us how big it should be.
  const existing = await FileSystem.getInfoAsync(fileUri).catch(() => null);
  if (existing?.exists && release.apkSize > 0 && existing.size === release.apkSize) {
    onProgress?.(1);
    return fileUri;
  }
  if (signal?.aborted) throw abortError();

  const task = FileSystem.createDownloadResumable(release.apkUrl, fileUri, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
    const total = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : release.apkSize;
    if (total > 0) onProgress?.(Math.min(1, totalBytesWritten / total));
  });
  const cancel = () => task.cancelAsync().catch(() => {});
  signal?.addEventListener?.("abort", cancel);
  try {
    // Resolves empty when cancelled; non-2xx responses still resolve, with the error page as the file.
    const result = await task.downloadAsync();
    if (signal?.aborted || !result) throw abortError();
    if (result.status < 200 || result.status >= 300) throw new Error(`HTTP ${result.status}`);
    // The served length wins over the saved release, which can predate a re-uploaded APK.
    const expected = Number(header(result.headers, "content-length")) || release.apkSize;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists || (expected > 0 && info.size !== expected)) throw new Error("Incomplete download");
    onProgress?.(1);
    return fileUri;
  } catch (e) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    if (isAbort(e) || signal?.aborted) throw abortError();
    throw new Error("The download didn't finish. Check your connection and try again.");
  } finally {
    signal?.removeEventListener?.("abort", cancel);
  }
}

// Hands the APK to Android's package installer, which asks the user to confirm.
// Resolves once the user is back in Vibe (a successful update restarts the app instead).
export async function installApk(fileUri) {
  if (!canInstall) throw new Error("Updates install from the download page on this device.");
  const info = fileUri ? await FileSystem.getInfoAsync(fileUri).catch(() => null) : null;
  if (!info?.exists) throw Object.assign(new Error("The downloaded update is gone. Download it again."), { missing: true });
  let contentUri;
  try {
    contentUri = await FileSystem.getContentUriAsync(fileUri);
  } catch {
    throw new Error("Vibe couldn't open the downloaded update. Use the download page instead.");
  }
  try {
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
      type: APK_MIME,
    });
  } catch (e) {
    if (e?.code === "E_ACTIVITY_ALREADY_STARTED") throw new Error("The installer is already open. Finish or close it, then try again.");
    throw new Error("Android blocked the installer. Allow Vibe to install apps, then try again.");
  }
}

// The per-app "Install unknown apps" switch (Android 8+); older versions keep it under Security.
export async function openInstallSettings() {
  try {
    await IntentLauncher.startActivityAsync("android.settings.MANAGE_UNKNOWN_APP_SOURCES", {
      data: `package:${Application.applicationId || PACKAGE_ID}`,
    });
  } catch {
    await IntentLauncher.startActivityAsync("android.settings.SECURITY_SETTINGS").catch(() => {});
  }
}

export const openReleasePage = (url) => Linking.openURL(url || RELEASES_PAGE).catch(() => {});
