const { withAppBuildGradle } = require("expo/config-plugins");

// Windows limits paths to 260 characters. CMake object files for autolinked native
// modules (e.g. react-native-gesture-handler) exceed that, so make CMake hash long
// object names instead.
const marker = "-DCMAKE_OBJECT_PATH_MAX=128";

module.exports = function withShortObjectPaths(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(marker)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /defaultConfig\s*\{/,
        (m) => `${m}\n        externalNativeBuild {\n            cmake {\n                arguments "${marker}"\n            }\n        }`,
      );
    }
    return cfg;
  });
};
