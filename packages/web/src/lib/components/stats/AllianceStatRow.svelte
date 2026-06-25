<script lang="ts">
    import StatCell from "./StatCell.svelte";
    import type { StatColumn, StatData } from "@ftc-scout/common";
    type T = $$Generic;

    export let data: StatData<T>;
    export let stats: StatColumn<T>[];
    export let focusedTeam: number | null;
    export let rankStat: StatColumn<T> | null;

    $: d = data.data as any;
</script>

<tr>
    {#if rankStat}
        <StatCell {data} stat={rankStat} {focusedTeam} />
    {/if}

    {#each stats as stat}
        {#if stat.id === "alliance"}
            <td class="alliance-name" title="Alliance {d._allianceNumber}">
                {d._allianceName}
            </td>
        {:else}
            <StatCell {data} {stat} {focusedTeam} />
        {/if}
    {/each}
</tr>

<style>
    tr {
        --team-col-width: 14ch;
        outline: transparent 2px solid;
        outline-offset: -2px;
        transition: outline 0.12s ease 0s;
    }

    @supports selector(tr:has(td)) {
        tr:hover:not(:has(td.inner-hover:hover)) {
            outline: 2px solid var(--neutral-team-color);
            z-index: var(--focused-row-zi);
        }
    }

    @supports not selector(tr:has(td)) {
        tr:hover {
            outline: 2px solid var(--neutral-team-color);
            z-index: var(--focused-row-zi);
        }
    }

    .alliance-name {
        text-align: center;
        padding: var(--md-pad);
        font-weight: bold;
        white-space: nowrap;
    }
</style>
