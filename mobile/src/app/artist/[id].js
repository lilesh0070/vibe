import { useLocalSearchParams } from "expo-router";
import { useAsync } from "../../hooks/useAsync";
import { getArtist, getArtistTracks } from "../../services/audius";
import { Artwork } from "../../components/Artwork";
import { CollectionHeader } from "../../components/CollectionHeader";
import { DetailScreen } from "../../components/Screen";
import { SoftDisc } from "../../components/Tiles";
import { TrackList, TrackListSkeleton } from "../../components/Tracks";
import { EmptyState, ErrorState, SectionHeader } from "../../components/ui";
import { compact } from "../../utils/format";

export default function Artist() {
  const { id } = useLocalSearchParams();
  const artist = useAsync((s) => getArtist(id, s), [id]);
  const tracks = useAsync((s) => getArtistTracks(id, s), [id]);
  const a = artist.data;

  if (artist.error && !a)
    return (
      <DetailScreen title="Artist">
        <ErrorState message={artist.error} onRetry={artist.reload} />
      </DetailScreen>
    );

  const stats = a ? [a.followers ? `${compact(a.followers)} followers` : null, a.trackCount ? `${a.trackCount} tracks` : null].filter(Boolean).join(" · ") : "";

  return (
    <DetailScreen title={a?.name || ""}>
      <CollectionHeader
        art={
          <SoftDisc size={170}>
            <Artwork uri={a?.image} size={124} title={a?.name} round />
          </SoftDisc>
        }
        eyebrow="Artist"
        title={a?.name || " "}
        subtitle={stats}
        tracks={tracks.data}
        downloadable
      />
      <SectionHeader title="Songs" />
      {tracks.error && !tracks.data ? (
        <ErrorState message={tracks.error} onRetry={tracks.reload} />
      ) : !tracks.data ? (
        <TrackListSkeleton />
      ) : tracks.data.length ? (
        <TrackList items={tracks.data} numbered />
      ) : (
        <EmptyState title="No free songs from this artist yet" />
      )}
    </DetailScreen>
  );
}
