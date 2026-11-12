import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
    console.log("Layout server load - locals.geo:", locals.geo);
    return {
        geo: locals.geo,
    };
};
