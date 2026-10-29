import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useDownloads } from "../context/DownloadContext";
import { useStableArray } from "../hooks/useStableArray";
import { CollectionHeader } from "../components/CollectionHeader";
import { DetailScreen } from "../components/Screen";
import { MenuRow, Sheet } from "../components/Sheets";
import { useToast } from "../components/Toast";
import { SoftDisc } from "../components/Tiles";
import { TrackList } from "../components/Tracks";
import { EmptyState, IconButton, PillButton, SectionHeader, T } from "../components/ui";
import { songs } from "../utils/format";
import { megabytes } from "../utils/release";

// Songs saved on this phone. They play from the file, so this screen works without internet.
export default function Downloads() {
  const downloads = useDownloads();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const { tracks, pending, failed, totalBytes } = downloads;
  // Same arrays while the same songs wait, so a queue step doesn't re-render every row.
  const pendingTracks = useStableArray(pending.map((e) => e.track));
  const failedTracks = useStableArray(failed.map((e) => e.track));

  if (!downloads.available)
    return (
      <DetailScreen title="Downloads">
        <EmptyState icon="download" title="Downloads live in the phone app" message="Install Vibe on your phone to save songs and listen without internet." />
      </DetailScreen>
    );

  const anything = tracks.length || pending.length;

  return (
    <DetailScreen title="Downloads">
      <CollectionHeader
        art={<SoftDisc size={170} icon="download" />}
        eyebrow="Offline"
        title="Downloads"
        subtitle={tracks.length ? `${songs(tracks.length)} · ${megabytes(totalBytes)} on this phone` : "Saved songs play without internet"}
        tracks={tracks}
        right={anything ? <IconButton name="trash-2" size={50} label="Remove all downloads" onPress={() => setConfirm(true)} /> : null}
      />

      {pending.length ? (
        <View style={{ marginBottom: 24 }}>
          <SectionHeader
            title="Downloading"
            subtitle={`${songs(pending.length)} left`}
            action="Cancel all"
            onAction={() => {
              downloads.cancelAll();
              toast("Downloads cancelled", "x");
            }}
          />
          <TrackList items={pendingTracks} />
        </View>
      ) : null}

      {failed.length ? (
        <View style={{ marginBottom: 24 }}>
          <SectionHeader
            title="Didn't finish"
            subtitle={failed[0].error}
            action="Retry"
            onAction={() => {
              toast(`Retrying ${songs(failed.length)}`, "download");
              downloads.downloadMany(failedTracks);
            }}
          />
          <TrackList items={failedTracks} />
        </View>
      ) : null}

      {tracks.length ? (
        <>
          {pending.length || failed.length ? <SectionHeader title="On this phone" /> : null}
          <TrackList items={tracks} numbered />
        </>
      ) : !pending.length && !failed.length ? (
        <EmptyState icon="download" title="No downloads yet" message="Open a song's menu and tap Download, or use Download all on a playlist.">
          <PillButton label="Find music" icon="search" accent onPress={() => router.push("/search")} style={{ marginTop: 18 }} />
        </EmptyState>
      ) : null}

      <Sheet visible={confirm} onClose={() => setConfirm(false)}>
        <T variant="h2">Remove all downloads?</T>
        <T variant="small" style={{ marginTop: 6 }}>
          {tracks.length ? `Frees ${megabytes(totalBytes)}. ` : ""}Songs stay in your library and play when you're online.
        </T>
        <MenuRow
          icon="trash-2"
          danger
          label="Remove all downloads"
          onPress={() => {
            downloads.removeAll();
            setConfirm(false);
            toast("All downloads removed", "trash-2");
          }}
        />
        <MenuRow icon="x" label="Keep them" onPress={() => setConfirm(false)} />
      </Sheet>
    </DetailScreen>
  );
}
