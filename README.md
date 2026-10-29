# Vibe — Find your frequency

A complete, original music discovery and streaming application built with React, JavaScript, Vite, HTML5, CSS3 and React Router. Vibe combines an expressive dark interface with a persistent global audio player and a personal library stored on your device. It runs entirely in the browser and is ready for GitHub Pages.

## Features

- Home with trending music, new releases, independent artists, genre collections, mood mixes, continue listening and personalized discovery.
- Debounced search across songs, artists, albums, genres and your saved playlists; search history and filters.
- Full available track playback, seeking, volume, mute, shuffle, repeat one/all, automatic next track, persistent queue and fullscreen player.
- Queue additions, play next, removal, reordering and clearing upcoming tracks.
- Liked songs, playlist creation/rename/delete, track management, play all and shuffle; deletion confirmation and generated artwork collages.
- Dedicated artist, album/single, genre, library, history and profile pages.
- Weighted local recommendations with artist diversity, recent-track suppression and listening/skip signals.
- Desktop sidebar, tablet navigation, mobile bottom navigation and mini-player, lazy routes/images, loading skeletons, retry states, toasts and accessible controls.

## Stack and installation

Requires Node.js 20.19+ (Node 22 LTS recommended) and npm. No server or private API credentials are needed.

```sh
npm install
npm run dev
npm run build
npm run deploy
```

`npm run dev` starts the local development server. `npm run build` outputs the production app in `dist`. `npm run preview` serves that build locally. `npm test` checks the recommendation scoring, diversity and time formatting.

## GitHub Pages deployment

1. Create a GitHub repository and push this project into its root.
2. Make sure the local Git repository has an `origin` remote pointing to that repository.
3. Run `npm run deploy`. The `gh-pages` package publishes the built `dist` folder to the `gh-pages` branch.
4. In GitHub repository **Settings → Pages**, select **Deploy from a branch**, choose **gh-pages** and **/(root)**, then save.
5. Visit `https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/`.

Vite defaults to a relative base (`./`) so assets work under repository subpaths and custom domains. Override with `VITE_BASE_PATH=/YOUR_REPOSITORY/` when an absolute base is desired. React Router uses hash URLs (`/#/artist/id`) so refreshing or sharing nested pages works on GitHub Pages without a rewrite server. The deploy script does not include source files or dependencies in the published branch.

## Architecture

```text
src/
  components/
    layout/        # navigation and shell
    player/        # global player, progress, volume and queue
    cards/         # track cards, lists and context menus
    common/        # accessible modal, artwork, loading/empty states
  context/
    PlayerContext.jsx
    LibraryContext.jsx
  hooks/           # asynchronous requests, search, recommendations, storage
  pages/           # route screens, loaded on demand
  services/
    musicApi.js
    storageService.js
    recommendationEngine.js
    analytics.js
  styles/          # theme variables and responsive styles
  utils/           # duration and number formatting
tests/             # behavior-based recommendation tests
public/            # favicon and fallback artwork
```

Related small page components share modules to avoid unnecessary files. `PlayerContext` owns one HTML5 audio element outside route transitions. `LibraryContext` owns playlists, likes, history and profile state. Components use the storage service instead of reading localStorage directly.

## Music APIs, Indian catalog and availability

