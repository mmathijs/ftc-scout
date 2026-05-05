<script lang="ts">
    import {
        Alliance,
        type FullMatchFragment,
        TournamentLevel,
    } from "../../graphql/generated/graphql-operations";
    import { sortTeams } from "../../util/sorters";
    import DeLives from "./DELives.svelte";
    import MatchScore, { computeWinner } from "./MatchScore.svelte";
    import MatchTeam from "./MatchTeam.svelte";
    import PlaceholderMatchTeam from "./PlaceholderMatchTeam.svelte";
    import { getContext } from "svelte";
    import Fa from "svelte-fa";
    import { faCirclePlay } from "@fortawesome/free-solid-svg-icons";
    import {
        SHOW_MATCH_VIDEO,
        type ShowMatchVideoFn,
        SHOW_EVENT_HAS_VIDEOS,
    } from "./MatchTable.svelte";

    export let match: FullMatchFragment;
    export let eventCode: string;
    export let season: number;
    export let timeZone: string;
    export let focusedTeam: number | null;
    export let zebraStripe: boolean;
    export let teamCount = 0;
    export let showNonPenaltyScores = false;

    $: teams = match.teams;
    $: redTeams = teams.filter((t) => t.alliance == Alliance.Red);
    $: blueTeams = teams.filter((t) => t.alliance == Alliance.Blue);

    $: redExtras = Array(Math.max(2 - redTeams.length, 0)).fill(Alliance.Red);
    $: reds = [...redTeams, ...redExtras].sort(sortTeams);
    $: blueExtras = Array(Math.max(2 - blueTeams.length, 0)).fill(Alliance.Blue);
    $: blues = [...blueTeams, ...blueExtras].sort(sortTeams);

    $: isDoubleElim = match.tournamentLevel == TournamentLevel.DoubleElim;
    $: isRoundRobin = match.tournamentLevel == TournamentLevel.RoundRobin;
    $: isNewRound =
        (isDoubleElim && checkIsNewRoundDoubleElim(match.series, match.matchNum, teamCount)) ||
        (isRoundRobin && checkIsNewRoundRobin(match.series, teamCount));

    $: winner = computeWinner(match.scores);

    let showVideo: ShowMatchVideoFn = getContext(SHOW_MATCH_VIDEO);
    const hasEventVideosFn = getContext(SHOW_EVENT_HAS_VIDEOS) as () => boolean | undefined;
    $: eventHasVideos = !!(hasEventVideosFn ? hasEventVideosFn() : false);
    $: matchHasVideo = ((match as any).videos ?? []).length > 0;

    function hasAlreadyLost(series: number, teamCount: number, alliance: Alliance): boolean {
        if (teamCount <= 10) {
            return false;
        } else if (teamCount <= 20) {
            return (
                series == 3 ||
                series == 5 ||
                (series == 6 && alliance == Alliance.Blue) ||
                series == 7
            );
        } else if (teamCount <= 40) {
            return (
                series == 5 ||
                series == 6 ||
                series == 8 ||
                series == 9 ||
                (series == 10 && alliance == Alliance.Blue) ||
                series == 11
            );
        } else {
            return (
                series == 5 ||
                series == 6 ||
                series == 9 ||
                series == 10 ||
                series == 12 ||
                series == 13 ||
                (series == 14 && alliance == Alliance.Blue) ||
                series == 15
            );
        }
    }

    function checkIsNewRoundDoubleElim(
        series: number,
        matchNum: number,
        teamCount: number
    ): boolean {
        if (matchNum != 1) {
            return false;
        }

        if (teamCount <= 10) {
            return false;
        } else if (teamCount <= 20) {
            return series == 3 || series == 5 || series == 6;
        } else if (teamCount <= 40) {
            return series == 3 || series == 5 || series == 7 || series == 9 || series == 10;
        } else {
            return series == 5 || series == 9 || series == 11 || series == 13 || series == 14;
        }
    }

    function checkIsNewRoundRobin(series: number, allianceCount: number): boolean {
        return (series - 1) % (allianceCount / 2) == 0;
    }
