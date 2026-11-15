import { contrast } from "./contrast";
import { dark, light, type Palette } from "./tokens";

// Test contrast
function textPairs(p: Palette): [string, string, string][] {
    let out: [string, string, string][] = [];
    for (let s of [p.surface, p.zebra, p.bg, p.raised, p.form]) {
        out.push(["text", p.text, s], ["textSecondary", p.textSecondary, s]);
    }
    for (let s of [p.surface, p.zebra, p.raised]) out.push(["textMuted", p.textMuted, s]);
    for (let s of [p.surface, p.bg]) out.push(["link", p.link, s]);
    for (let tint of [p.redTint, p.blueTint, p.redTintZebra, p.blueTintZebra, p.purpleTint]) {
        out.push(["text on an alliance tint", p.text, tint]);
        out.push(["secondary on an alliance tint", p.textSecondary, tint]);
    }
    for (let c of Object.values(p.stat)) {
        out.push(
            ["text on a stat cell", p.text, c.tint],
            ["text on a striped stat cell", p.text, c.tintZebra]
        );
    }
    out.push(["onTheme", p.onTheme, p.theme], ["onInverse", p.onInverse, p.inverse]);
    return out;
}

function brandPairs(p: Palette): [string, string, string][] {
    let out: [string, string, string][] = [];
    for (let s of [p.surface, p.zebra]) {
        out.push(
            ["redText", p.redText, s],
            ["blueText", p.blueText, s],
            ["purpleText", p.purpleText, s]
        );
    }
    out.push(["accent", p.accent, p.surface]);
    for (let fill of [p.red, p.blue, p.purple])
        out.push(["white on an alliance heading", "#ffffff", fill]);
    for (let [name, c] of Object.entries(p.stat)) {
        if (name != "white") out.push([`white on the ${name} stat heading`, "#ffffff", c.fill]);
    }
    return out;
}

describe.each([light, dark])("$scheme palette", (palette) => {
    it.each(textPairs(palette))("%s (%s on %s) passes WCAG AA", (_name, fg, bg) => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(brandPairs(palette))("%s (%s on %s) is at least 3:1", (_name, fg, bg) => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
    });
});
