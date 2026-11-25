import { BAR_LOGO_LEFT, BAR_SCALE, launchPath, LOGO_GAP, LOGO_ICON, SPLASH_ICON } from "./path";

const screen = { width: 390, height: 844, textWidth: 170, barCenterY: 79 };

describe("launchPath", () => {
    let p = launchPath(screen);
    let logoWidth = LOGO_ICON + LOGO_GAP + screen.textWidth;

    it("starts with the binoculars where the system's splash has them: centred, at its size", () => {
        let iconCentreInLogo = LOGO_ICON / 2;
        expect(iconCentreInLogo + p.iconStartX).toBeCloseTo(logoWidth / 2);
        expect(LOGO_ICON * p.iconStartScale).toBeCloseTo(SPLASH_ICON);
    });

    it("ends with the logo where the top bar's is", () => {
        let endCentreX = screen.width / 2 + p.logoDx;
        let endLeft = endCentreX - (logoWidth * BAR_SCALE) / 2;
        expect(endLeft).toBeCloseTo(BAR_LOGO_LEFT);
        expect(screen.height / 2 + p.logoDy).toBeCloseTo(screen.barCenterY);
    });

    it("lifts the sheet clear of the screen", () => {
        expect(p.lift).toBe(-screen.height);
    });

    it("moves the logo up and to the left on any phone", () => {
        for (let width of [320, 360, 430]) {
            let q = launchPath({ ...screen, width });
            expect(q.logoDx).toBeLessThan(0);
            expect(q.logoDy).toBeLessThan(0);
        }
    });
});
