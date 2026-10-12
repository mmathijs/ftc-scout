import { Season } from "@ftc-scout/common";
import { In } from "typeorm";
import { getAvatars } from "../../ftc-api/get-avatars";
import { TeamAvatar } from "../entities/TeamAvatar";
import { DATA_SOURCE } from "../data-source";

async function updateTeamAvatarUrls(season: Season, avatars: Map<number, string>) {
    let numbers = [...avatars.keys()];
    let urls = numbers.map((n) => TeamAvatar.urlFor(season, n, avatars.get(n)!));

    await DATA_SOURCE.query(
        `UPDATE team SET avatar_url = data.url
         FROM (SELECT unnest($1::int[]) AS number, unnest($2::text[]) AS url) AS data
         WHERE team.number = data.number`,
        [numbers, urls]
    );
}

export async function loadAllAvatars(season: Season) {
    console.info(`Loading avatars for season ${season}.`);

    let avatars = await getAvatars(season);

    if (avatars.size == 0) {
        console.info(`No avatars found for season ${season}.`);
        return;
    }

    console.info(`Fetched ${avatars.size} avatars.`);

    let numbers = [...avatars.keys()];
    let existing = await TeamAvatar.find({ where: { teamNumber: In(numbers) } });
    let existingUuids = new Set(existing.map((e) => `${e.teamNumber}_${e.uuid}`));

    let toInsert = [...avatars.entries()]
        .filter(([number, uuid]) => !existingUuids.has(`${number}_${uuid}`))
        .map(([number, uuid]) => TeamAvatar.fromParsed(season, number, uuid));

    if (toInsert.length) {
        console.info(`Adding ${toInsert.length} new avatar versions to the database.`);

        await DATA_SOURCE.createQueryBuilder()
            .insert()
            .into(TeamAvatar)
            .values(toInsert)
            .orIgnore()
            .execute();
    }

    await updateTeamAvatarUrls(season, avatars);

    console.info(`Finished loading avatars for season ${season}.`);
}
