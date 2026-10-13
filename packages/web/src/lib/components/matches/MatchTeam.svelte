<script lang="ts" context="module">
    export const TEAM_CLICK_ACTION_CTX = {};
    export const SHOW_REMOTE_FOCUS_CTX = {};
</script>

<script lang="ts">
    import { CURRENT_SEASON } from "@ftc-scout/common";
    import { Alliance, type FullMatchFragment } from "../../graphql/generated/graphql-operations";
    import { getContext } from "svelte";
    import { browser } from "$app/environment";

    export let team: FullMatchFragment["teams"][number];
    export let eventCode: string;
    export let season: number;
    export let focusedTeam: number | null;
    export let winner: boolean;
    export let span: number;

    $: number = team.team.number;
    $: name = team.team.name;
    $: avatar = team.team.avatar ?? null;

    $: surrogate = team.surrogate;
    $: dq = team.dq;
    $: noShow = team.noShow;
    $: onField = team.onField;

    $: showRemoteFocus = getContext<boolean>(SHOW_REMOTE_FOCUS_CTX) ?? true;

    $: title =
        `${number} ${name}` +
        (noShow ? " (No Show)" : "") +
        (dq && !noShow ? " (Disqualified)" : "") +
        (!onField && !dq && !noShow ? " (Not on Field)" : "") +
        (surrogate ? " (Surrogate)" : "");

    let clickAction = getContext(TEAM_CLICK_ACTION_CTX) as
        | ((num: number, name: string) => void)
        | undefined;
</script>

<td
    style:--span={span}
    class:red={team.alliance == Alliance.Red}
    class:blue={team.alliance == Alliance.Blue}
    class:solo={team.alliance == Alliance.Solo}
    class:not-on-field={!onField}
    class:focused={focusedTeam == number && (showRemoteFocus || team.alliance != Alliance.Solo)}
    class:winner
>
    <a
        class="inner"
        href="/teams/{number}{season == CURRENT_SEASON ? '' : `?season=${season}`}#{eventCode}"
        role={browser && clickAction ? "button" : "link"}
        on:click={(e) => {
            if (clickAction) {
                e.preventDefault();
                clickAction(number, name);
            }
        }}
    >
        <div class="text">
            <span class="number">
                <span class:dq={dq || noShow}>{number}{surrogate ? "*" : ""}</span>
                {#if avatar}
                    <img src={avatar} alt="" class="avatar" width="20" height="20" loading="lazy" />
                {/if}
            </span>
            <em class="name">{name}</em>
        </div>
    </a>
</td>

<style>
    td {
        grid-column: span var(--span);
        display: block;
        container-type: inline-size;

        height: 100%;

        outline: transparent solid 2px;
        transition: outline 0.12s ease 0s;
    }

    .inner {
        position: relative;

        display: flex;
        flex-direction: row;
        align-items: flex-start;
        gap: var(--sm-gap);

        padding: var(--sm-pad) var(--sm-pad) var(--sm-pad) var(--md-pad);

        cursor: pointer;

        color: inherit;
        text-decoration: none;

        height: 100%;
    }

    .text {
        display: flex;
        flex-direction: column;
        justify-content: center;

        min-width: 0;
        flex: 1 1 auto;
        overflow: hidden;
    }

    .number {
        display: flex;
        align-items: center;
        gap: var(--sm-gap);
    }

    .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .avatar {
        display: block;
        width: 20px;
        height: 20px;
        object-fit: contain;
        border-radius: 2px;
        flex-shrink: 0;
    }

    .avatar-large {
        display: none;
        position: absolute;
        top: var(--sm-pad);
        right: var(--sm-pad);
        z-index: var(--hovered-row-zi);

        width: 40px;
        height: 40px;
        object-fit: contain;
        border-radius: 2px;

        background: var(--fg-color);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
        pointer-events: none;
    }

    .red .avatar-large {
        background: var(--red-team-color);
    }

    .blue .avatar-large {
        background: var(--blue-team-color);
    }

    .solo .avatar-large {
        background: var(--neutral-team-color);
    }

    .inner:hover .avatar-large {
        display: block;
    }

    .tooltip {
        display: none;
        position: absolute;
        top: calc(100% + var(--sm-gap));
        left: var(--sm-pad);
        z-index: var(--hovered-row-zi);

        max-width: 220px;
        padding: var(--sm-pad) var(--sm-gap);
        border-radius: 4px;

        background: var(--inverse-bg-color);
        color: var(--inverse-text-color);
        font-size: var(--sm-font-size);
        font-weight: normal;
        text-align: left;
        white-space: normal;

        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
        pointer-events: none;
    }

    .inner:hover .tooltip {
        display: block;
    }

    :global(.hearts) + td .inner {
        padding-left: var(--sm-gap);
    }

    .red {
        background: var(--red-team-bg-color);
    }

    .blue {
        background: var(--blue-team-bg-color);
    }

    td:hover {
        z-index: 1;
    }

    .red:hover {
        outline: 2px solid var(--red-team-color);
    }

    .blue:hover {
        outline: 2px solid var(--blue-team-color);
    }

    .solo:hover {
        outline: 2px solid var(--neutral-team-color);
    }

    .focused.red {
        background: var(--red-team-color);
        color: var(--team-text-color);
    }

    .focused.blue {
        background: var(--blue-team-color);
        color: var(--team-text-color);
    }

    .focused.solo {
        background: var(--neutral-team-color);
        color: var(--team-text-color);
    }

    .winner {
        font-weight: 600;
    }

    .not-on-field {
        color: var(--grayed-out-text-color);
    }

    .dq {
        text-decoration: line-through;
    }

    @container (max-width: 84px) {
        .avatar,
        .avatar-large {
            display: none;
        }
    }

    /* Not enough space once the name is hidden, and it'd bloat row height. */
    @media (max-width: 1000px) {
        .name {
            display: none;
        }

        .avatar {
            display: none;
        }

        .inner {
            align-items: center;
            justify-content: center;
        }

        .text {
            flex: 0 1 auto;
        }
    }
</style>
