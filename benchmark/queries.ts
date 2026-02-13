export const BENCHMARK_QUERIES = {
    tepRecords: {
        name: "tepRecords",
        query: `
            query BenchmarkTepRecords($season: Int!, $skip: Int!, $take: Int!) {
                tepRecords(
                    season: $season
                    skip: $skip
                    take: $take
                    sortBy: "totalPointsNpOpr"
                    sortDir: Desc
                ) {
                    data {
                        data { teamNumber eventCode }
                        filterRank
                    }
                    count
                }
            }
        `,
        variables: { season: 2024, skip: 0, take: 50 },
    },

    eventByCode: {
        name: "eventByCode",
        query: `
            query BenchmarkEventByCode($season: Int!, $code: String!) {
                eventByCode(season: $season, code: $code) {
                    name
                    code
                    start
                    end
                }
            }
        `,
        variables: { season: 2024, code: "USCALA" },
    },

    homePage: {
        name: "homePage",
        query: `
            query BenchmarkHome($season: Int!) {
                activeTeamsCount(season: $season)
            }
        `,
        variables: { season: 2024 },
    },

    eventsSearch: {
        name: "eventsSearch",
        query: `
            query BenchmarkEventsSearch($season: Int!) {
                eventsSearch(season: $season, limit: 100) {
                    code
                    name
                }
            }
        `,
        variables: { season: 2024 },
    },
};
