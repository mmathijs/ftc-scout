import { useLocalSearchParams } from "expo-router";
import { Stack } from "expo-router/stack";
import { seasonParam, teamNumberParam } from "@/api/params";
import { Page } from "@/components/Screen";
import { NoTeam } from "@/components/States";
import { TeamScreen } from "@/features/team/TeamScreen";
import { isDeep } from "@/nav";

export default function TeamRoute() {
    let { number, name, season, d } = useLocalSearchParams<{
        number: string;
        name?: string;
        season?: string;
        d?: string;
    }>();
    let team = teamNumberParam(number);
    if (team == null) {
        return (
            <Page>
                <Stack.Screen options={{ title: "Team", headerRight: undefined }} />
                <NoTeam number={String(number)} />
            </Page>
        );
    }
    return (
        <TeamScreen
            number={team}
            nameHint={name}
            seasonHint={seasonParam(season)}
            deep={isDeep(d)}
        />
    );
}
