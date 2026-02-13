import express from "express";
import { getDBStats, resetDBStats } from "./db-stats";
import { getPerformanceMetrics, resetPerformanceMetrics } from "../graphql/plugins/performance-plugin";

export function setupMonitoringDashboard(app: express.Application) {
    // Get all metrics
    app.get("/monitoring/stats", async (_req, res) => {
        const [db, graphql] = await Promise.all([
            getDBStats(),
            Promise.resolve(getPerformanceMetrics()),
        ]);

        res.json({
            timestamp: new Date().toISOString(),
            database: db,
            graphql: graphql.slice(0, 20),
        });
    });

    // Reset all metrics
    app.post("/monitoring/reset", async (_req, res) => {
        await Promise.all([
            resetDBStats(),
            Promise.resolve(resetPerformanceMetrics()),
        ]);
        res.json({ success: true, message: "All metrics reset" });
    });

    // System metrics
    app.get("/monitoring/system", (_req, res) => {
        const used = process.memoryUsage();
        res.json({
            memory: {
                heapUsed: Math.round(used.heapUsed / 1024 / 1024),
                heapTotal: Math.round(used.heapTotal / 1024 / 1024),
                rss: Math.round(used.rss / 1024 / 1024),
            },
            uptime: process.uptime(),
            cpu: process.cpuUsage(),
        });
    });
}
