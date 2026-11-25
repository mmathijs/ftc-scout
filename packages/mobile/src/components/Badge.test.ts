import { contrast } from "@/theme/contrast";
import { BADGE_COLORS } from "./Badge";

let fills = Object.entries(BADGE_COLORS).flatMap(([scheme, colors]) =>
    Object.entries(colors).map(([kind, fill]) => [scheme, kind, fill])
);

it.each(fills)("white text on the %s theme's %s badge (%s) passes WCAG AA", (_s, _k, fill) => {
    expect(contrast("#ffffff", fill)).toBeGreaterThanOrEqual(4.5);
});
