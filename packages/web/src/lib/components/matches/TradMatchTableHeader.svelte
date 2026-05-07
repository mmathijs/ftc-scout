<script lang="ts">
    import { getContext } from "svelte";
    import { SHOW_EVENT_HAS_VIDEOS } from "./MatchTable.svelte";
    import { faCirclePlay } from "@fortawesome/free-solid-svg-icons";
    import Fa from "svelte-fa";

    const hasEventVideosFn = getContext(SHOW_EVENT_HAS_VIDEOS) as () => boolean | undefined;
    $: eventHasVideos = !!(hasEventVideosFn ? hasEventVideosFn() : false);
</script>

<thead>
    <tr class:hasVideo={eventHasVideos}>
        {#if eventHasVideos}
            <th class="video-col">
                <button
                    class="play-button"
                    aria-label="Show match videos"
                    title="Show match videos"
                >
                    <Fa icon={faCirclePlay} />
                </button>
            </th>
        {/if}
        <th class="s">
            <div>Match</div>
            <div>Score</div>
        </th>
        <th class="r">Red Alliance</th>
        <th class="b">Blue Alliance</th>
    </tr>
</thead>

<style>
    thead {
        display: block;
    }

    tr {
        display: grid;
        grid-template-columns: 10.75em 1fr 1fr;
    }

    tr.hasVideo {
        grid-template-columns: 2.4rem 10.75em 1fr 1fr;
        box-shadow: rgb(0 0 0 / 14%) 0 -4px 4px -2px inset;
    }

    th {
        display: block;
        font-weight: bold;
        text-align: center;
        padding: var(--lg-pad);
    }

    .s {
        display: grid;
        grid-template-columns: 1fr 1.4fr;
        justify-content: center;
        padding: 0;
    }

    tr:not(.hasVideo) .s {
        box-shadow: rgb(0 0 0 / 14%) 0 -4px 4px -2px inset;
    }

    .s * {
        padding: var(--lg-pad);
    }

    .r {
        background-color: var(--red-team-color);
        color: var(--team-text-color);
    }

    .b {
        background-color: var(--blue-team-color);
        color: var(--team-text-color);

        border-top-right-radius: 7px;
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
        height: 0;
        border-radius: 6px;
        font-size: 1.5rem;
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

    @media (max-width: 1000px) {
        tr {
            grid-template-columns: 9.75em 1fr 1fr;
        }

        tr.hasVideo {
            grid-template-columns: 1.8rem 9.75em 1fr 1fr;
        }

        .play-button {
            font-size: 1.25rem;
        }
    }
</style>
