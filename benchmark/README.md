# FTC Scout Performance Benchmarking

## Overview
This benchmarking suite measures database and GraphQL performance in a **hardware-agnostic** way using normalized scores.

## Prerequisites
1. PostgreSQL with `pg_stat_statements` extension enabled
2. Server running with `SYNC_API=0` to avoid interference

## Running a Benchmark

### 1. Enable pg_stat_statements
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

### 2. Run baseline benchmark
```bash
cd benchmark
npx ts-node load-test.ts
```

This will:
- Calibrate hardware performance
- Run 100 requests per query type
- Normalize results against hardware baseline
- Save results to `benchmark-results-TIMESTAMP.json`

### 3. Compare before/after
```bash
npx ts-node compare.ts benchmark-results-baseline.json benchmark-results-optimized.json
```

## Understanding Results

### Normalized Scores
All query times are normalized against a hardware calibration baseline. A score of:
- `10.0x` = query takes 10x longer than simplest possible query
- Lower scores are better
- Compare normalized scores across different hardware setups

### Metrics
- **P95/P99**: 95th/99th percentile response times
- **Cache Hit Rate**: PostgreSQL buffer cache efficiency (target: >99%)
- **Slow Queries**: Queries taking >500ms

## CI Integration
Run benchmarks automatically on PRs to detect performance regressions.
