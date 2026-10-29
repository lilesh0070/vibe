import { Tabs } from "expo-router/js-tabs";
import { SoftTabBar } from "../../components/PlayerBits";
import { colors } from "../../theme";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <SoftTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="search" options={{ title: "Search" }} />
      <Tabs.Screen name="radio" options={{ title: "Radio" }} />
      <Tabs.Screen name="library" options={{ title: "Library" }} />
    </Tabs>
  );
}
