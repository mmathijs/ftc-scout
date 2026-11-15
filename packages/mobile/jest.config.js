const path = require("path");

const app = (name) => path.resolve(__dirname, "node_modules", name);

// Pinned to this package's install: from ../common and ../web, Node's lookup would find the
// repository root's install first, with other versions.
const FROM_APP = ["@babel/runtime", "ml-matrix", "async-mutex"];

/** @type {import('jest').Config} */
module.exports = {
    preset: "jest-expo",
    roots: ["<rootDir>/src"],
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
        "^@ftc-scout/common$": path.resolve(__dirname, "../common/src/index.ts"),
        "^@web-static/.*$": "<rootDir>/src/shims/asset.ts",
        "^@web/(.*)$": path.resolve(__dirname, "../web/src/lib/$1"),
        "^graphql(/type)?$": "<rootDir>/src/shims/graphql.ts",
        "^graphql-scalars$": "<rootDir>/src/shims/graphql.ts",
        "^typeorm$": "<rootDir>/src/shims/empty.ts",
        ...Object.fromEntries(FROM_APP.map((name) => [`^${name}(/.*)?$`, `${app(name)}$1`])),
    },
    moduleDirectories: ["node_modules", path.resolve(__dirname, "node_modules")],
};
