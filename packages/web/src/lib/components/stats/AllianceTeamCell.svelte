<script lang="ts">
    import { browser } from "$app/environment";
    import { getContext } from "svelte";
    import { TEAM_CLICK_ACTION_CTX } from "../matches/MatchTeam.svelte";

    export let allianceNumber: number;
    export let teams: Array<{ number: number; name: string }>;
    export let focusedTeam: number | null;
    export let eventCode: string | null = null;

    let clickAction = getContext(TEAM_CLICK_ACTION_CTX) as
        | ((num: number, name: string, eventCode: string | null) => void)
        | undefined;
</script>

<td class="inner-hover">
    <div class="top">Alliance {allianceNumber}</div>
    <div class="bottom">
        {#each teams as team}
            <a
                href="/teams/{team.number}"
                class:focused={team.number === focusedTeam}
                role={browser && clickAction ? "button" : "link"}
                on:click={(e) => {
                    if (clickAction) {
                        e.preventDefault();
                        e.stopPropagation();
                        clickAction(team.number, team.name, eventCode);
                    }
                }}
            >
                <span>{team.number}</span>
                <em class="name">{team.name}</em>
            </a>
        {/each}
    </div>
</td>

<style>
    td {
        outline: transparent 2px solid;
        outline-offset: -2px;
        transition: outline 0.12s ease 0s;
        min-width: 200px;
    }

    td:hover {
        outline: 2px solid var(--neutral-team-color);
        z-index: var(--focused-row-zi);
    }

    .top {
        font-weight: bold;
        padding: var(--sm-pad);
        border-bottom: 1px solid var(--sep-color);
        text-align: center;
        white-space: nowrap;
    }

    .bottom {
        display: flex;
        flex-direction: row;
        gap: var(--sm-gap);
        padding: var(--sm-pad);
    }

    a {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        text-decoration: none;
        color: inherit;
        padding: var(--sm-pad);
    }

    a span,
    a em {
        display: block;
        min-width: 100%;
        width: 9ch;
        max-width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        padding-right: 1px;
    }

    @media (max-width: 600px) {
        td {
            min-width: 150px;
        }

        a span,
        a em {
            width: 7ch;
        }
    }

    a.focused {
        color: var(--team-text-color);
        background-color: var(--neutral-team-color);
    }
</style>
