import { useLocalSearchParams } from "expo-router";
import { useAsync } from "../../hooks/useAsync";
import { genreLabel, genres, getGenreTracks } from "../../services/audius";
import { CollectionHeader } from "../../components/CollectionHeader";
import { DetailScreen } from "../../components/Screen";
import { SoftDisc } from "../../components/Tiles";
import { TrackList, TrackListSkeleton } from "../../components/Tracks";
import { EmptyState, ErrorState } from "../../components/ui";
import { songs } from "../../utils/format";

export default function Genre() {
  const { name } = useLocalSearchParams();
  const genre = genres.find((g) => g.name === name) || { name, icon: "music", subtitle: "Trending this week" };
  const tracks = useAsync((s) => getGenreTracks(name, s), [name]);

  return (
    <DetailScreen title={genreLabel(name)}>
      <CollectionHeader
        art={<SoftDisc size={170} icon={genre.icon} />}
        eyebrow="Collection"
        title={genreLabel(name)}
        subtitle={tracks.data ? `${genre.subtitle} · ${songs(tracks.data.length)}` : genre.subtitle}
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
        <EmptyState title="Nothing here right now" message="Pull down on Home to refresh, or try another genre." />
      )}
    </DetailScreen>
  );
}
