import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";
import { trackEventView } from "../../../analytics";

export const load: PageLoad = async ({ params }) => {
    trackEventView(params.season, params.code, "Main - Redirect");
    throw redirect(301, `/events/${params.season}/${params.code}/matches`);
};
