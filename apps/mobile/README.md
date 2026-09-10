# Pocket Jam mobile shell (N04)

This is the React Native/Expo application shell for native development builds. Expo Go is not an acceptance environment: N05 and N09 will add native modules that require a project-specific development client.

The mobile Metro configuration preserves the portable packages' NodeNext `.js` import specifiers while resolving their checked-in TypeScript source. It is scoped to `packages/` and does not change the portable package contracts.

## Configuration

`APP_VARIANT` selects `development` (the default), `preview`, or `production`. Each variant has a separate display name, deep-link scheme, iOS bundle identifier, and Android application ID. The checked-in identifiers are stable repository placeholders:

| Variant | Application ID | Scheme | Status |
| --- | --- | --- | --- |
| development | `com.pocketjam.mobile.dev` | `pocket-jam-dev` | stable N04 development identifier |
| preview | `com.pocketjam.mobile.preview` | `pocket-jam-preview` | stable N04 internal-preview identifier |
| production | `com.pocketjam.mobile` | `pocket-jam` | candidate only; reserve/confirm with final store accounts before release |

No backend endpoint or secret is configured. If a final organization identifier differs, change all three variants deliberately before signing or distributing builds.

## Install and static validation

From the repository root with Node.js 22.13 or newer:

```sh
npm ci
npm run test:n04
npm run test:mobile:bundle
APP_VARIANT=development npm run config:check --workspace @pocket-jam/mobile
APP_VARIANT=preview npm run config:check --workspace @pocket-jam/mobile
APP_VARIANT=production npm run config:check --workspace @pocket-jam/mobile
```

## Native development build

Local native builds use Continuous Native Generation; `expo run:*` prebuilds automatically when native directories are absent. Generated `ios/` and `android/` directories are intentionally ignored.

Local Android compilation requires Android Studio/SDK, a compatible JDK, and `adb`. Local iPhone compilation requires full Xcode, CocoaPods 1.15.2 or newer, an attached trusted device, and a selected signing team.

Pixel 5 / physical Android:

```sh
adb devices -l
APP_VARIANT=development npm run android --workspace @pocket-jam/mobile -- --device
```

Physical iPhone on macOS:

```sh
xcrun xctrace list devices
APP_VARIANT=development npm run ios --workspace @pocket-jam/mobile -- --device
```

After installing the development client, start Metro for it:

```sh
APP_VARIANT=development npm run start --workspace @pocket-jam/mobile
```

For a clean regeneration after native configuration changes:

```sh
APP_VARIANT=development npm run prebuild --workspace @pocket-jam/mobile -- --clean
```

EAS is optional for N04 and requires an Expo account plus platform credentials:

```sh
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile development --platform ios
```

When validating a device, launch the development build, background it, return to foreground, confirm diagnostics show the transitions, and confirm the shell remains paused/awaiting explicit user action. Simulator/emulator results are supplemental; physical Android and iPhone launch evidence is required for full N04 PASS.

Reference: Expo's [development-build guide](https://docs.expo.dev/develop/development-builds/introduction/) and [Expo Router installation guide](https://docs.expo.dev/router/installation/).
