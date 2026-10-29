# Vibe (React Native)

The native version of Vibe, built with Expo SDK 58, React Native 0.88 and Expo Router, in a soft-UI (neumorphism) design. One codebase runs on Android, iOS and the web.

## Where the music comes from

There is no YouTube playback and no API key. Every source is free and public:

| Source | What it provides | Key |
|---|---|---|
| [Audius API](https://docs.audius.co/) | Full-length songs: trending, search, artists, playlists, plus Hindi, Punjabi and Haryanvi collections built from searches | None |
| [Radio Browser](https://api.radio-browser.info/) | Live internet radio: Bollywood, Hindi, Punjabi, Haryanvi, Bhojpuri, Retro, Bhakti, Tamil and more (HTTPS MP3/AAC streams only) | None |

Mainstream label releases (T-Series and similar) are not available as free full streams through any legitimate API. Audius has independent uploads, covers and remixes, and the radio stations play mainstream Bollywood live. Unofficial JioSaavn/Gaana wrappers are deliberately not used because they bypass those services' licensing terms.

## Features

- Home: Desi Vibes shuffle mix, live Desi radio, trending, Punjabi/Hindi/Haryanvi rails, "Made for you" recommendations and a genre grid
- Search across songs, artists, playlists and radio stations, with filters and recent searches
- Live radio by category, with saved stations
- Library: listening stats ("top vibe"), liked songs, playlists (create, rename, delete), saved stations and history
- Full player: spinning disc, seek bar, shuffle, repeat (all/one), queue editing, sleep timer
- Background playback and lock-screen controls through `expo-audio`
- The last queue and position are restored when the app opens

Everything is stored on the device with AsyncStorage. The recommendation engine is shared with the web app (`src/services/recommendationEngine.js`).

## Run it

Requires Node.js 22.13 or newer (Expo SDK 58 warns on Node 20).

```sh
cd mobile
npm install
npm start          # scan the QR code with Expo Go, or press a / w
npm run web        # browser preview
npm test           # recommendation and formatting tests
```

Background audio and lock-screen controls need a real build, not Expo Go.

## Build an APK

The `android/` folder is generated, never edited by hand (configure `app.json` instead). On Windows, with `ANDROID_HOME` (platform 35, build-tools 36.0.0) and `JAVA_HOME` (JDK 17+) set:

```powershell
pwsh -File .\scripts\build-apk.ps1
```

The script regenerates `android/`, runs the Gradle release build, signs the result with the key in `credentials/` and writes `dist/Vibe.apk` plus `dist/SHA256SUMS.txt`.

On Windows, React Native's C++ build exceeds the 260-character path limit unless long paths are enabled. The easier route: the **Android APK** GitHub Actions workflow builds the APK on Linux on every push that touches `mobile/`. Download its `vibe-release-unsigned` artifact, then sign it locally so the key never leaves your machine:

```powershell
gh run download --name vibe-release-unsigned --dir .\dist\ci
pwsh -File .\scripts\build-apk.ps1 -Unsigned .\dist\ci\app-release.apk
```

The package name is `io.github.lilesh0070.vibeapp`, so it installs next to the old WebView app (`io.github.lilesh0070.vibe`) instead of clashing with it. Its data does not carry over from that app.

**Keep `credentials/vibe-release.jks` and `credentials/keystore-password.txt` backed up privately.** They are gitignored. Every future APK must be signed with this key, or Android refuses to install it as an update.

## Releasing an update

1. Raise `version` and `android.versionCode` in `app.json` (for example 3.0.1 / 30001).
2. Build with `scripts/build-apk.ps1`.
3. Publish a GitHub release tagged `v3.0.1` with `dist/Vibe.apk` attached under that exact name.

Installed apps find it under **Library → Updates**, and on launch (at most every 12 hours). They download the APK and open Android's installer.

## Structure

```text
src/
  app/            # Expo Router screens: (tabs)/index, search, radio, library; player, queue,
                  # artist/[id], genre/[name], playlist/[id], album/[id]
  components/     # soft-UI primitives (ui.js), artwork, track rows/cards, sheets, player bits
  context/        # LibraryContext (likes, playlists, history), PlayerContext (queue + audio)
  services/       # audius.js, radio.js, storage.js, recommendationEngine.js
  theme.js        # colors, shadows, radii and fonts for the soft UI
tests/
```
