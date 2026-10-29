import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useDownloadProgress, useDownloads } from "../context/DownloadContext";
import { useLibrary } from "../context/LibraryContext";
import { usePlayer } from "../context/PlayerContext";
import { canDownload } from "../services/downloads";
import { colors, font, radius } from "../theme";
import { isDownloadable } from "../utils/downloads";
import { Artwork } from "./Artwork";
import { useToast } from "./Toast";
import { Neu, PillButton, T } from "./ui";

export function Sheet({ visible, onClose, children }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.modal}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.grabber} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function MenuRow({ icon, label, onPress, danger }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { backgroundColor: "rgba(160,170,190,0.15)" }]}>
      <Neu depth="xs" r={14} style={styles.rowIcon}>
        <Feather name={icon} size={17} color={danger ? colors.live : colors.accentDeep} />
      </Neu>
      <T variant="body" style={danger && { color: colors.live }}>{label}</T>
    </Pressable>
  );
}

export function SoftInput({ style, ...rest }) {
  return (
    <Neu inset depth="sm" r={radius.round} style={[styles.inputWrap, style]}>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} selectionColor={colors.accent} {...rest} />
    </Neu>
  );
}

export function PromptSheet({ visible, title, initial = "", placeholder, confirmLabel = "Save", onSubmit, onClose }) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);
  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value.trim());
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <T variant="h2" style={{ marginBottom: 16 }}>{title}</T>
      <SoftInput value={value} onChangeText={setValue} placeholder={placeholder} autoFocus onSubmitEditing={submit} returnKeyType="done" maxLength={60} />
      <View style={styles.actions}>
        <PillButton label="Cancel" onPress={onClose} />
        <PillButton label={confirmLabel} accent onPress={submit} />
      </View>
    </Sheet>
  );
}

const MenuContext = createContext(() => {});

export function TrackMenuProvider({ children }) {
  const [state, setState] = useState(null);
  const open = useCallback((item, options = {}) => setState({ item, mode: "menu", ...options }), []);
  return (
    <MenuContext.Provider value={open}>
      {children}
      <TrackSheet state={state} setState={setState} />
    </MenuContext.Provider>
  );
}

export const useTrackMenu = () => useContext(MenuContext);

// Its own component so the live percent re-renders this row, not the whole sheet.
function DownloadRow({ item, close }) {
  const downloads = useDownloads();
  const pct = useDownloadProgress(item.id);
  const toast = useToast();
  const status = downloads.statusOf(item.id);
  const act = (fn) => () => {
    close();
    fn();
  };
  if (status === "done")
    return (
      <MenuRow
        icon="trash-2"
        label="Remove download"
        onPress={act(() => {
          downloads.remove(item.id);
          toast("Download removed", "trash-2");
        })}
      />
    );
  if (status === "queued" || status === "downloading")
    return (
      <MenuRow
        icon="x"
        label={status === "queued" ? "Waiting to download · Cancel" : `Downloading… ${pct}% · Cancel`}
        onPress={act(() => {
          downloads.cancel(item.id);
          toast("Download cancelled", "x");
        })}
      />
    );
  return (
    <MenuRow
      icon="download"
      label={status === "error" ? "Retry download" : "Download"}
      onPress={act(() => {
        toast("Downloading…", "download");
        downloads.download(item).then((r) => {
          if (r.status === "done") toast(`Downloaded “${item.title}”`, "download");
          else if (r.status === "error") toast(r.error, "alert-circle");
        });
      })}
    />
  );
}

function TrackSheet({ state, setState }) {
  const library = useLibrary();
  const player = usePlayer();
  const toast = useToast();
  const [name, setName] = useState("");
  const close = () => {
    setState(null);
    setName("");
  };
  const item = state?.item;
  const run = (fn, message) => () => {
    fn();
    close();
    if (message) toast(message);
  };

  let content = null;
  if (item && state.mode === "playlists") {
    const create = () => {
      if (!name.trim()) return;
      const p = library.createPlaylist(name, item);
      close();
      toast(`Added to ${p.name}`);
    };
    content = (
      <>
        <T variant="h2" style={{ marginBottom: 14 }}>Add to playlist</T>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <SoftInput style={{ flex: 1 }} value={name} onChangeText={setName} placeholder="New playlist name" onSubmitEditing={create} returnKeyType="done" maxLength={60} />
          <PillButton label="Create" accent onPress={create} />
        </View>
        <ScrollView style={{ maxHeight: 320 }}>
          {library.playlists.map((p) => (
            <MenuRow key={p.id} icon="list" label={`${p.name} · ${p.songs.length}`} onPress={run(() => library.addToPlaylist(p.id, item), `Added to ${p.name}`)} />
          ))}
        </ScrollView>
      </>
    );
  } else if (item) {
    const isRadio = item.kind === "radio";
    const liked = isRadio ? library.isStationSaved(item.id) : library.isLiked(item.id);
    content = (
      <>
        <View style={styles.head}>
          <Artwork uri={item.artwork} size={56} title={item.title} kind={item.kind} round={isRadio} />
          <View style={{ flex: 1 }}>
            <T variant="h3" numberOfLines={2}>{item.title}</T>
            <T variant="small" numberOfLines={1}>{item.artist}</T>
          </View>
        </View>
        <MenuRow icon="corner-down-right" label="Play next" onPress={run(() => player.playNext(item), "Plays next")} />
        <MenuRow icon="list" label="Add to queue" onPress={run(() => player.addToQueue(item), "Added to queue")} />
        {isRadio ? (
          <MenuRow
            icon="bookmark"
            label={liked ? "Remove from saved stations" : "Save station"}
            onPress={run(() => library.toggleStation(item), liked ? "Station removed" : "Station saved")}
          />
        ) : (
          <>
            <MenuRow icon="heart" label={liked ? "Remove from liked songs" : "Like"} onPress={run(() => library.toggleLike(item), liked ? "Removed from liked songs" : "Added to liked songs")} />
            <MenuRow icon="plus-square" label="Add to playlist" onPress={() => setState({ ...state, mode: "playlists" })} />
            {canDownload && isDownloadable(item) ? <DownloadRow item={item} close={close} /> : null}
            {item.artistId ? <MenuRow icon="user" label="Go to artist" onPress={run(() => router.push(`/artist/${item.artistId}`))} /> : null}
          </>
        )}
        {state.playlistId ? (
          <MenuRow icon="trash-2" danger label="Remove from this playlist" onPress={run(() => library.removeFromPlaylist(state.playlistId, item.id), "Removed from playlist")} />
        ) : null}
      </>
    );
  }

  return (
    <Sheet visible={!!item} onClose={close}>
      {content}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(45,51,64,0.28)" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 10,
    boxShadow: "0px -8px 24px rgba(45,51,64,0.18)",
    maxHeight: "85%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  grabber: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: "rgba(140,148,166,0.5)", marginBottom: 18 },
  head: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 9, paddingHorizontal: 4, borderRadius: 16 },
  rowIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  inputWrap: { height: 48, justifyContent: "center", paddingHorizontal: 18 },
  input: { fontFamily: font.medium, fontSize: 15, color: colors.text, paddingVertical: 0, ...Platform.select({ web: { outlineStyle: "none" } }) },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 20 },
});