Vibe automatically loads Hindi, Punjabi and Haryanvi releases from public YouTube Atom channel feeds, documented by [Google](https://developers.google.com/youtube/v3/guides/push_notifications). Twelve channels currently include T-Series, Sony Music India, Tips, Saregama, T-Series Apna Punjab, Speed Records, Diljit Dosanjh, Sidhu Moose Wala, Karan Aujla, Renuka Panwar, Desi Records and White Hill Dhaakad. The checked-in catalog works without credentials or pasted song links. The browser refreshes these feeds through the free [rss2json API](https://rss2json.com/docs), without a key. Responses are cached locally for one hour, and active sessions check hourly. **Refresh music catalog** in Updates checks immediately; upstream caches/rate limits still apply. The bundled catalog is a fallback. Run `npm run catalog` to refresh that fallback. Feed coverage is recent uploads; it is not every historical song on YouTube. Clearly marked teasers, previews, trailers and Shorts are filtered, but publishers control their metadata.

YouTube tracks play in the official visible [IFrame player](https://developers.google.com/youtube/iframe_api_reference), with navigation, queue, seeking, volume, repeat and likes integrated into Vibe. Video remains visible during playback and pauses when the document is hidden. Ads, region restrictions, embedding permissions and availability remain under YouTube/publisher control. Unavailable videos show an error and a Watch on YouTube link. Audio is never extracted or downloaded. Channel metadata is displayed as channel information rather than fabricated artist statistics. Durations are retrieved when playback starts.

For on-demand search beyond the feed catalog, enable YouTube Data API v3 in your Google project and add an HTTP-referrer-restricted browser API key in **Updates & downloads**. Restrict it to YouTube Data API v3 and `https://lilesh0070.github.io/*`. It stays in this browser and is not committed to source. Quotas still apply. Default discovery does not require a key. No free public API grants unrestricted full audio from every music service.

The [Audius API](https://docs.audius.co/) continues to provide independent full audio tracks, artists and albums. Provider failover, cancellation, stream retries and gated-track filtering remain supported. No custom backend, private credential, external analytics, recording redistribution or subscription bypass is used.

## Install and update

Open **Updates & install** in the sidebar, or **Profile → Updates, install & downloads** on mobile. Check for updates, then choose **Update & restart** to activate a waiting service worker and reload. This stops current playback and preserves device data. Install Vibe using the offered install button or the browser menu; on iPhone use Safari → Share → Add to Home Screen. The offline cache contains only the app shell and bundled assets. Music and live catalog access require internet. **Download latest project** retrieves the GitHub source ZIP, not songs or an Android APK.

An optional GitHub Actions template is included in `deployment-workflow.yml`. To activate automatic build deployment, copy it to `.github/workflows/deploy.yml` with a GitHub credential that has workflow permission, then configure repository Settings → Pages → Source → GitHub Actions. The prepared workflow builds on every main-branch push and refreshes the bundled fallback every six hours (GitHub schedules can be delayed). Runtime catalog refresh already works independently of this template. It uses read-only source access, Pages deployment permission and an OIDC token. Browser code contains no GitHub push token: changes are committed and pushed by the developer, then deployed using `npm run deploy` (or Actions if the template is activated). Build output includes version.json and a versioned service worker. The conventional npm run deploy script remains available for branch-based Pages hosting.

## Local storage and recommendations

For compatibility with existing libraries, keys retain the legacy `sona_` prefix: `liked`, `history`, `playlists`, `preferences`, `search_history`, `player_state`, `settings`, `events`. History is limited to 100 unique tracks, events to 800, preferences to 500 tracks and recent searches to 12. Player restores the last queue, position and settings in a paused state to respect browser autoplay rules. Storage failures use an in-memory fallback and notify the user. Profile names are local display labels, not authenticated identities. Data stays in this browser; there is no cross-device synchronization or external analytics.

Local events include `track_started`, `track_completed`, `track_skipped`, `track_liked`, `track_unliked`, `playlist_added`, `search_performed`, `artist_opened` and `listening_time`. Playback time is counted while audio advances, excluding seeks. Recommendations weight liked artists (+12), liked genres (+10), playlist affinity (+8), repeat plays (+6), completions (+5), recent genre affinity (+4) and early skip penalties (−5; additional artist penalty −4). Artist diversity and a recent-play penalty help avoid repetitive mixes.

## Keyboard and accessibility

- **Space**: play/pause.
- **Left/Right**: seek backward/forward 10 seconds.
- **M**: mute/unmute.
- Dialogs support Escape, focus trapping and focus restoration. Inputs, buttons and links retain normal keyboard behavior.
- Reduced-motion preferences disable decorative animation. Artwork failures fall back to the bundled graphic.

## Screenshots

Add desktop and mobile screenshots here when customizing the catalog or brand. The deliverable includes verification notes for this build.

## Future features

Optional account synchronization, additional licensed catalogs, offline PWA support and richer provider-supported artist relationships could be added later. They are not required to run this version.

## License

Application source is MIT licensed. Third-party recordings, artist images and API content remain subject to their creators’ rights and provider terms.

## React Native app

`mobile/` contains the native rewrite of Vibe (Expo + React Native, soft-UI design). It plays full songs from Audius and live Desi radio from Radio Browser, without YouTube or API keys, and supports background playback. See [mobile/README.md](mobile/README.md).

## Android APK

Download the installable Android package from [the latest GitHub release](https://github.com/lilesh0070/vibe/releases/latest/download/Vibe.apk). Requires Android 8.0+ and internet access. The APK opens the hosted Vibe app in Android System WebView, including the visible official YouTube player. Android's browser downloads APKs; the system installer asks the user to confirm installation. Music playback pauses when the app leaves the foreground.

**Updates & downloads** provides a direct APK download and, inside the Android app, a separate Android-version check. Web app updates use **Check for updates → Update & restart**. The Android package version is independent of the hosted web version. Install new APKs over the existing Vibe app to retain its local library; browser/PWA libraries are separate from Android WebView storage.

The local source repository is at `D:\Vibe`. Build an APK with Android SDK platform 35, Build Tools 36.0.0, and JDK 17+:

```powershell
$env:ANDROID_HOME = 'D:\dev\android-sdk'
$env:JAVA_HOME = 'D:\dev\jdk17'
pwsh -NoProfile -File .\android\build.ps1
```

The build script compiles, aligns and signs `android/build/Vibe.apk`, verifies signatures and writes `SHA256SUMS.txt`. The private release key and its generated password remain in ignored `android/signing/`; preserve them privately for future APK updates, and never upload them. Android source, the build script and web source are public; signing credentials and build caches are excluded.
