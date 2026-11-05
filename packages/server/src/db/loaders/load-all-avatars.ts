import { Season } from "@ftc-scout/common";
import { In } from "typeorm";
import { getAvatars } from "../../ftc-api/get-avatars";
import { TeamAvatar } from "../entities/TeamAvatar";
import { DATA_SOURCE } from "../data-source";

const MIN_FRACTION_PRESENT_FOR_REMOVAL = 0.5;

const GONE_STATUSES = new Set([404, 410, 500]);
const CHECK_CONCURRENCY = 10;

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

async function isAvatarGone(avatar: TeamAvatar): Promise<boolean> {
    try {
        let response = await fetch(avatar.url);
        await response.body?.cancel();
        return GONE_STATUSES.has(response.status);
    } catch (e) {
        console.error(`Failed to check avatar ${avatar.url}: ${e}`);
        return false;
    }
}

async function filterGone(avatars: TeamAvatar[]): Promise<TeamAvatar[]> {
    let gone: TeamAvatar[] = [];
    for (let i = 0; i < avatars.length; i += CHECK_CONCURRENCY) {
        let chunk = avatars.slice(i, i + CHECK_CONCURRENCY);
        let results = await Promise.all(chunk.map(isAvatarGone));
        gone.push(...chunk.filter((_, j) => results[j]));
    }
    return gone;
}

async function removeDeletedAvatars(season: Season, avatars: Map<number, string>) {
    let stored = await TeamAvatar.find({ where: { season } });

    let storedTeams = new Set(stored.map((a) => a.teamNumber));
    let presentTeams = [...storedTeams].filter((t) => avatars.has(t)).length;
    let trustAbsence =
        storedTeams.size == 0 ||
        presentTeams / storedTeams.size >= MIN_FRACTION_PRESENT_FOR_REMOVAL;

    if (!trustAbsence) {
        console.warn(
            `Only ${presentTeams}/${storedTeams.size} teams with stored avatars are present in ` +
                `the ${season} avatar stylesheet. Not removing avatars of absent teams this run.`
        );
    }

    let absent = trustAbsence ? stored.filter((a) => !avatars.has(a.teamNumber)) : [];
    let superseded = stored.filter(
        (a) => avatars.has(a.teamNumber) && avatars.get(a.teamNumber) != a.uuid
    );
    let toDelete = [...absent, ...(await filterGone(superseded))];

    if (!toDelete.length) return;

    console.info(
        `Removing ${toDelete.length} avatars deleted by FIRST for season ${season} ` +
            `(teams: ${[...new Set(toDelete.map((a) => a.teamNumber))].join(", ")}).`
    );

    await DATA_SOURCE.transaction(async (em) => {
        await em.delete(TeamAvatar, { id: In(toDelete.map((a) => a.id)) });

        let deletedUrls = toDelete.map((a) => a.url);
        // URL expression must match TeamAvatar.urlFor.
        await em.query(
            `UPDATE team SET avatar_url = (
                SELECT 'https://event-portal.firstinspires.org/ftc/' || (ta.season + 1)
                    || '/avatars/composed/' || ta.team_number || '_' || ta.uuid
                FROM team_avatar ta
                WHERE ta.team_number = team.number
                ORDER BY ta.season DESC, ta.id DESC
                LIMIT 1
            )
            WHERE team.avatar_url = ANY($1::text[])`,
            [deletedUrls]
        );
    });
}

export async function loadAllAvatars(season: Season) {
    console.info(`Loading avatars for season ${season}.`);

    let avatars = await getAvatars(season);

    if (avatars.size == 0) {
        // Also covers failed requests, so never treat this as "every avatar was removed".
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
    await removeDeletedAvatars(season, avatars);

    console.info(`Finished loading avatars for season ${season}.`);
}
