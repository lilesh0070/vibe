import { useEffect } from "react";
import { Platform } from "react-native";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
// Per-weight imports keep the other twelve Nunito files out of the bundle.
import { Nunito_400Regular } from "@expo-google-fonts/nunito/400Regular";
import { Nunito_600SemiBold } from "@expo-google-fonts/nunito/600SemiBold";
import { Nunito_700Bold } from "@expo-google-fonts/nunito/700Bold";
import { Nunito_800ExtraBold } from "@expo-google-fonts/nunito/800ExtraBold";
import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import { DownloadProvider } from "../context/DownloadContext";
import { LibraryProvider } from "../context/LibraryContext";
import { PlayerProvider } from "../context/PlayerContext";
import { UpdateProvider } from "../context/UpdateContext";
import { ToastProvider } from "../components/Toast";
import { TrackMenuProvider } from "../components/Sheets";
import { colors } from "../theme";

SplashScreen.preventAutoHideAsync().catch(() => {});
SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});

export default function RootLayout() {
  const [loaded, failed] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    ...Feather.font,
    ...Ionicons.font,
  });

  useEffect(() => {
    if (loaded || failed) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, failed]);

  if (!loaded && !failed) return null;

  return (
    <SafeAreaProvider>
      <LibraryProvider>
        <DownloadProvider>
          <PlayerProvider>
            <UpdateProvider>
              <ToastProvider>
                <TrackMenuProvider>
                  <StatusBar style="dark" />
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="player" options={{ animation: "slide_from_bottom", presentation: Platform.OS === "ios" ? "fullScreenModal" : "card" }} />
                    <Stack.Screen name="queue" options={{ animation: "slide_from_bottom", presentation: "modal" }} />
                    <Stack.Screen name="updates" />
                    <Stack.Screen name="downloads" />
                  </Stack>
                </TrackMenuProvider>
              </ToastProvider>
            </UpdateProvider>
          </PlayerProvider>
        </DownloadProvider>
      </LibraryProvider>
    </SafeAreaProvider>
  );
}
