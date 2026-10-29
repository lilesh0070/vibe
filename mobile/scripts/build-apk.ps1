# Builds a signed release APK at mobile/dist/Vibe.apk.
# Needs ANDROID_HOME (platform 35+, build-tools 36.0.0) and JAVA_HOME (JDK 17+).
# The signing key lives in mobile/credentials/ (gitignored). Every update must be signed
# with the same key, or Android refuses to install it over the existing app.
#
# -Unsigned <apk> skips the local build and only signs an APK built elsewhere, such as the
# "Android APK" GitHub Actions artifact. Local Windows builds hit the 260-character path
# limit in React Native's C++ build unless long paths are enabled.
param([string]$Abis = 'armeabi-v7a,arm64-v8a,x86_64', [string]$Unsigned)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$sdk = $env:ANDROID_HOME
if (!$sdk -or !$env:JAVA_HOME) { throw 'Set ANDROID_HOME and JAVA_HOME before building.' }
$tools = Join-Path $sdk 'build-tools\36.0.0'
$key = Join-Path $root 'credentials\vibe-release.jks'
$password = Join-Path $root 'credentials\keystore-password.txt'
if (!(Test-Path -LiteralPath $key) -or !(Test-Path -LiteralPath $password)) {
  throw "Signing key missing: restore credentials\vibe-release.jks and keystore-password.txt from your backup."
}

function Run([string]$tool, [string[]]$arguments) {
  & $tool @arguments
  if ($LASTEXITCODE -ne 0) { throw "Build step failed: $tool $($arguments -join ' ')" }
}

Push-Location $root
try {
  if ($Unsigned) {
    $built = (Resolve-Path -LiteralPath $Unsigned).Path
  } else {
    $env:CI = '1'
    # android/ is generated from app.json; regenerate it so config changes always apply.
    Run 'npx.cmd' @('expo', 'prebuild', '--platform', 'android', '--no-install')
    # Some sandboxed shells cannot create the JVM's Unix domain sockets in %TEMP%
    # ("Unable to establish loopback connection"); give Gradle a short local folder.
    $uds = Join-Path $root 'android\.uds'
    New-Item -ItemType Directory -Force -Path $uds | Out-Null
    $env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=$uds"
    Run (Join-Path $root 'android\gradlew.bat') @('-p', (Join-Path $root 'android'), 'assembleRelease', "-PreactNativeArchitectures=$Abis", '--console=plain')
    $built = Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk'
  }

  $dist = Join-Path $root 'dist'
  New-Item -ItemType Directory -Force -Path $dist | Out-Null
  $apk = Join-Path $dist 'Vibe.apk'
  # Gradle signs release builds with the debug key; re-sign with the release key.
  Run (Join-Path $tools 'apksigner.bat') @('sign', '--ks', $key, '--ks-key-alias', 'vibe', '--ks-pass', "file:$password", '--key-pass', "file:$password", '--out', $apk, $built)
  Run (Join-Path $tools 'apksigner.bat') @('verify', '--print-certs', $apk)
  Run (Join-Path $tools 'zipalign.exe') @('-c', '-P', '16', '4', $apk)

  $hash = (Get-FileHash $apk -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content (Join-Path $dist 'SHA256SUMS.txt') "$hash  Vibe.apk" -Encoding ascii
  $size = [math]::Round((Get-Item $apk).Length / 1MB, 1)
  Write-Output "Signed APK: $apk ($size MB)"
} finally {
  Pop-Location
}
