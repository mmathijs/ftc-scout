import "dotenv/config";

import { DATA_SOURCE } from "./db/data-source";
import { initDynamicEntities } from "./db/entities/dyn/init";
import express, { text } from "express";
import cors from "cors";
import compression from "compression";
import { apiLoggerMiddleware } from "./db/entities/ApiReq";
import { SERVER_PORT, SYNC_API } from "./constants";
import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import { expressMiddleware } from "@apollo/server/express4";
import { GQL_SCHEMA } from "./graphql/schema";
import { fetchPriorSeasons, watchApi } from "./ftc-api/watch";
import { setupBannerRoutes } from "./banner";
import { handleAnalytics } from "./analytics";
import { setupRest } from "./rest/setupRest";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { ApolloServerPluginUsageReporting } from "@apollo/server/plugin/usageReporting";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { setupSiteMap } from "./sitemap/setupSitemap";
import { InMemoryLRUCache } from "@apollo/utils.keyvaluecache";
import {
    rebuildQuickStatsMaterializedViews,
    refreshQuickStatsMaterializedViews,
} from "./db/quickstats-materialized-view";
import { responseCachePlugin } from "./graphql/plugins/response-cache-plugin";

// Logs GraphQL request timing server-side for queries/mutations/subscriptions.
const graphqlTimingPlugin = {
    async requestDidStart(requestContext: { request: { operationName?: string | null } }) {
        const startedAt = Date.now();
        const operationName = requestContext.request.operationName ?? "anonymous";

        return {
            async didResolveOperation(ctx: { operation?: { operation?: string } }) {
                const operationType = ctx.operation?.operation ?? "unknown";
                console.info(`[GraphQL] start ${operationType} ${operationName}`);
            },
            async willSendResponse(ctx: { operation?: { operation?: string } }) {
                const operationType = ctx.operation?.operation ?? "unknown";
                const durationMs = Date.now() - startedAt;
                console.info(`[GraphQL] done ${operationType} ${operationName} in ${durationMs}ms`);
            },
            async didEncounterErrors(ctx: { operation?: { operation?: string } }) {
                const operationType = ctx.operation?.operation ?? "unknown";
                const durationMs = Date.now() - startedAt;
                console.warn(
                    `[GraphQL] error ${operationType} ${operationName} after ${durationMs}ms`
                );
            },
        };
    },
};

async function main() {
    await DATA_SOURCE.initialize();
    initDynamicEntities();
    await rebuildQuickStatsMaterializedViews();

    let app = express();

    app.use(
        // Allow requests from our webpage.
        cors({
            // origin: "*",
            origin: true,
            credentials: false,
        }),
        compression(),
        express.json()
    );

    let httpServer = createServer(app);
    let wsServer = new WebSocketServer({
        server: httpServer,
        path: "/graphql",
    });

    const serverCleanup = useServer({ schema: GQL_SCHEMA }, wsServer);

    // Create shared cache for both APQ and response caching
    const serverCache = new InMemoryLRUCache({
        maxSize: Math.pow(2, 20) * 100, // ~100MiB
        ttl: 120, // Default 2 minutes for APQ
    });

    let globalVersionBasedOnTime = new Date().getTime().toFixed();

    let apolloServer = new ApolloServer({
        introspection: true,
        schema: GQL_SCHEMA,
        cache: serverCache,
        plugins: [
            ApolloServerPluginUsageReporting({
                generateClientInfo({ request }) {
                    return {
                        clientName:
                            request.http?.headers.get("apollographql-client-name") ??
                            "MMathijs-FTCSCOUT-SERVER",
                        clientVersion:
                            request.http?.headers.get("apollographql-client-version") ??
                            globalVersionBasedOnTime,
                    };
                },
            }),
            ApolloServerPluginLandingPageLocalDefault({
                footer: false,
                embed: { runTelemetry: false, endpointIsEditable: false },
            }),
            ApolloServerPluginDrainHttpServer({ httpServer }),
            responseCachePlugin(serverCache),
            graphqlTimingPlugin,
            {
                async serverWillStart() {
                    return {
                        async drainServer() {
                            await serverCleanup.dispose();
                        },
                    };
                },
            },
        ],
    });

    await apolloServer.start();

    app.use("/graphql", apiLoggerMiddleware, expressMiddleware(apolloServer));

    app.post("/analytics", text(), handleAnalytics);

    setupRest(app);
    setupSiteMap(app);

    setupBannerRoutes(app);

    httpServer.listen(SERVER_PORT, () => {
        console.info(`Server started and listening on port ${SERVER_PORT}.`);
    });

    if (SYNC_API) {
        fetchPriorSeasons().then(async () => {
            await refreshQuickStatsMaterializedViews(true);
            await watchApi();
        });
    }
}

main();
