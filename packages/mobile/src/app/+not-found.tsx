import { View } from "react-native";
import { Button } from "@/components/Button";
import { Page } from "@/components/Screen";
import { EmptyView } from "@/components/States";
import { goHome } from "@/nav";
import { space } from "@/theme/tokens";

export default function NotFound() {
    return (
        <Page>
            <EmptyView
                icon="map-location-dot"
                title="Page not found"
                text="There is nothing at this address in the app."
            />
            <View style={{ alignItems: "center", marginTop: space.sm }}>
                <Button label="Home" icon="house" onPress={goHome} primary />
            </View>
        </Page>
    );
}
