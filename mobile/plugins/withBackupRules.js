const fs = require("fs");
const path = require("path");
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

// Downloaded songs live in filesDir/downloads (expo-file-system's documentDirectory).
// Android Auto Backup has a 25 MB per-app quota and skips the whole backup once it is
// exceeded, so keep the songs out and let the small library data keep backing up.
const exclude = '<exclude domain="file" path="downloads/" />';

const backupRules = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  ${exclude}
</full-backup-content>
`;

const extractionRules = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    ${exclude}
  </cloud-backup>
  <device-transfer>
    ${exclude}
  </device-transfer>
</data-extraction-rules>
`;

module.exports = function withBackupRules(config) {
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "vibe_backup_rules.xml"), backupRules);
      fs.writeFileSync(path.join(dir, "vibe_data_extraction_rules.xml"), extractionRules);
      return cfg;
    },
  ]);
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$["android:fullBackupContent"] = "@xml/vibe_backup_rules";
    app.$["android:dataExtractionRules"] = "@xml/vibe_data_extraction_rules";
    return cfg;
  });
};
