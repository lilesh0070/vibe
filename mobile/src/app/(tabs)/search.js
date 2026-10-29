import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View, Platform } from "react-native";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useLibrary } from "../../context/LibraryContext";
import { useAsync } from "../../hooks/useAsync";
import { genres } from "../../services/audius";
import { searchAll } from "../../services/search";
import { TabScreen } from "../../components/Screen";
import { GenreGrid } from "../../components/Tiles";
import { ArtistChip, CollectionCard, Rail, TrackList, TrackListSkeleton } from "../../components/Tracks";
import { Chip, EmptyState, ErrorState, Neu, SectionHeader, T } from "../../components/ui";
import { colors, font, radius } from "../../theme";
import { songs } from "../../utils/format";

const filters = ["All", "Songs", "Artists", "Playlists", "Radio"];

export default function Search() {
  const library = useLibrary();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  // "Search instead for ..." turns off spelling correction for that one query.
  const [exactFor, setExactFor] = useState(null);
  const exact = exactFor === query;

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 380);
    return () => clearTimeout(timer);
  }, [text]);

  const results = useAsync((s) => searchAll(query, filter, s, { exact }), [query, filter, exact], {
    enabled: query.length > 1,
  });

  useEffect(() => {
    if (query.length > 1 && results.data && !results.loading) library.addSearch(results.data.corrected || query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.data]);

  // useAsync keeps the last results while the next search loads; they belong to
  // another query, filter or "Search instead", so they are not shown as this one's.
  const data = results.data;
  const fresh = data && data.query === query && data.filter === filter && data.exact === exact;
  const empty = fresh && !data.songs.length && !data.artists.length && !data.playlists.length && !data.radio.length;

  return (
    <TabScreen>
      <T variant="display" style={styles.title}>Search</T>
      <Neu inset r={radius.round} style={styles.search}>
        <Feather name="search" size={18} color={colors.muted} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Songs, artists, stations…"
          placeholderTextColor={colors.muted}
          style={styles.input}
          returnKeyType="search"
          autoCorrect={false}
          selectionColor={colors.accent}
          accessibilityLabel="Search"
        />
        {text ? (
          <Pressable onPress={() => setText("")} hitSlop={10} accessibilityLabel="Clear search">
            <Feather name="x-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </Neu>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {filters.map((f) => (
          <Chip key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </ScrollView>

      {query.length < 2 ? (
        <>
          {library.searches.length ? (
            <View style={{ marginBottom: 26 }}>
              <SectionHeader title="Recent searches" action="Clear" onAction={library.clearSearches} />
              <View style={styles.recent}>
                {library.searches.map((q) => (
                  <Chip key={q} label={q} icon="clock" onPress={() => setText(q)} />
                ))}
              </View>
            </View>
          ) : null}
          <SectionHeader title="Browse all" subtitle="Try Punjabi, lo-fi, or a station name" />
          <GenreGrid items={genres} />
        </>
      ) : results.error && !fresh ? (
        <ErrorState message={results.error} onRetry={results.reload} />
      ) : !fresh ? (
        <TrackListSkeleton />
      ) : (
        <>
          {data.corrected ? (
            <Correction name={data.corrected} original={data.query} onSearchOriginal={() => setExactFor(data.query)} />
          ) : null}
          {empty ? (
            <EmptyState icon="search" title={`No results for "${data.corrected || query}"`} message="Check the spelling or try another filter." />
          ) : (
            <Results data={data} filter={filter} />
          )}
        </>
      )}
    </TabScreen>
  );
}

function Results({ data, filter }) {
  const all = filter === "All";
  const static_ = (items) => ({ data: items, loading: false, error: null });
  return (
    <View>
      {data.songs.length ? (
        <View style={{ marginBottom: 26 }}>
          {all ? <SectionHeader title="Songs" /> : null}
          <TrackList items={data.songs} limit={all ? 6 : undefined} />
        </View>
      ) : null}
      {data.artists.length ? (
        all ? (
          <Rail title="Artists" state={static_(data.artists)} renderItem={(a) => <ArtistChip artist={a} />} round />
        ) : (
          <View style={styles.wrapGrid}>
            {data.artists.map((a) => (
              <ArtistChip key={a.id} artist={a} />
            ))}
          </View>
        )
      ) : null}
      {data.radio.length ? (
        <View style={{ marginBottom: 26 }}>
          {all ? <SectionHeader title="Radio stations" /> : null}
          <TrackList items={data.radio} limit={all ? 4 : undefined} />
        </View>
      ) : null}
      {data.playlists.length ? (
        all ? (
          <Rail title="Playlists" state={static_(data.playlists)} renderItem={(p) => <PlaylistCard playlist={p} />} />
        ) : (
          <View style={styles.wrapGrid}>
            {data.playlists.map((p) => (
              <PlaylistCard key={p.id} playlist={p} />
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}

function Correction({ name, original, onSearchOriginal }) {
  return (
    <Neu depth="sm" r={radius.md} style={styles.correction}>
      <Neu inset depth="sm" r={17} style={styles.correctionIcon}>
        <Feather name="edit-3" size={15} color={colors.accentDeep} />
      </Neu>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="small" numberOfLines={2}>
          Showing results for <T variant="small" style={{ color: colors.text, fontFamily: font.bold }}>{name}</T>
        </T>
        <Pressable onPress={onSearchOriginal} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Search instead for ${original}`}>
          <T variant="small" numberOfLines={1} style={{ color: colors.accentText, fontFamily: font.bold }}>
            Search instead for "{original}"
          </T>
        </Pressable>
      </View>
    </Neu>
  );
}

function PlaylistCard({ playlist }) {
  return (
    <CollectionCard
      title={playlist.name}
      subtitle={`${playlist.artist || "Audius"} · ${songs(playlist.count)}`}
      artwork={playlist.artwork}
      onPress={() => router.push(`/album/${playlist.id}`)}
    />
  );
}

const styles = StyleSheet.create({
  title: { paddingHorizontal: 20, marginBottom: 18 },
  search: { marginHorizontal: 20, height: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18 },
  input: { flex: 1, fontFamily: font.medium, fontSize: 16, color: colors.text, paddingVertical: 0, ...Platform.select({ web: { outlineStyle: "none" } }) },
  chips: { gap: 12, paddingHorizontal: 20, paddingVertical: 18 },
  recent: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 20 },
  wrapGrid: { flexDirection: "row", flexWrap: "wrap", gap: 18, paddingHorizontal: 20, marginBottom: 26 },
  correction: { marginHorizontal: 20, marginBottom: 22, paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  correctionIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
});
