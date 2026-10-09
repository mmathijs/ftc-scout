import { Season } from "@ftc-scout/common";

// example from css xxx_uuid:
// .team-7 {
//   background-image: url("/ftc/2026/avatars/composed/7_050f2636-ea41-43e1-9626-ce5a32934ccf");
// }
const TEAM_AVATAR_RE =
    /\.team-(\d+)\s*\{\s*background-image:\s*url\("\/ftc\/\d+\/avatars\/composed\/\d+_([0-9a-fA-F-]+)"\);?\s*\}/g;

export async function getAvatars(season: Season): Promise<Map<number, string>> {
    let url = `https://event-portal.firstinspires.org/ftc/${season}/avatars/composed.css`;
    let avatars = new Map<number, string>();

    console.info(`Making a request to ${url}`);

    let css: string;
    try {
        let response = await fetch(url);
        if (!response.ok) {
            console.info(`No avatars available for season ${season} (status ${response.status}).`);
            return avatars;
        }
        css = await response.text();
    } catch (e) {
        console.error(`Failure while making a request to ${url}. Received error ${e}.`);
        return avatars;
    }

    for (let match of css.matchAll(TEAM_AVATAR_RE)) {
        avatars.set(+match[1], match[2]);
    }

    return avatars;
}
