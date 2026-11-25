const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const common = path.resolve(__dirname, "../common/src");
const web = path.resolve(__dirname, "../web/src/lib");
const webStatic = path.resolve(__dirname, "../web/static");
const config = getDefaultConfig(__dirname);

// Shared sources resolve imports from this package's node_modules, so no root install is needed.
config.watchFolders = [
    common,
    path.join(web, "util"),
    path.join(web, "printers"),
    path.join(webStatic, "img"),
];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

// Stand-ins for what the common package imports to build the servers' GraphQL types.
const SHIMS = {
    graphql: path.resolve(__dirname, "src/shims/graphql.ts"),
    "graphql/type": path.resolve(__dirname, "src/shims/graphql.ts"),
    "graphql-scalars": path.resolve(__dirname, "src/shims/graphql.ts"),
    typeorm: path.resolve(__dirname, "src/shims/empty.ts"),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName == "@ftc-scout/common") {
        return { type: "sourceFile", filePath: path.join(common, "index.ts") };
    }
    if (moduleName.startsWith("@web-static/")) {
        return context.resolveRequest(
            context,
            path.join(webStatic, moduleName.slice(12)),
            platform
        );
    }
    if (moduleName.startsWith("@web/")) {
        return context.resolveRequest(context, path.join(web, moduleName.slice(5)), platform);
    }
    if (SHIMS[moduleName] && context.originModulePath.startsWith(common)) {
        return { type: "sourceFile", filePath: SHIMS[moduleName] };
    }
    // Otherwise the walk up from ../common finds the root install first, with other versions.
    if (
        !/^[./]/.test(moduleName) &&
        !path.isAbsolute(moduleName) &&
        !context.originModulePath.startsWith(__dirname + path.sep)
    ) {
        return context.resolveRequest(
            { ...context, originModulePath: path.join(__dirname, "package.json") },
            moduleName,
            platform
        );
    }
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
