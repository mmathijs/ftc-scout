import { Image } from "expo-image";
import { View } from "react-native";
import { Icon } from "@/components/Icon";

// Uses the website's own SVGs so changes to a season's icons carry over.
const ARTIFACT = require("@web-static/img/artifact.svg");
const HIVE_1 = require("@web-static/img/hive-1.svg");
const HIVE_2 = require("@web-static/img/hive-2.svg");

export const RP_TILE = 48;

function Drawing({ source, size }: { source: number; size: number }) {
    return <Image source={source} style={{ width: size, height: size }} contentFit="contain" />;
}

function picture(id: string, size: number) {
    let icon = Math.round((size * 2) / 3);
    let small = Math.round(size * 0.29);
    // HELP: Season Specific
    switch (id) {
        case "movementRp":
        case "swarmRp":
            return <Icon name="robot" size={Math.round(size * 0.58)} color="#ffffff" />;
        case "goalRp":
            return <Drawing source={ARTIFACT} size={icon} />;
        case "patternRp":
            return (
                <View
                    style={{
                        width: size - 4,
                        flexDirection: "row",
                        justifyContent: "space-between",
                    }}
                >
                    <Drawing source={ARTIFACT} size={small} />
                    <Drawing source={ARTIFACT} size={small} />
                    <Drawing source={ARTIFACT} size={small} />
                </View>
            );
        case "pollinator1Rp":
            return <Drawing source={HIVE_1} size={icon} />;
        case "pollinator2Rp":
            return <Drawing source={HIVE_2} size={icon} />;
        default:
            return null;
    }
}

// Seasons without an icon here fall back to a check or a cross.
export function RankingPointIcon({
    id,
    active,
    fill,
    size = RP_TILE,
}: {
    id: string;
    active: boolean;
    fill: string;
    size?: number;
}) {
    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: 6,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: active ? fill : "#000000",
                opacity: active ? 1 : 0.4,
            }}
        >
            {picture(id, size) ?? (
                <Icon
                    name={active ? "check" : "xmark"}
                    size={Math.round(size * 0.46)}
                    color="#ffffff"
                />
            )}
        </View>
    );
}
