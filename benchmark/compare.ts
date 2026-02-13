import * as fs from "fs";

function compareResults(baselineFile: string, optimizedFile: string) {
    const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
    const optimized = JSON.parse(fs.readFileSync(optimizedFile, "utf8"));

    console.log("\n🔄 PERFORMANCE COMPARISON (Hardware-Normalized)");
    console.log("=".repeat(75));
    console.log(`${"Query".padEnd(25)} | ${"Baseline".padEnd(15)} | ${"Optimized".padEnd(15)} | ${"Improvement"}`);
    console.log("=".repeat(75));

    baseline.results.forEach((base: any) => {
        const opt = optimized.results.find((r: any) => r.queryName === base.queryName);
        if (!opt) return;

        // Compare normalized scores (hardware-agnostic)
        const improvement = ((base.normalizedScore - opt.normalizedScore) / base.normalizedScore * 100).toFixed(1);
        const sign = +improvement > 0 ? "↓" : "↑";
        
        console.log(
            `${base.queryName.padEnd(25)} | ` +
            `${base.normalizedScore.toFixed(2)}x`.padEnd(15) + " | " +
            `${opt.normalizedScore.toFixed(2)}x`.padEnd(15) + " | " +
            `${sign} ${Math.abs(+improvement)}%`
        );
    });

    console.log("\n📊 DATABASE IMPACT");
    console.log("=".repeat(75));
    console.log(`Cache Hit Rate: ${baseline.metrics.stats.database.cacheHitRate.toFixed(2)}% → ${optimized.metrics.stats.database.cacheHitRate.toFixed(2)}%`);
    console.log(`Slow Queries: ${baseline.metrics.stats.database.slowQueries} → ${optimized.metrics.stats.database.slowQueries}`);
}

const [baseline, optimized] = process.argv.slice(2);
if (!baseline || !optimized) {
    console.error("Usage: npx ts-node benchmark/compare.ts <baseline.json> <optimized.json>");
    process.exit(1);
}
compareResults(baseline, optimized);
