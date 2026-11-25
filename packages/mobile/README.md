# FTCScout mobile app

The FTCScout app for Android and iOS, built with [Expo](https://expo.dev) (React Native).

## Shared code

The app uses `packages/common` and parts of `packages/web/src/lib` (`util`, `printers` and the GraphQL queries) as source, plus the ranking point icons from `packages/web/static/img`.

The API types are generated from the schema at `https://api.ftcscout.org/graphql`, the website's `.graphql` files and the app's own in `src/api/graphql`. To generate them against a local server, set `GRAPHQL_SCHEMA` (see `codegen.ts`):

```bash
GRAPHQL_SCHEMA=http://localhost:4000/graphql npm run gen
```

## Running

```bash
cd packages/mobile
npm install
npx expo start
```

In the output, you'll find options to open the app in a

-   [development build](https://docs.expo.dev/develop/development-builds/introduction/)
-   [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
-   [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
-   [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

By default the app uses `https://ftcscout-api.mmathijs.nl` and links to `https://ftcscout.mmathijs.nl`. Set `EXPO_PUBLIC_API_ORIGIN` and `EXPO_PUBLIC_SITE_ORIGIN` (in `.env.local`, or in the EAS build profile) to use something else.

## Checks

```bash
npm run check
npm test
npm run export
```

`check` runs TypeScript, `test` runs Jest and `export` bundles the app for Android and iOS. CI runs all three (`.github/workflows/mobile.yml`).

## Building

Store builds are made with [EAS](https://docs.expo.dev/build/introduction/). Run these in `packages/mobile`:

```bash
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform all
```

`preview` gives an APK to install directly. The app ids are `nl.mmathijs.ftcscout` (`app.config.ts`).

## Over-the-air updates

Expo OTA updates are set up on `ota.mmathijs.nl` and pulled from `ota-cdn.mmathijs.nl` (Cloudflare R2)
