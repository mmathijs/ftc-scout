import dotenv from "dotenv";
import path from "path";

// Load .env from the server package directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

console.log("Starting advancement comparison script...");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "NOT SET");
console.log("FTC_API_KEY:", process.env.FTC_API_KEY ? "SET" : "NOT SET");

import { DATA_SOURCE } from "../db/data-source";
import { initDynamicEntities } from "../db/entities/dyn/init";
import { Season } from "@ftc-scout/common";
import { getFromFtcApi } from "../ftc-api/get-from-ftc-api";
import { Event } from "../db/entities/Event";

// Types for FTC API advancement response
interface FtcApiAdvancementSlot {
    team: number | null;
    teamId: number | null;
    teamProfileId: number | null;
    teamInternalId: string | null;
    displayTeam: string | null;
    slot: number;
    criteria: string | null;
    declined: boolean;
    status: "NULL" | "FIRST" | "ALREADY_ADVANCING" | "ADVANCING_ABOVE" | "INELIGIBLE";
}

interface FtcApiAdvancementResponse {
    advancesTo: string | null;
    slots: number;
    fcmpReserved: number;
    advancement: FtcApiAdvancementSlot[] | null;
}

// Types for FTC API rankings response
interface FtcApiRanking {
    rank: number;
    team: number;
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

// Types for FTC API advancement points response (2025+)
interface FtcApiAdvancementPoints {
    team: number;
    points: number[] | null; // [qualPoints, alliancePoints, playoffPoints, awardPoints, totalPoints]
}

interface FtcApiAdvancementPointsResponse {
    points: FtcApiAdvancementPoints[] | null;
}

// Types for FTCScout GraphQL response
interface FtcScoutAdvancement {
    season: number;
    eventCode: string;
    teamNumber: number;
    qualPoints: number | null;
    isQualFinal: boolean;
    allianceSelectionPoints: number | null;
    isAllianceSelectionFinal: boolean;
    playoffPoints: number | null;
    awardPoints: number | null;
    totalPoints: number | null;
    rank: number | null;
    advanced: boolean;
    isAdvancementEligible: boolean;
}

interface ComparisonResult {
    eventCode: string;
    eventName: string;
    season: number;
    matches: boolean;
    differences: Difference[];
    hasData: boolean; // Whether the event has advancement data to compare
}

interface Difference {
    type: "MISSING_IN_FTC_API" | "MISSING_IN_FTCSCOUT" | "RANK_MISMATCH" | "POINTS_MISMATCH";
    teamNumber: number;
    ftcApiData?: any;
    ftcScoutData?: any;
    details: string;
}

async function getFtcApiAdvancement(
    season: Season,
    eventCode: string
): Promise<FtcApiAdvancementResponse | null> {
    console.log(`Fetching advancement from FTC API for ${season}/${eventCode}...`);
    const resp = await getFromFtcApi(`${season}/advancement/${eventCode}`, {
        excludeSkipped: false,
    });
    return resp;
}

async function getFtcApiRankings(
    season: Season,
    eventCode: string
): Promise<FtcApiRankingsResponse | null> {
    console.log(`Fetching rankings from FTC API for ${season}/${eventCode}...`);
    const resp = await getFromFtcApi(`${season}/rankings/${eventCode}`);
    return resp;
}

async function getFtcApiAdvancementPoints(
    season: Season,
    eventCode: string
): Promise<FtcApiAdvancementPointsResponse | null> {
    // This endpoint is only available for 2025+ seasons
    if (season < 2025) {
        return null;
    }
    console.log(`Fetching advancement points from FTC API for ${season}/${eventCode}...`);
    const resp = await getFromFtcApi(`${season}/advancement/${eventCode}/points`);
    return resp;
}

async function getFtcScoutAdvancement(
    season: Season,
    eventCode: string
): Promise<FtcScoutAdvancement[]> {
    console.log(`Fetching advancement from FTCScout GraphQL for ${season}/${eventCode}...`);

    const graphqlEndpoint = "https://ftcscout-api.mmathijs.nl/graphql";

    const query = `
        query GetAdvancement($season: Int!, $code: String!) {
            eventByCode(season: $season, code: $code) {
                code
                name
                advancement {
                    season
                    eventCode
                    teamNumber
                    qualPoints
                    isQualFinal
                    allianceSelectionPoints
                    isAllianceSelectionFinal
                    playoffPoints
                    awardPoints
                    totalPoints
                    rank
                    advanced
                    isAdvancementEligible
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
            variables: { season, code: eventCode },
        }),
    });

    if (!response.ok) {
        throw new Error(`GraphQL request failed: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data?.eventByCode?.advancement || [];
}

function compareAdvancement(
    season: Season,
    eventCode: string,
    eventName: string,
    ftcApiData: FtcApiAdvancementResponse | null,
    ftcApiRankings: FtcApiRankingsResponse | null,
    ftcApiAdvancementPoints: FtcApiAdvancementPointsResponse | null,
    ftcScoutData: FtcScoutAdvancement[]
): ComparisonResult {
    const differences: Difference[] = [];

    if (!ftcApiData || !ftcApiData.advancement) {
        console.log(`  ⚠️  No advancement data in FTC API for ${eventCode} - skipping`);
        return {
            eventCode,
            eventName,
            season,
            matches: true,
            differences: [],
            hasData: false,
        };
    }

    if (ftcScoutData.length === 0) {
        console.log(`  ⚠️  No advancement data in FTCScout for ${eventCode} - skipping`);
        return {
            eventCode,
            eventName,
            season,
            matches: true,
            differences: [],
            hasData: false,
        };
    }

    // Build maps for easier comparison
    const ftcApiTeams = new Map<number, FtcApiAdvancementSlot[]>();
    ftcApiData.advancement.forEach((slot) => {
        if (slot.team !== null) {
            if (!ftcApiTeams.has(slot.team)) {
                ftcApiTeams.set(slot.team, []);
            }
            ftcApiTeams.get(slot.team)!.push(slot);
        }
    });

    const ftcApiRankingsMap = new Map<number, FtcApiRanking>();
    if (ftcApiRankings?.rankings) {
        ftcApiRankings.rankings.forEach((ranking) => {
            ftcApiRankingsMap.set(ranking.team, ranking);
        });
    }

    const ftcApiPointsMap = new Map<number, FtcApiAdvancementPoints>();
    if (ftcApiAdvancementPoints?.points) {
        ftcApiAdvancementPoints.points.forEach((pts) => {
            ftcApiPointsMap.set(pts.team, pts);
        });
    }

    const ftcScoutTeams = new Map<number, FtcScoutAdvancement>();
    ftcScoutData.forEach((adv) => {
        ftcScoutTeams.set(adv.teamNumber, adv);
    });

    // Find teams only advancing in FTC API (status = "FIRST")
    const ftcApiAdvancingTeams = new Set<number>();
    ftcApiData.advancement.forEach((slot) => {
        if (slot.team !== null && slot.status === "FIRST") {
            ftcApiAdvancingTeams.add(slot.team);
        }
    });

    // NOTE: We only compare teams that are in the FTC API advancement data
    // The FTC API only includes teams that advance, while FTCScout includes all teams
    // So we ignore teams that are only in FTCScout

    // Find teams only in FTC API (these are real issues)
    ftcApiAdvancingTeams.forEach((teamNumber) => {
        if (!ftcScoutTeams.has(teamNumber)) {
            differences.push({
                type: "MISSING_IN_FTCSCOUT",
                teamNumber,
                ftcApiData: ftcApiTeams.get(teamNumber),
                details: `Team ${teamNumber} is advancing in FTC API but not found in FTCScout`,
            });
        }
    });

    // Compare ranks and points for teams that are advancing (in FTC API)
    // We only compare teams that the FTC API says are advancing
    ftcApiAdvancingTeams.forEach((teamNumber) => {
        const scoutAdv = ftcScoutTeams.get(teamNumber);
        if (!scoutAdv) return; // Already reported as MISSING_IN_FTCSCOUT

        const apiSlots = ftcApiTeams.get(teamNumber);
        if (!apiSlots) return;

        // Find the "FIRST" slot for this team in FTC API
        const firstSlot = apiSlots.find((s) => s.status === "FIRST");
        if (!firstSlot) return;

        // The FTC API slot number corresponds to the advancement rank
        const ftcApiRank = firstSlot.slot;
        const ftcScoutRank = scoutAdv.rank;

        if (ftcApiRank !== ftcScoutRank) {
            differences.push({
                type: "RANK_MISMATCH",
                teamNumber: scoutAdv.teamNumber,
                ftcApiData: { rank: ftcApiRank, slot: firstSlot },
                ftcScoutData: { rank: ftcScoutRank, advancement: scoutAdv },
                details: `Team ${scoutAdv.teamNumber}: FTC API rank ${ftcApiRank} vs FTCScout rank ${ftcScoutRank}`,
            });
        }

        // Compare points using advancement points data if available
        const ftcApiRanking = ftcApiRankingsMap.get(scoutAdv.teamNumber);
        const ftcApiPoints = ftcApiPointsMap.get(scoutAdv.teamNumber);
        const pointsDiff = comparePoints(scoutAdv, firstSlot, ftcApiRanking, ftcApiPoints);
        if (pointsDiff) {
            differences.push({
                type: "POINTS_MISMATCH",
                teamNumber: scoutAdv.teamNumber,
                ftcApiData: { slot: firstSlot, ranking: ftcApiRanking, points: ftcApiPoints },
                ftcScoutData: scoutAdv,
                details: pointsDiff,
            });
        }
    });

    return {
        eventCode,
        eventName,
        season,
        matches: differences.length === 0,
        differences,
        hasData: true,
    };
}

function comparePoints(
    scoutAdv: FtcScoutAdvancement,
    _apiSlot: FtcApiAdvancementSlot,
    ftcApiRanking?: FtcApiRanking,
    ftcApiPoints?: FtcApiAdvancementPoints
): string | null {
    const issues: string[] = [];

    // Check if points seem reasonable
    if (scoutAdv.totalPoints !== null && scoutAdv.totalPoints < 0) {
        issues.push(`Negative total points: ${scoutAdv.totalPoints}`);
    }

    if (scoutAdv.qualPoints !== null && scoutAdv.qualPoints < 0) {
        issues.push(`Negative qual points: ${scoutAdv.qualPoints}`);
    }

    // If we have FTC API advancement points data, compare all point types
    if (ftcApiPoints?.points && ftcApiPoints.points.length >= 5) {
        // Points array format: [qualPoints, alliancePoints, playoffPoints, awardPoints, totalPoints]
        const [apiQual, apiAlliance, apiPlayoff, apiAward, apiTotal] = ftcApiPoints.points;

        // Compare qual points
        if (scoutAdv.qualPoints !== null && apiQual !== null && apiQual !== scoutAdv.qualPoints) {
            issues.push(`Qual points: FTC API ${apiQual} vs FTCScout ${scoutAdv.qualPoints}`);
        }

        // Compare alliance selection points
        if (
            scoutAdv.allianceSelectionPoints !== null &&
            apiAlliance !== null &&
            apiAlliance !== scoutAdv.allianceSelectionPoints
        ) {
            issues.push(
                `Alliance points: FTC API ${apiAlliance} vs FTCScout ${scoutAdv.allianceSelectionPoints}`
            );
        }

        // Compare playoff points
        if (
            scoutAdv.playoffPoints !== null &&
            apiPlayoff !== null &&
            apiPlayoff !== scoutAdv.playoffPoints
        ) {
            issues.push(
                `Playoff points: FTC API ${apiPlayoff} vs FTCScout ${scoutAdv.playoffPoints}`
            );
        }

        // Compare award points
        if (
            scoutAdv.awardPoints !== null &&
            apiAward !== null &&
            apiAward !== scoutAdv.awardPoints
        ) {
            issues.push(`Award points: FTC API ${apiAward} vs FTCScout ${scoutAdv.awardPoints}`);
        }

        // Compare total points
        if (
            scoutAdv.totalPoints !== null &&
            apiTotal !== null &&
            apiTotal !== scoutAdv.totalPoints
        ) {
            issues.push(`Total points: FTC API ${apiTotal} vs FTCScout ${scoutAdv.totalPoints}`);
        }
    } else if (ftcApiRanking && scoutAdv.qualPoints !== null) {
        // Fallback to using ranking data for qual points comparison
        const apiQualPoints = ftcApiRanking.qualifyingPoints;
        if (apiQualPoints !== scoutAdv.qualPoints) {
            issues.push(`Qual points: FTC API ${apiQualPoints} vs FTCScout ${scoutAdv.qualPoints}`);
        }

        // Compare event ranking
        if (ftcApiRanking.rank !== scoutAdv.rank) {
            issues.push(`Event rank: FTC API ${ftcApiRanking.rank} vs FTCScout ${scoutAdv.rank}`);
        }
    }

    if (issues.length > 0) {
        return `Team ${scoutAdv.teamNumber}: ${issues.join(", ")}`;
    }

    return null;
}

async function main() {
    const args = process.argv.slice(2);

    let season: Season;
    let eventCode: string | null = null;

    if (args.length < 1) {
        console.error("Usage: ts-node compare-advancement-with-ftc-api.ts <season> [eventCode]");
        console.error("Example: ts-node compare-advancement-with-ftc-api.ts 2025");
        console.error("Example: ts-node compare-advancement-with-ftc-api.ts 2025 USMXHOU1");
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
                throw new Error(`Event ${eventCode} not found for season ${season}`);
            }
            events = [event];
        } else {
            // Get all events with advancement slots
            events = await Event.find({
                where: { season },
                order: { start: "DESC" },
            });
            // Filter to events with advancement slots
            events = events.filter((e) => (e.advancementSlots ?? 0) > 0);
        }

