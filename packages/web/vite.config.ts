import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig((mode) => ({
    ssr: {
        noExternal: ["@graphql-typed-document-node/core", "three"],
    },
    optimizeDeps: {
        // Linked package, so changes show up in dev.
        exclude: ["@graphql-typed-document-node/core", "svelte-fa", "ftc-embeds"],
    },
    // Resolves importing common.
    resolve: {
        preserveSymlinks: true,
    },
    define: {
        // For Apollo
        __DEV__: (mode.mode == "development").toString(),
    },
    plugins: [sveltekit()],
}));
