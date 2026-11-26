import { useLocalSearchParams } from "expo-router";
import { Stack } from "expo-router/stack";
import { seasonParam } from "@/api/params";
import { Page } from "@/components/Screen";
import { NoEvent } from "@/components/States";
import { EventScreen } from "@/features/event/EventScreen";
import { isDeep } from "@/nav";

export default function EventRoute() {
    let { season, code, name, d } = useLocalSearchParams<{
        season: string;
        code: string;
        name?: string;
        d?: string;
    }>();
    let year = seasonParam(season);
    if (year == null) {
        return (
            <Page>
                <Stack.Screen options={{ title: "Event", headerRight: undefined }} />
                <NoEvent season={String(season)} code={String(code)} />
            </Page>
        );
    }
    return <EventScreen season={year} code={String(code)} nameHint={name} deep={isDeep(d)} />;
}
