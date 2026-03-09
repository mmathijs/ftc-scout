/**
 * compare-league-rankings.ts
 *
 * This script compares league rankings between the FTC API and FTCScout.
 *
 * For each league tournament event:
 * 1. Fetches qualification rankings from the FTC API (tournament rankings)
 * 2. Fetches league rankings from FTCScout (cumulative league standings)
 * 3. Filters FTCScout league rankings to only include teams that participated in the tournament
 * 4. Re-applies rankings to both datasets based on the filtered teams
 * 5. Compares the re-ranked data to identify differences
 *
 * Usage:
 *   npx ts-node src/scripts/compare-league-rankings.ts <season> [eventCode]
 *
 * Examples:
 *   npx ts-node src/scripts/compare-league-rankings.ts 2025
 *   npx ts-node src/scripts/compare-league-rankings.ts 2025 USNCLT1
 */

import dotenv from "dotenv";
import path from "path";

// Load .env from the server package directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

console.log("Starting league rankings comparison script...");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "NOT SET");
console.log("FTC_API_KEY:", process.env.FTC_API_KEY ? "SET" : "NOT SET");

import { DATA_SOURCE } from "../db/data-source";
import { initDynamicEntities } from "../db/entities/dyn/init";
import { EventType, Season } from "@ftc-scout/common";
import { getFromFtcApi } from "../ftc-api/get-from-ftc-api";
import { Event } from "../db/entities/Event";

// Types for FTC API rankings response
interface FtcApiRanking {
    rank: number;
    teamNumber: number;
    teamName: string | null;
    wins: number;
    losses: number;
    ties: number;
    qualifyingPoints: number;
    rankingPoints: number;
    tieBreaker1: number;
    tieBreaker2: number;
    highestQualScore: number;
    matchesPlayed: number;
    matchesCounted: number;
    dq: number;
    sortOrder1: number;
    sortOrder2: number;
    sortOrder3: number;
    sortOrder4: number;
    sortOrder5: number;
    sortOrder6: number;
}

interface FtcApiRankingsResponse {
    rankings: FtcApiRanking[] | null;
}

// Types for FTCScout GraphQL response for league rankings
interface FtcScoutLeagueRankingEntry {
    season: number;
    leagueCode: string;
    regionCode: string;
    teamNumber: number;
    avgRp: number | null;
    stats: {
        rank: number | null;
        rp: number;
        tb1: number;
        tb2: number;
        wins: number;
        losses: number;
        ties: number;
        dqs: number;
        qualMatchesPlayed: number;
    } | null;
}

interface ComparisonResult {
    eventCode: string;
    eventName: string;
    season: number;
    leagueCode: string | null;
    matches: boolean;
    differences: Difference[];
    hasData: boolean;
}

interface Difference {
    type:
        | "MISSING_IN_FTC_API"
        | "MISSING_IN_FTCSCOUT"
        | "RANK_MISMATCH"
        | "POINTS_MISMATCH"
        | "STATS_MISMATCH";
    teamNumber: number;
    ftcApiData?: any;
    ftcScoutData?: any;
    details: string;
}

async function getFtcApiRankings(
    season: Season,
    eventCode: string
): Promise<FtcApiRankingsResponse | null> {
    console.log(`  Fetching rankings from FTC API for ${season}/${eventCode}...`);
    return await getFromFtcApi(`${season}/rankings/${eventCode}`);
}

