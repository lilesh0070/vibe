// expo-router pulls these in for drawer/JS-stack layouts that Vibe does not use.
// Their native code is never called, and gesture-handler's C++ paths exceed
// Windows' 260-character limit, so leave them out of the Android build.
module.exports = {
  dependencies: {
    "react-native-gesture-handler": { platforms: { android: null, ios: null } },
    "react-native-reanimated": { platforms: { android: null, ios: null } },
  },
};
