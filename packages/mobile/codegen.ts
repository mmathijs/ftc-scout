import type { CodegenConfig } from "@graphql-codegen/cli";
import { API_ORIGIN } from "./src/api/config";

const config: CodegenConfig = {
    schema: process.env.GRAPHQL_SCHEMA || `${API_ORIGIN}/graphql`,
    documents: ["../web/src/lib/graphql/fragments/**/*.graphql", "./src/api/graphql/**/*.graphql"],
    generates: {
        "./src/api/generated/types.ts": {
            plugins: ["typescript-operations"],
            config: {
                useTypeImports: true,
                enumsAsTypes: true,
                namingConvention: "keep",
                scalars: { DateTime: "string", Date: "string" },
            },
        },
        "./src/api/generated/documents.ts": {
            plugins: ["./scripts/documents.cjs"],
        },
    },
};

export default config;
