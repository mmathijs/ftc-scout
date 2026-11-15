import type { CodegenConfig } from "@graphql-codegen/cli";

// The website's queries plus the app's own. Set GRAPHQL_SCHEMA=http://localhost:4000/graphql to
// use a local server.
const config: CodegenConfig = {
    schema: process.env.GRAPHQL_SCHEMA || "https://api.ftcscout.org/graphql",
    documents: ["../web/src/lib/graphql/**/*.graphql", "./src/api/graphql/**/*.graphql"],
    generates: {
        "./src/api/generated/types.ts": {
            plugins: ["typescript-operations"],
            config: {
                useTypeImports: true,
                enumsAsTypes: true,
                scalars: { DateTime: "string", Date: "string" },
            },
        },
    },
};

export default config;