        console.log(`\nComparing advancement for ${events.length} events...\n`);

        const results: ComparisonResult[] = [];

        for (const event of events) {
            console.log(`\n${"=".repeat(80)}`);
            console.log(`Event: ${event.name} (${event.code})`);
            console.log(`${"=".repeat(80)}`);

            try {
                const ftcApiData = await getFtcApiAdvancement(season, event.code);
                const ftcApiRankings = await getFtcApiRankings(season, event.code);
                const ftcApiAdvancementPoints = await getFtcApiAdvancementPoints(
                    season,
                    event.code
                );
                const ftcScoutData = await getFtcScoutAdvancement(season, event.code);

                const result = compareAdvancement(
                    season,
                    event.code,
                    event.name,
                    ftcApiData,
                    ftcApiRankings,
                    ftcApiAdvancementPoints,
                    ftcScoutData
                );
                results.push(result);

                // Skip display for events without data
                if (!result.hasData) {
                    // Already logged above, just continue
                } else if (result.matches) {
                    console.log(`✅ Advancement data matches!`);
                } else {
                    console.log(`❌ Found ${result.differences.length} differences:`);
                    result.differences.forEach((diff, idx) => {
                        console.log(`\n  ${idx + 1}. ${diff.details}`);
                        if (diff.type === "RANK_MISMATCH" || diff.type === "POINTS_MISMATCH") {
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

        // Filter to only events with data
        const eventsWithData = results.filter((r) => r.hasData);
        const eventsWithoutData = results.filter((r) => !r.hasData);

        const matchingEvents = eventsWithData.filter((r) => r.matches).length;
        const totalEventsWithData = eventsWithData.length;
        const totalDifferences = eventsWithData.reduce((sum, r) => sum + r.differences.length, 0);

        // Calculate overall score
        const overallScore =
            totalEventsWithData > 0 ? ((matchingEvents / totalEventsWithData) * 100).toFixed(1) : 0;

        console.log(`Total events processed: ${results.length}`);
        console.log(`Events with advancement data: ${totalEventsWithData}`);
        console.log(`Events without data (skipped): ${eventsWithoutData.length}`);
        console.log();
        console.log(`Events with matching data: ${matchingEvents}`);
        console.log(`Events with differences: ${totalEventsWithData - matchingEvents}`);
        console.log(`Total differences found: ${totalDifferences}`);
        console.log();
        console.log(
            `🎯 OVERALL SCORE: ${overallScore}% (${matchingEvents}/${totalEventsWithData} events match)`
        );

        if (eventsWithoutData.length > 0) {
            console.log(`\n⚠️  Events skipped (no advancement data):`);
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
