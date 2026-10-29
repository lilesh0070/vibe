import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { colors, radius } from "../theme";
import { Neu, T } from "./ui";

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const show = useCallback(
    (text, icon = "check-circle") => {
      clearTimeout(timer.current);
      setMessage({ text, icon });
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setMessage(null));
      }, 2200);
    },
    [anim],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.wrap,
            { top: insets.top + 12, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] },
          ]}
        >
          <Neu depth="sm" r={radius.round} style={styles.toast}>
            <Feather name={message.icon} size={16} color={colors.accentDeep} />
            <T variant="small" style={{ color: colors.text }} numberOfLines={2}>{message.text}</T>
          </Neu>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 24, right: 24, alignItems: "center" },
  toast: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingVertical: 12, maxWidth: 420 },
});
