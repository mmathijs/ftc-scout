import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { IconButton } from "@/components/Button";
import { Card, CardHeading, Title } from "@/components/Card";
import { EventRow, TeamRow } from "@/components/Rows";
import { Page } from "@/components/Screen";
import { EmptyView, useOnline } from "@/components/States";
import { Txt } from "@/components/Txt";
import { favorites, toggleFavoriteEvent, toggleFavoriteTeam } from "@/store/favorites";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

// The star is beside the row's link rather than in it, since iOS hides what is inside a link
// from VoiceOver.
function Starred({
    label,
    onUnstar,
    children,
}: {
    label: string;
    onUnstar: () => void;
    children: ReactNode;
}) {
    let c = useTheme();
    return (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>{children}</View>
            <IconButton
                icon="star"
                label={label}
                color={c.late}
                onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    onUnstar();
                }}
            />
        </View>
    );
}

export function FavoritesScreen() {
    let favs = favorites.useValue();
    let online = useOnline();

    return (
        <Page>
            <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
                <Card>
                    <Title>Favorites</Title>
                    <Txt dim>
                        {online
                            ? "The teams and events you starred. Ones you've opened also work without a connection."
                            : "You're offline. Favorites you've opened before show their saved copy."}
                    </Txt>
                </Card>
                {!favs.teams.length && !favs.events.length ? (
                    <Card>
                        <EmptyView
                            icon="star"
                            title="No favorites yet"
                            text="Tap the star at the top of a team or an event to keep it here."
                        />
                    </Card>
                ) : null}
                {favs.teams.length ? (
                    <Card>
                        <CardHeading title="Teams" />
                        {favs.teams.map((t) => (
                            <Starred
                                key={t.number}
                                label={`Remove team ${t.number} from favorites`}
                                onUnstar={() => toggleFavoriteTeam(t)}
                            >
                                <TeamRow number={t.number} name={t.name} />
                            </Starred>
                        ))}
                    </Card>
                ) : null}
                {favs.events.length ? (
                    <Card>
                        <CardHeading title="Events" />
                        {favs.events.map((e) => (
                            <Starred
                                key={`${e.season}-${e.code}`}
                                label={`Remove ${e.season} ${e.name} from favorites`}
                                onUnstar={() => toggleFavoriteEvent(e)}
                            >
                                <EventRow event={{ ...e, name: `${e.season} ${e.name}` }} />
                            </Starred>
                        ))}
                    </Card>
                ) : null}
            </ScrollView>
        </Page>
    );
}
