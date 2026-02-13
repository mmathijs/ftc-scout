import type { ApolloServerPlugin } from "@apollo/server";
import type { GraphQLRequestContext } from "@apollo/server";

interface PerformanceMetric {
    operationName: string;
    duration: number;
    timestamp: number;
}

const metrics: PerformanceMetric[] = [];
const MAX_METRICS = 10000;

export const performancePlugin: ApolloServerPlugin = {
    async requestDidStart() {
        const startTime = Date.now();
        let operationName = "unknown";

        return {
            async didResolveOperation(requestContext: GraphQLRequestContext<any>) {
                operationName = requestContext.operationName || "anonymous";
            },

            async willSendResponse(_requestContext: GraphQLRequestContext<any>) {
                const duration = Date.now() - startTime;
                
                metrics.push({
                    operationName,
                    duration,
                    timestamp: Date.now(),
                });

                // Keep metrics bounded
                if (metrics.length > MAX_METRICS) {
                    metrics.splice(0, metrics.length - MAX_METRICS);
                }

                // Log slow queries
                if (duration > 1000) {
                    console.warn(`[SLOW QUERY] ${operationName} took ${duration}ms`);
                }
            },
        };
    },
};

export function getPerformanceMetrics() {
    const now = Date.now();
    const last5Min = metrics.filter(m => now - m.timestamp < 300000);

    const byOperation = last5Min.reduce((acc, m) => {
        if (!acc[m.operationName]) {
            acc[m.operationName] = { count: 0, totalTime: 0, maxTime: 0 };
        }
        acc[m.operationName].count++;
        acc[m.operationName].totalTime += m.duration;
        acc[m.operationName].maxTime = Math.max(acc[m.operationName].maxTime, m.duration);
        return acc;
    }, {} as Record<string, { count: number; totalTime: number; maxTime: number }>);

    return Object.entries(byOperation).map(([name, stats]) => ({
        operation: name,
        count: stats.count,
        avgTime: stats.totalTime / stats.count,
        maxTime: stats.maxTime,
        totalTime: stats.totalTime,
    }));
}

export function resetPerformanceMetrics() {
    metrics.length = 0;
}
