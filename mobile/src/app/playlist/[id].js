import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useLibrary } from "../../context/LibraryContext";
import { Collage, CollectionHeader } from "../../components/CollectionHeader";
import { DetailScreen } from "../../components/Screen";
import { MenuRow, PromptSheet, Sheet } from "../../components/Sheets";
import { useToast } from "../../components/Toast";
import { SoftDisc } from "../../components/Tiles";
import { TrackList } from "../../components/Tracks";
import { EmptyState, IconButton, PillButton, T } from "../../components/ui";
import { songs as songCount } from "../../utils/format";

// "liked" is the Liked songs collection; any other id is one of the user's playlists.
export default function Playlist() {
  const { id } = useLocalSearchParams();
  const library = useLibrary();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isLiked = id === "liked";
  const playlist = isLiked ? null : library.playlists.find((p) => p.id === id);
  const songs = isLiked ? library.liked : playlist?.songs || [];
  const name = isLiked ? "Liked songs" : playlist?.name;

  if (!isLiked && !playlist)
    return (
      <DetailScreen title="Playlist">
        <EmptyState icon="list" title={library.ready ? "This playlist no longer exists" : "Loading…"} />
      </DetailScreen>
    );

  return (
    <DetailScreen title={name}>
      <CollectionHeader
        art={isLiked ? <SoftDisc size={170} icon="heart" /> : <Collage items={songs} title={name} />}
        eyebrow={isLiked ? "Your favourites" : "Playlist"}
        title={name}
        subtitle={songCount(songs.length)}
        tracks={songs}
        downloadable
        right={isLiked ? null : <IconButton name="more-horizontal" size={50} label="Playlist options" onPress={() => setMenu(true)} />}
      />
      {songs.length ? (
        <TrackList items={songs} playlistId={isLiked ? undefined : id} numbered />
      ) : (
        <EmptyState
          icon={isLiked ? "heart" : "plus-square"}
          title={isLiked ? "Songs you like will show up here" : "This playlist is empty"}
          message={isLiked ? "Tap the heart in the player to save a song." : "Open any song's menu and choose “Add to playlist”."}
        >
          <PillButton label="Find music" icon="search" accent onPress={() => router.push("/search")} style={{ marginTop: 18 }} />
        </EmptyState>
      )}

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <MenuRow icon="edit-2" label="Rename" onPress={() => { setMenu(false); setRenaming(true); }} />
        <MenuRow icon="trash-2" danger label="Delete playlist" onPress={() => { setMenu(false); setConfirmDelete(true); }} />
      </Sheet>

      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <T variant="h2">Delete “{name}”?</T>
        <T variant="small" style={{ marginTop: 6 }}>This removes the playlist from this device. Songs stay available in search.</T>
        <MenuRow icon="trash-2" danger label="Delete" onPress={() => { library.deletePlaylist(id); setConfirmDelete(false); toast("Playlist deleted", "trash-2"); router.back(); }} />
        <MenuRow icon="x" label="Keep it" onPress={() => setConfirmDelete(false)} />
      </Sheet>

      <PromptSheet
        visible={renaming}
        title="Rename playlist"
        initial={name}
        onClose={() => setRenaming(false)}
        onSubmit={(value) => { library.renamePlaylist(id, value); toast("Playlist renamed", "edit-2"); }}
      />
    </DetailScreen>
  );
}
