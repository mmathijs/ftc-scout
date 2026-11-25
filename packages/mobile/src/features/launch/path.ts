/** The native splash icon's size (imageWidth in app.config.ts). */
export const SPLASH_ICON = 96;
export const LOGO_ICON = 44;
export const LOGO_GAP = 14;
export const LOGO_TEXT = 38;
/** The top bar's logo relative to this one (see Header.tsx). */
export const BAR_SCALE = 0.5;
export const BAR_LOGO_LEFT = 54;

export type LaunchPath = {
    iconStartX: number;
    iconStartScale: number;
    logoDx: number;
    logoDy: number;
    lift: number;
};

export function launchPath({
    width,
    height,
    textWidth,
    barCenterY,
}: {
    width: number;
    height: number;
    textWidth: number;
    barCenterY: number;
}): LaunchPath {
    let logoWidth = LOGO_ICON + LOGO_GAP + textWidth;
    return {
        iconStartX: logoWidth / 2 - LOGO_ICON / 2,
        iconStartScale: SPLASH_ICON / LOGO_ICON,
        logoDx: BAR_LOGO_LEFT + (logoWidth * BAR_SCALE) / 2 - width / 2,
        logoDy: barCenterY - height / 2,
        lift: -height,
    };
}
