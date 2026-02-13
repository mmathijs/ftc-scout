import fetch from "node-fetch";
import * as fs from "fs/promises";
import { BENCHMARK_QUERIES } from "./queries";

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || "http://localhost:4000/graphql";
const MONITORING_ENDPOINT = process.env.MONITORING_ENDPOINT || "http://localhost:4000/monitoring";

interface BenchmarkResult {
    queryName: string;
    totalRequests: number;
    successCount: number;
    errorCount: number;
    avgResponseTime: number;
    p50: number;
    p95: number;
    p99: number;
    minTime: number;
    maxTime: number;
    normalizedScore: number; // Hardware-agnostic score (lower is better)
}

async function runQuery(query: string, variables: any): Promise<number> {
    const start = Date.now();
    try {
        const response = await fetch(GRAPHQL_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables }),
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await response.json();
        return Date.now() - start;
    } catch (error) {
        console.error("Query failed:", error);
        return -1;
    }
}

// Calibration: Run a simple query to establish baseline hardware performance
async function calibrateHardware(): Promise<number> {
    console.log("🔧 Calibrating hardware baseline...");
    const simpleQuery = `{ __typename }`;
    const times: number[] = [];
    
    for (let i = 0; i < 20; i++) {
        const time = await runQuery(simpleQuery, {});
        if (time > 0) times.push(time);
    }
    
    const baseline = times.reduce((sum, t) => sum + t, 0) / times.length;
    console.log(`✅ Hardware baseline: ${baseline.toFixed(2)}ms\n`);
    return baseline;
}

async function benchmarkQuery(
    name: string,
    query: string,
    variables: any,
    iterations: number,
    concurrency: number,
    hardwareBaseline: number
): Promise<BenchmarkResult> {
    console.log(`📊 Benchmarking ${name} (${iterations} requests, concurrency ${concurrency})...`);
    
    const times: number[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < iterations; i += concurrency) {
        const batch = Math.min(concurrency, iterations - i);
        const promises = Array.from({ length: batch }, () => runQuery(query, variables));
        const results = await Promise.all(promises);
        
        results.forEach(time => {
            if (time > 0) {
                times.push(time);
                successCount++;
            } else {
                errorCount++;
            }
        });

        if ((i + batch) % 50 === 0) {
            console.log(`  Progress: ${i + batch}/${iterations}`);
        }
    }

    times.sort((a, b) => a - b);
    const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
    
    // Normalized score: query time relative to hardware baseline
    const normalizedScore = avgTime / hardwareBaseline;

    return {
        queryName: name,
        totalRequests: iterations,
        successCount,
        errorCount,
        avgResponseTime: avgTime,
        p50: times[Math.floor(times.length * 0.5)],
        p95: times[Math.floor(times.length * 0.95)],
        p99: times[Math.floor(times.length * 0.99)],
        minTime: times[0],
        maxTime: times[times.length - 1],
        normalizedScore,
    };
}

async function getSystemMetrics() {
    const [stats, system] = await Promise.all([
        fetch(`${MONITORING_ENDPOINT}/stats`).then(r => r.json()),
        fetch(`${MONITORING_ENDPOINT}/system`).then(r => r.json()),
    ]);
    return { stats, system };
}

async function resetMetrics() {
    await fetch(`${MONITORING_ENDPOINT}/reset`, { method: "POST" });
}

async function runBenchmarkSuite() {
    console.log("🚀 FTC Scout Performance Benchmark");
    console.log("=".repeat(60));

    // Hardware calibration for normalization
    const hardwareBaseline = await calibrateHardware();

    await resetMetrics();
    console.log("✅ Metrics reset\n");

    const results: BenchmarkResult[] = [];

    for (const [key, queryDef] of Object.entries(BENCHMARK_QUERIES)) {
        const result = await benchmarkQuery(
            queryDef.name,
            queryDef.query,
            queryDef.variables,
            100,
            10,
            hardwareBaseline
        );
        results.push(result);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const metrics = await getSystemMetrics();

    console.log("\n" + "=".repeat(60));
    console.log("📈 BENCHMARK RESULTS");
    console.log("=".repeat(60));

    results.forEach(r => {
        console.log(`\n${r.queryName}:`);
        console.log(`  Total: ${r.totalRequests} | Success: ${r.successCount} | Errors: ${r.errorCount}`);
        console.log(`  Avg: ${r.avgResponseTime.toFixed(2)}ms | P95: ${r.p95.toFixed(2)}ms | P99: ${r.p99.toFixed(2)}ms`);
        console.log(`  Normalized Score: ${r.normalizedScore.toFixed(2)}x baseline`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("💾 DATABASE STATS");
    console.log("=".repeat(60));
    console.log(`  Cache Hit Rate: ${metrics.stats.database.cacheHitRate.toFixed(2)}%`);
    console.log(`  Avg Query Time: ${metrics.stats.database.avgQueryTime.toFixed(2)}ms`);
    console.log(`  Slow Queries: ${metrics.stats.database.slowQueries}`);
    console.log(`  Active Connections: ${metrics.stats.database.connections}`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `benchmark-results-${timestamp}.json`;
    await fs.writeFile(
        filename,
        JSON.stringify({ 
            hardwareBaseline,
            results, 
            metrics, 
            timestamp: new Date().toISOString() 
        }, null, 2)
    );
    console.log(`\n💾 Results saved to ${filename}`);
}

if (require.main === module) {
    runBenchmarkSuite().catch(console.error);
}