async function getFtcScoutLeagueRankings(
    season: Season,
    eventCode: string
): Promise<FtcScoutLeagueRankingEntry[]> {
    console.log(
        `  Fetching league rankings from FTCScout GraphQL for event ${season}/${eventCode}...`
    );

    const graphqlEndpoint = "https://ftcscout-api.mmathijs.nl/graphql";

    const query = `
query GetLeagueRankings($season: Int!, $code: String!) {
    eventByCode(season: $season, code: $code) {
        code
        name
        leagueRankings {
            league {
                code
                name
                regionCode
            }
            teams {
                season
                leagueCode
                regionCode
                teamNumber
                avgRp
                stats {
                  ... on TeamEventStats2025 {
                      rank
                      rp
                      tb1
                      tb2
                      wins
                      losses
                      ties
                      dqs
                      qualMatchesPlayed
                  }
                }
              }
          }
      }
  }

    `;

    const response = await fetch(graphqlEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            query,
            variables: { season: season, code: eventCode },
        }),
    });

    if (!response.ok) {
        throw new Error(`GraphQL request failed: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    // Extract teams from the leagueRankings array
    const leagueRankings = result.data?.eventByCode?.leagueRankings || [];
    if (leagueRankings.length === 0) {
        return [];
    }

    // Return the teams from the first league ranking (there should only be one)
    return leagueRankings[0]?.teams || [];
}

function reapplyRankings(
    rankings: FtcApiRanking[],
    teamsInTournament: Set<number>
): Map<number, { rank: number; originalRank: number; data: FtcApiRanking }> {
    // Filter to only teams in the tournament
    const filtered = rankings.filter((r) => teamsInTournament.has(r.teamNumber));

    // Sort by the FTC API sort orders to reapply rankings
    const sorted = [...filtered].sort((a, b) => {
        // Sort by sortOrder1, sortOrder2, etc. (descending, higher is better)
        if (a.sortOrder1 !== b.sortOrder1) return b.sortOrder1 - a.sortOrder1;
        if (a.sortOrder2 !== b.sortOrder2) return b.sortOrder2 - a.sortOrder2;
        if (a.sortOrder3 !== b.sortOrder3) return b.sortOrder3 - a.sortOrder3;
        if (a.sortOrder4 !== b.sortOrder4) return b.sortOrder4 - a.sortOrder4;
        if (a.sortOrder5 !== b.sortOrder5) return b.sortOrder5 - a.sortOrder5;
        if (a.sortOrder6 !== b.sortOrder6) return b.sortOrder6 - a.sortOrder6;
        return 0;
    });

    // Assign new ranks
    const result = new Map<number, { rank: number; originalRank: number; data: FtcApiRanking }>();
    sorted.forEach((ranking, index) => {
        result.set(ranking.teamNumber, {
            rank: index + 1,
            originalRank: ranking.rank,
            data: ranking,
        });
    });

    return result;
}

function compareLeagueRankings(
    season: Season,
    eventCode: string,
    eventName: string,
    leagueCode: string | null,
    ftcApiRankings: FtcApiRankingsResponse | null,
    ftcScoutLeagueRankings: FtcScoutLeagueRankingEntry[]
): ComparisonResult {
    const differences: Difference[] = [];

    if (!ftcApiRankings || !ftcApiRankings.rankings || ftcApiRankings.rankings.length === 0) {
        console.log(`  ⚠️  No rankings data in FTC API for ${eventCode} - skipping`);
        return {
            eventCode,
            eventName,
            season,
            leagueCode,
            matches: true,
            differences: [],
            hasData: false,
        };
    }

    if (ftcScoutLeagueRankings.length === 0) {
        console.log(`  ⚠️  No league rankings data in FTCScout for ${leagueCode} - skipping`);
        return {
            eventCode,
            eventName,
            season,
            leagueCode,
            matches: true,
            differences: [],
            hasData: false,
        };
    }

    // Get teams that participated in the tournament from FTC API
    const teamsInTournament = new Set(ftcApiRankings.rankings.map((r) => r.teamNumber));

    // Reapply rankings to filtered FTC API data
    const reappliedFtcApiRankings = reapplyRankings(ftcApiRankings.rankings, teamsInTournament);

    // Build maps for comparison
    const ftcScoutMap = new Map<number, FtcScoutLeagueRankingEntry>();
    ftcScoutLeagueRankings.forEach((entry) => {
        if (teamsInTournament.has(entry.teamNumber) && entry.stats) {
            ftcScoutMap.set(entry.teamNumber, entry);
        }
    });

    // Reapply rankings to FTCScout data based on filtered teams
    const ftcScoutFiltered = Array.from(ftcScoutMap.values())
        .filter((entry) => entry.stats !== null)
        .sort((a, b) => {
            // Sort by rp (descending), then tb1 (descending), then tb2 (descending)
            const statsA = a.stats!;
            const statsB = b.stats!;
            if (statsA.rp !== statsB.rp) return statsB.rp - statsA.rp;
            if (statsA.tb1 !== statsB.tb1) return statsB.tb1 - statsA.tb1;
            if (statsA.tb2 !== statsB.tb2) return statsB.tb2 - statsA.tb2;
            return 0;
        });

    const ftcScoutReranked = new Map<number, { rank: number; data: FtcScoutLeagueRankingEntry }>();
    ftcScoutFiltered.forEach((entry, index) => {
        ftcScoutReranked.set(entry.teamNumber, {
            rank: index + 1,
            data: entry,
        });
    });

    // Compare teams
    const allTeams = new Set([...reappliedFtcApiRankings.keys(), ...ftcScoutReranked.keys()]);

    allTeams.forEach((teamNumber) => {
        const ftcApiData = reappliedFtcApiRankings.get(teamNumber);
        const ftcScoutData = ftcScoutReranked.get(teamNumber);

        if (!ftcApiData && ftcScoutData) {
            differences.push({
                type: "MISSING_IN_FTC_API",
                teamNumber,
                ftcScoutData: ftcScoutData.data.stats,
                details: `Team ${teamNumber} in FTCScout league rankings but not in FTC API tournament rankings`,
            });
        } else if (ftcApiData && !ftcScoutData) {
            differences.push({
                type: "MISSING_IN_FTCSCOUT",
                teamNumber,
                ftcApiData: ftcApiData.data,
                details: `Team ${teamNumber} in FTC API tournament rankings but not in FTCScout league rankings`,
            });
        } else if (ftcApiData && ftcScoutData) {
            // Compare ranks
            if (ftcApiData.rank !== ftcScoutData.rank) {
                differences.push({
                    type: "RANK_MISMATCH",
                    teamNumber,
                    ftcApiData: { rank: ftcApiData.rank, data: ftcApiData.data },
                    ftcScoutData: { rank: ftcScoutData.rank, stats: ftcScoutData.data.stats },
                    details: `Team ${teamNumber}: FTC API rank ${ftcApiData.rank} vs FTCScout rank ${ftcScoutData.rank}`,
                });
            }

            // Compare stats (RP, TB1, TB2, W-L-T)
            const apiData = ftcApiData.data;
            const scoutStats = ftcScoutData.data.stats!;

            const statIssues: string[] = [];

            // Compare RP (ranking points)
            const roundToHundredths = (v: number) => Math.round(v * 100) / 100;
            const apiRp = apiData.sortOrder1 ?? 0;
            const scoutRp = scoutStats.rp ?? 0;
            if (roundToHundredths(apiRp) !== roundToHundredths(scoutRp)) {
                statIssues.push(
                    `RP: FTC ${roundToHundredths(apiRp).toFixed(2)} vs Scout ${roundToHundredths(
                        scoutRp
                    ).toFixed(2)}`
                );
            }

            // Compare TB1
            const apiTb1 = apiData.sortOrder2 ?? 0;
            const scoutTb1 = scoutStats.tb1 ?? 0;
            if (roundToHundredths(apiTb1) !== roundToHundredths(scoutTb1)) {
                statIssues.push(
                    `TB1: FTC ${roundToHundredths(apiTb1).toFixed(2)} vs Scout ${roundToHundredths(
                        scoutTb1
                    ).toFixed(2)}`
                );
            }

            // Compare TB2
            const apiTb2 = apiData.sortOrder3 ?? 0;
            const scoutTb2 = scoutStats.tb2 ?? 0;
            if (roundToHundredths(apiTb2) !== roundToHundredths(scoutTb2)) {
                statIssues.push(
                    `TB2: FTC ${roundToHundredths(apiTb2).toFixed(2)} vs Scout ${roundToHundredths(
                        scoutTb2
                    ).toFixed(2)}`
                );
            }

            /*            // Compare W-L-T
            if (apiData.wins !== scoutStats.wins) {
                statIssues.push(`Wins: FTC ${apiData.wins} vs Scout ${scoutStats.wins}`);
            }
            if (apiData.losses !== scoutStats.losses) {
                statIssues.push(`Losses: FTC ${apiData.losses} vs Scout ${scoutStats.losses}`);
            }
            if (apiData.ties !== scoutStats.ties) {
                statIssues.push(`Ties: FTC ${apiData.ties} vs Scout ${scoutStats.ties}`);
            }*/

            if (statIssues.length > 0) {
                differences.push({
                    type: "STATS_MISMATCH",
                    teamNumber,
                    ftcApiData: apiData,
                    ftcScoutData: scoutStats,
                    details: `Team ${teamNumber}: ${statIssues.join(", ")}`,
                });
            }
        }
    });

    return {
        eventCode,
        eventName,
        season,
        leagueCode,
        matches: differences.length === 0,
        differences,
        hasData: true,
    };
}

async function main() {
    const args = process.argv.slice(2);

    let season: Season;
    let eventCode: string | null = null;

    if (args.length < 1) {
        console.error("Usage: ts-node compare-league-rankings.ts <season> [eventCode]");
        console.error("Example: ts-node compare-league-rankings.ts 2025");
        console.error("Example: ts-node compare-league-rankings.ts 2025 USNCLT1");
        process.exit(1);
    }

    season = Number(args[0]) as Season;
    if (args.length >= 2) {
        eventCode = args[1];
    }

    if (!season || isNaN(season)) {
        console.error("Error: season must be a valid number");
        process.exit(1);
    }

    try {
        console.log(`Initializing database connection...`);
        await DATA_SOURCE.initialize();
        initDynamicEntities();

        let events: Event[];
        if (eventCode) {
            const event = await Event.findOneBy({ season, code: eventCode });
            if (!event) {
                console.error(`Error: Event ${eventCode} not found for season ${season}`);
                await DATA_SOURCE.destroy();
                process.exit(1);
            }
            if (event.type !== EventType.LeagueTournament) {
                console.error(`Error: Event ${eventCode} is not a League Tournament`);
                await DATA_SOURCE.destroy();
                process.exit(1);
            }
            events = [event];
        } else {
            // Get all league tournament events
            events = await Event.find({
                where: { season, type: EventType.LeagueTournament },
                order: { start: "DESC" },
            });
        }

        console.log(`\nComparing league rankings for ${events.length} league tournaments...\n`);

        const results: ComparisonResult[] = [];

        for (const event of events) {
            console.log(`\n${"=".repeat(80)}`);
            console.log(`Event: ${event.name} (${event.code})`);
            console.log(`League: ${event.leagueCode}`);
            console.log(`Region: ${event.regionCode}`);
            console.log(`${"=".repeat(80)}`);

            if (!event.leagueCode || !event.regionCode) {
                console.log(`  ⚠️  Missing league or region code - skipping`);
                continue;
            }

            try {
                // Get FTC API rankings for the tournament
                const ftcApiRankings = await getFtcApiRankings(season, event.code);

                // Get FTCScout league rankings (fetched via the event)
                const ftcScoutLeagueRankings = await getFtcScoutLeagueRankings(season, event.code);

                const result = compareLeagueRankings(
                    season,
                    event.code,
                    event.name,
                    event.leagueCode,
                    ftcApiRankings,
                    ftcScoutLeagueRankings
                );
                results.push(result);

                if (!result.hasData) {
                    // Already logged above, just continue
                } else if (result.matches) {
                    console.log(`✅ League rankings match!`);
                } else {
                    console.log(`❌ Found ${result.differences.length} differences:`);
                    result.differences.forEach((diff, idx) => {
                        console.log(`\n  ${idx + 1}. [${diff.type}] ${diff.details}`);
                        if (diff.type === "RANK_MISMATCH" || diff.type === "STATS_MISMATCH") {
                            console.log(`     FTC API:`, JSON.stringify(diff.ftcApiData, null, 2));
                            console.log(
                                `     FTCScout:`,
                                JSON.stringify(diff.ftcScoutData, null, 2)
                            );
                        }
                    });
                }

                // Add a small delay to avoid overwhelming the APIs
                await new Promise((resolve) => setTimeout(resolve, 250));
            } catch (error) {
                console.error(`❌ Error processing event ${event.code}:`, error);
            }
        }

        // Print summary
        console.log(`\n\n${"=".repeat(80)}`);
        console.log(`SUMMARY`);
        console.log(`${"=".repeat(80)}`);

        const eventsWithData = results.filter((r) => r.hasData);
        const eventsWithoutData = results.filter((r) => !r.hasData);

        const matchingEvents = eventsWithData.filter((r) => r.matches).length;
        const totalEventsWithData = eventsWithData.length;
        const totalDifferences = eventsWithData.reduce((sum, r) => sum + r.differences.length, 0);

        const overallScore =
            totalEventsWithData > 0
                ? ((matchingEvents / totalEventsWithData) * 100).toFixed(1)
                : "0";

        console.log(`Total events processed: ${results.length}`);
        console.log(`Events with data: ${totalEventsWithData}`);
        console.log(`Events without data (skipped): ${eventsWithoutData.length}`);
        console.log();
        console.log(`Events with matching rankings: ${matchingEvents}`);
        console.log(`Events with differences: ${totalEventsWithData - matchingEvents}`);
        console.log(`Total differences found: ${totalDifferences}`);
        console.log();
        console.log(
            `🎯 OVERALL SCORE: ${overallScore}% (${matchingEvents}/${totalEventsWithData} events match)`
        );

        if (eventsWithoutData.length > 0) {
            console.log(`\n⚠️  Events skipped (no data):`);
            eventsWithoutData.forEach((r) => {
                console.log(`  - ${r.eventName} (${r.eventCode})`);
            });
        }

        if (totalDifferences > 0) {
            console.log(`\n❌ Events with differences:`);
            eventsWithData
                .filter((r) => !r.matches)
                .forEach((r) => {
                    console.log(
                        `  - ${r.eventName} (${r.eventCode}): ${r.differences.length} difference(s)`
                    );

                    // Group differences by type
                    const byType = new Map<string, number>();
                    r.differences.forEach((d) => {
                        byType.set(d.type, (byType.get(d.type) || 0) + 1);
                    });
                    byType.forEach((count, type) => {
                        console.log(`    • ${type}: ${count}`);
                    });
                });
        }

        console.log(`\nComparison complete!`);

        await DATA_SOURCE.destroy();
        process.exit(0);
    } catch (error) {
        console.error("Fatal error:", error);
        await DATA_SOURCE.destroy();
        process.exit(1);
    }
}

main();