</script>

<tr
    class:zebraStripe
    class:isDoubleElim
    class:new-round={isNewRound}
    class:hasVideo={eventHasVideos}
>
    {#if eventHasVideos}
        <td class="video-col">
            {#if matchHasVideo}
                <button
                    class="play-button"
                    on:click|stopPropagation={() => showVideo(match)}
                    aria-label="Show match videos"
                    title="Show match videos"
                >
                    <Fa icon={faCirclePlay} />
                </button>
            {:else}
                <span class="video-placeholder" aria-hidden="true" />
            {/if}
        </td>
    {/if}
    <MatchScore {match} {timeZone} {showNonPenaltyScores} />

    {#if isDoubleElim}
        <DeLives
            alliance={Alliance.Red}
            alreadyLost={hasAlreadyLost(match.series, teamCount, Alliance.Red)}
            lostThis={winner == Alliance.Blue}
        />
    {/if}

    {#each reds as team}
        {#if team == Alliance.Red}
            <PlaceholderMatchTeam alliance={team} span={6 / reds.length} />
        {:else}
            <MatchTeam
                {team}
                {eventCode}
                {season}
                {focusedTeam}
                winner={winner == Alliance.Red}
                span={6 / reds.length}
            />
        {/if}
    {/each}

    {#if isDoubleElim}
        <DeLives
            alliance={Alliance.Blue}
            alreadyLost={hasAlreadyLost(match.series, teamCount, Alliance.Blue)}
            lostThis={winner == Alliance.Red}
        />
    {/if}

    {#each blues as team}
        {#if team == Alliance.Blue}
            <PlaceholderMatchTeam alliance={team} span={6 / blues.length} />
        {:else}
            <MatchTeam
                {team}
                {eventCode}
                {season}
                {focusedTeam}
                winner={winner == Alliance.Blue}
                span={6 / blues.length}
            />
        {/if}
    {/each}
</tr>

<style>
    tr {
        display: grid;
        grid-template-columns: 10.75em repeat(12, 1fr);

        min-height: 28px;
    }

    tr.isDoubleElim {
        grid-template-columns: 10.75em auto repeat(6, 1fr) auto repeat(6, 1fr);
    }

    /* When the event has videos we add a small first column for the play button */
    tr.hasVideo {
        grid-template-columns: 2.4rem 10.75em repeat(12, 1fr);
    }

    tr.hasVideo.isDoubleElim {
        grid-template-columns: 2.4rem 10.75em auto repeat(6, 1fr) auto repeat(6, 1fr);
    }

    tr.new-round {
        border-top: 1px solid var(--sep-color);
    }

    @media (max-width: 1000px) {
        tr {
            grid-template-columns: 9.75em repeat(12, 1fr);
        }

        tr.isDoubleElim {
            grid-template-columns: 9.75em auto repeat(6, 1fr) auto repeat(6, 1fr);
        }

        /* When the event has videos we add a small first column for the play button */
        tr.hasVideo {
            grid-template-columns: 2.4rem 9.75em repeat(12, 1fr);
        }

        tr.hasVideo.isDoubleElim {
            grid-template-columns: 2.4rem 9.75em auto repeat(6, 1fr) auto repeat(6, 1fr);
        }
    }

    .zebraStripe {
        background: var(--zebra-stripe-color);
    }

    .video-col {
        display: flex;
        align-items: center;
        justify-content: center;
        padding-left: var(--sm-gap);
        padding-right: var(--sm-gap);
    }

    .play-button {
        background: transparent;
        border: none;
        padding: 0.08rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--purple-stat-color);
        cursor: pointer;
        line-height: 0;
        width: 1.6rem;
        height: 1.6rem;
        border-radius: 6px;
    }

    .play-button:focus {
        outline: 2px solid var(--purple-stat-color);
        border-radius: 6px;
    }

    .play-button :global(svg) {
        width: 1.4em;
        height: 1.4em;
        display: block;
    }

    .video-placeholder {
        display: inline-block;
        width: 1.6rem;
        height: 1.6rem;
    }
</style>
