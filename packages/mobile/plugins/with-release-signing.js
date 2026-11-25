// Signs release builds with the Google Play upload key (`npx expo prebuild` writes it into
// android/app/build.gradle).
//
// Gradle reads the key from four properties:
//   FTCSCOUT_UPLOAD_STORE_FILE, FTCSCOUT_UPLOAD_STORE_PASSWORD,
//   FTCSCOUT_UPLOAD_KEY_ALIAS, FTCSCOUT_UPLOAD_KEY_PASSWORD
// Locally they go in ~/.gradle/gradle.properties. The google-play job in mobile.yml passes them as
// ORG_GRADLE_PROJECT_FTCSCOUT_UPLOAD_* environment variables.
//
// Without them a release build is signed with the debug key. That's fine for trying out a release
// build, but Google Play refuses it, and the google-play job checks the signature before uploading.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// @ftcscout release-signing";

const RELEASE_SIGNING_CONFIG = `
        release { ${MARKER}
            if (project.hasProperty('FTCSCOUT_UPLOAD_STORE_FILE')) {
                storeFile file(FTCSCOUT_UPLOAD_STORE_FILE)
                storePassword FTCSCOUT_UPLOAD_STORE_PASSWORD
                keyAlias FTCSCOUT_UPLOAD_KEY_ALIAS
                keyPassword FTCSCOUT_UPLOAD_KEY_PASSWORD
            }
        }`;

const USE_RELEASE_SIGNING =
    "signingConfig project.hasProperty('FTCSCOUT_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug";

// signingConfigs { debug { ... } }: the release config goes after the debug one.
const DEBUG_SIGNING_CONFIG = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/;
// buildTypes { debug { ... } release { ... signingConfig signingConfigs.debug
const RELEASE_BUILD_TYPE =
    /(buildTypes\s*\{\s*debug\s*\{[^}]*\}\s*release\s*\{[^}]*?)signingConfig signingConfigs\.debug/;

module.exports = function withReleaseSigning(config) {
    return withAppBuildGradle(config, (config) => {
        let gradle = config.modResults.contents;
        if (gradle.includes(MARKER)) return config;

        if (!DEBUG_SIGNING_CONFIG.test(gradle) || !RELEASE_BUILD_TYPE.test(gradle)) {
            // The template changed (a new Expo SDK): fail instead of silently signing with debug.
            throw new Error(
                "with-release-signing: android/app/build.gradle doesn't look as expected, update plugins/with-release-signing.js"
            );
        }
        gradle = gradle.replace(DEBUG_SIGNING_CONFIG, `$1${RELEASE_SIGNING_CONFIG}`);
        gradle = gradle.replace(RELEASE_BUILD_TYPE, `$1${USE_RELEASE_SIGNING}`);

        config.modResults.contents = gradle;
        return config;
    });
};
