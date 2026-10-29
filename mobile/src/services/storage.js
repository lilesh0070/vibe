import AsyncStorage from "@react-native-async-storage/async-storage";

const prefix = "vibe_";

export const storage = {
  async read(key, fallback) {
    try {
      const value = await AsyncStorage.getItem(prefix + key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  },
  async write(key, value) {
    try {
      await AsyncStorage.setItem(prefix + key, JSON.stringify(value));
    } catch {}
    return value;
  },
};
