// The explicit extension lets node tests import this file; Metro resolves it either way.
import { cleanVersion } from "./version.js";

export const APK_NAME = "Vibe.apk";

const NOTES_LIMIT = 1200;

// GitHub release JSON -> the few fields the updater needs. Returns null when the tag is not a version.
export const readRelease = (json) => {
  const version = cleanVersion(json?.tag_name);
  if (!version || json.draft) return null;
  // "starter" assets are uploads that never finished; only a complete file is installable.
  const apk = (json.assets || []).find((a) => a?.name === APK_NAME && a.state !== "starter" && a.browser_download_url);
  return {
    version,
    notes: plainNotes(json.body),
    apkUrl: apk?.browser_download_url || null,
    apkSize: Number(apk?.size) || 0,
    pageUrl: json.html_url || null,
    publishedAt: json.published_at || null,
  };
};

// Release notes are markdown; the app shows them as plain text.
export const plainNotes = (md) => {
  const text = String(md ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^ {0,3}#{1,6}\s+/gm, "")
    .replace(/^ {0,3}>\s?/gm, "")
    .replace(/^(\s*)[-*+]\s+/gm, "$1• ")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/gm, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length <= NOTES_LIMIT) return text;
  return `${text.slice(0, NOTES_LIMIT).replace(/\s+\S*$/, "")}…`;
};

export const megabytes = (bytes) => {
  const mb = (Number(bytes) || 0) / (1024 * 1024);
  // Tiny sizes round up to 0.1 so a real file never reads "0 MB"; nothing at all still does.
  const shown = mb >= 10 ? Math.round(mb) : mb > 0 ? Math.max(0.1, Math.round(mb * 10) / 10) : 0;
  return `${shown} MB`;
};
