import { useLocalSearchParams } from "expo-router";
import { useAsync } from "../../hooks/useAsync";
import { getPlaylist, getPlaylistTracks } from "../../services/audius";
import { Collage, CollectionHeader } from "../../components/CollectionHeader";
import { DetailScreen } from "../../components/Screen";
import { TrackList, TrackListSkeleton } from "../../components/Tracks";
import { EmptyState, ErrorState } from "../../components/ui";
import { songs } from "../../utils/format";

// A public playlist or album from Audius.
export default function Album() {
  const { id } = useLocalSearchParams();
  const info = useAsync((s) => getPlaylist(id, s), [id]);
  const tracks = useAsync((s) => getPlaylistTracks(id, s), [id]);
  const p = info.data;

  return (
    <DetailScreen title={p?.name || ""}>
      <CollectionHeader
        art={<Collage items={tracks.data || (p ? [{ artwork: p.artwork }] : [])} title={p?.name} />}
        eyebrow={p?.isAlbum ? "Album" : "Playlist"}
        title={p?.name || " "}
        subtitle={p ? `${p.artist || "Audius"} · ${songs(tracks.data?.length ?? p.count)}` : ""}
        tracks={tracks.data}
        downloadable
      />
      {tracks.error && !tracks.data ? (
        <ErrorState message={tracks.error} onRetry={tracks.reload} />
      ) : !tracks.data ? (
        <TrackListSkeleton />
      ) : tracks.data.length ? (
        <TrackList items={tracks.data} numbered />
      ) : (
        <EmptyState title="No free songs in this playlist" />
      )}
    </DetailScreen>
  );
}
