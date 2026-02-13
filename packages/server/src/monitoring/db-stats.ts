import { DATA_SOURCE } from "../db/data-source";

export interface DBStats {
    topQueries: QueryStats[];
    cacheHitRate: number;
    avgQueryTime: number;
    slowQueries: number;
    connections: number;
}

export interface QueryStats {
    query: string;
    calls: number;
    totalTime: number;
    avgTime: number;
    maxTime: number;
}

export async function getDBStats(): Promise<DBStats> {
    // Top 10 most expensive queries
    const topQueries = await DATA_SOURCE.query(`
        SELECT 
            LEFT(query, 100) as query,
            calls,
            total_exec_time as total_time,
            mean_exec_time as avg_time,
            max_exec_time as max_time
        FROM pg_stat_statements
        WHERE query NOT LIKE '%pg_stat_statements%'
        ORDER BY total_exec_time DESC
        LIMIT 10
    `);

    // Cache hit rate (should be > 99%)
    const cacheStats = await DATA_SOURCE.query(`
        SELECT 
            sum(heap_blks_read) as heap_read,
            sum(heap_blks_hit) as heap_hit,
            CASE 
                WHEN sum(heap_blks_hit) + sum(heap_blks_read) > 0 
                THEN sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) * 100 
                ELSE 0 
            END as cache_hit_rate
        FROM pg_statio_user_tables
    `);

    // Connection count
    const connStats = await DATA_SOURCE.query(`
        SELECT count(*) as connections
        FROM pg_stat_activity
        WHERE datname = current_database()
    `);

    // Count slow queries (> 500ms)
    const slowQueries = await DATA_SOURCE.query(`
        SELECT count(*) as slow_count
        FROM pg_stat_statements
        WHERE mean_exec_time > 500
    `);

    return {
        topQueries: topQueries.map((r: any) => ({
            query: r.query,
            calls: parseInt(r.calls),
            totalTime: parseFloat(r.total_time),
            avgTime: parseFloat(r.avg_time),
            maxTime: parseFloat(r.max_time),
        })),
        cacheHitRate: parseFloat(cacheStats[0]?.cache_hit_rate) || 0,
        avgQueryTime: topQueries.length > 0 
            ? topQueries.reduce((sum: number, q: any) => sum + parseFloat(q.avg_time), 0) / topQueries.length 
            : 0,
        slowQueries: parseInt(slowQueries[0]?.slow_count || "0"),
        connections: parseInt(connStats[0]?.connections || "0"),
    };
}

export async function resetDBStats() {
    await DATA_SOURCE.query(`SELECT pg_stat_statements_reset()`);
}
