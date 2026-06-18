import { DESCRIPTORS_LIST, Season } from "@ftc-scout/common";
import { DATA_SOURCE } from "./data-source";

function getQuickStatsMvName(season: Season) {
    return `quickstats_${season}`;
}

function getEgColumn(season: Season) {
    if (season == Season.IntoTheDeep) return "opr_dc_park_points";
    if (season == Season.Decode) return "opr_dc_base_points";
    return "opr_eg_points";
}

function getTotalColumn(season: Season) {
    let descriptor = DESCRIPTORS_LIST.find((d) => d.season == season);
    return descriptor?.pensSubtract ? "opr_total_points" : "opr_total_points_np";
}

export async function rebuildQuickStatsMaterializedViews() {
    for (let descriptor of DESCRIPTORS_LIST) {
        let season = descriptor.season;
        let viewName = getQuickStatsMvName(season);
        let totalColumn = getTotalColumn(season);
        let egColumn = getEgColumn(season);

        await DATA_SOURCE.query(`DROP MATERIALIZED VIEW IF EXISTS ${viewName}`);

        await DATA_SOURCE.query(`
            CREATE MATERIALIZED VIEW ${viewName} AS
            WITH maxes AS (
                SELECT
                    t.team_number,
                    max(tm.region_code) AS region_code,
                    max(t.${totalColumn}) AS tot,
                    max(t.opr_auto_points) AS auto,
                    max(t.opr_dc_points) AS dc,
                    max(t.${egColumn}) AS eg
                FROM tep_${season} t
                JOIN event e
                  ON e.season = t.season
                 AND e.code = t.event_code
                JOIN team tm
                  ON tm.number = t.team_number
                WHERE NOT t.is_remote
                  AND t.has_stats
                  AND NOT e.modified_rules
                GROUP BY t.team_number
            )
            SELECT
                team_number,
                region_code,
                tot,
                auto,
                dc,
                eg,
                rank() OVER (ORDER BY tot DESC) AS tot_rank,
                rank() OVER (ORDER BY auto DESC) AS auto_rank,
                rank() OVER (ORDER BY dc DESC) AS dc_rank,
                rank() OVER (ORDER BY eg DESC) AS eg_rank,
                count(*) OVER () AS team_count
            FROM maxes
        `);

        await DATA_SOURCE.query(
            `CREATE UNIQUE INDEX ${viewName}_team_number_uq ON ${viewName} (team_number)`
        );
        await DATA_SOURCE.query(
            `CREATE INDEX ${viewName}_region_code_idx ON ${viewName} (region_code)`
        );
        await DATA_SOURCE.query(`CREATE INDEX ${viewName}_tot_rank_idx ON ${viewName} (tot_rank)`);
        await DATA_SOURCE.query(
            `CREATE INDEX ${viewName}_auto_rank_idx ON ${viewName} (auto_rank)`
        );
        await DATA_SOURCE.query(`CREATE INDEX ${viewName}_dc_rank_idx ON ${viewName} (dc_rank)`);
        await DATA_SOURCE.query(`CREATE INDEX ${viewName}_eg_rank_idx ON ${viewName} (eg_rank)`);
    }
}

export async function refreshQuickStatsMaterializedViews(concurrent = true) {
    for (let descriptor of DESCRIPTORS_LIST) {
        await refreshQuickStatsMaterializedView(descriptor.season, concurrent);
    }
}

export async function refreshQuickStatsMaterializedView(season: Season, concurrent = true) {
    let viewName = getQuickStatsMvName(season);
    if (concurrent) {
        await DATA_SOURCE.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`);
    } else {
        await DATA_SOURCE.query(`REFRESH MATERIALIZED VIEW ${viewName}`);
    }
}

export function getQuickStatsViewName(season: Season) {
    return getQuickStatsMvName(season);
}
