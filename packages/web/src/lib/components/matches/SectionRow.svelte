<script lang="ts">
    import { getContext } from "svelte";
    import { SHOW_EVENT_HAS_VIDEOS } from "./MatchTable.svelte";

    export let name: string;

    const hasEventVideosFn = getContext(SHOW_EVENT_HAS_VIDEOS) as () => boolean | undefined;
    $: eventHasVideos = !!(hasEventVideosFn ? hasEventVideosFn() : false);
</script>

<tr class:eventHasVideos>
    <td />
    <td class="red" />
    <td class="blue" />
    <td class="name"> <span>{name}</span> </td>
</tr>

<style>
    tr {
        display: grid;
        grid-template-columns: calc(2.4rem + 10.75em) 1fr 1fr;
        height: calc(var(--xl-gap) * 1.5);
    }

    tr.eventHasVideos {
        grid-template-columns: calc(2.4rem + 10.75em) 1fr 1fr;
    }

    @media (max-width: 1000px) {
        tr {
            grid-template-columns: 9.75em 1fr 1fr;
        }

        tr.eventHasVideos {
            grid-template-columns: calc(2.4rem + 9.75em) 1fr 1fr;
        }
    }

    td {
        display: block;
    }

    .red {
        background: var(--red-team-bg-color);
        grid-row: 1 / 1;
        grid-column: 2 / 3;
    }
    .blue {
        background: var(--blue-team-bg-color);
        grid-row: 1 / 1;
        grid-column: 3 / 4;
    }
    .name {
        display: flex;
        align-items: center;
        justify-content: center;

        grid-row: 1 / 1;
        grid-column: 2 / 4;
    }
    .name span {
        background: var(--fg-color);
        padding: var(--sm-pad);
        border-radius: 8px;
    }
</style>
