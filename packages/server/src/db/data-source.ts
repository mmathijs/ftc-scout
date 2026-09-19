import { DataSource } from "typeorm";
import { DATABASE_URL, LOGGING, SYNC_DB } from "../constants";
import { ENTITIES } from "./entities";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";

export const DATA_SOURCE = new DataSource({
    type: "postgres",
    url: DATABASE_URL ?? "",
    synchronize: SYNC_DB,
    logging: LOGGING,
    entities: ENTITIES,
    namingStrategy: new SnakeNamingStrategy(),
    // pg's default pool max is 10 - too easy to exhaust when a background job (e.g. the EPA
    // full replay) holds a connection for tens of seconds at once, queuing real request traffic
    // behind it.
    extra: { max: 20 },
    // extra: {
    //     connectionTimeoutMillis: DB_TIMEOUT,
    //     query_timeout: DB_TIMEOUT,
    //     statement_timeout: DB_TIMEOUT,
    // },
});
