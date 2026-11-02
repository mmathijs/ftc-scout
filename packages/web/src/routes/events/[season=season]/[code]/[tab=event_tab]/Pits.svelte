<script lang="ts">
    import { getContext, onDestroy, onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { CURRENT_SEASON, type Season } from "@ftc-scout/common";
    import { PitMap, type PitMapData, type SimpleTeam, type ThemeOption } from "ftc-embeds/pit-map";
    import { TEAM_CLICK_ACTION_CTX } from "$lib/components/matches/MatchTeam.svelte";
    import { tippyTheme } from "$lib/components/nav/DarkModeToggle.svelte";
    import Loading from "$lib/components/Loading.svelte";
    import { getClient } from "$lib/graphql/client";
    import { getDataSync } from "$lib/graphql/getData";
    import { PitMapDocument } from "$lib/graphql/generated/graphql-operations";

    export let season: Season;
    export let eventCode: string;
    export let focusedTeam: number | null;

    let clickAction = getContext(TEAM_CLICK_ACTION_CTX) as
        | ((num: number, name: string) => void)
        | undefined;

    $: pitMapStore = getDataSync(getClient(fetch), PitMapDocument, { season, code: eventCode });
    $: pitMap = ($pitMapStore?.data?.eventByCode?.pitMap ?? null) as
        | (PitMapData & { updatedAt: string })
        | null;

    const FOCUS = { cells: 0.5, keepZoom: true, onlyIfHidden: true, flash: false };

    let container: HTMLDivElement;
    let map: PitMap | null = null;
    let clickedOnMap: number | null = null;

    // Same colors as the tippy tooltips
    $: theme = {
        base: "ftcscout",
        ...($tippyTheme == "dark"
            ? {
                  tooltipBg: "#333333",
                  tooltipText: "#ffffff",
                  tooltipMuted: "#d0d0d0",
                  tooltipBorder: "transparent",
              }
            : {
                  tooltipBg: "#ffffff",
                  tooltipText: "#26323d",
                  tooltipMuted: "#5d6773",
                  tooltipBorder: "rgba(0, 8, 16, 0.15)",
              }),
        uiRadius: 4,
        dimOpacity: 0.55,
    } satisfies ThemeOption;

    function teamHref(number: string) {
        return `/teams/${number}${
            season == CURRENT_SEASON ? "" : `?season=${season}`
        }#${eventCode}`;
    }

    function tooltip(team: SimpleTeam | null) {
        if (!team) return false;
        let el = document.createElement("div");
        el.className = "pit-tip";
        el.textContent = `${team.displayNumber || team.number} ${team.name ?? ""}`.trim();
        return el;
    }

    onMount(() => {
        map = new PitMap(container, {
            theme,
            tooltip,
            highlight: focusedTeam,
            dimOthers: true,
            pulse: false,
            scrollZoom: "modifier",
            ariaLabel: "Pit map",
            clickAction: ({ team }) => {
                if (!team) return;
                if (clickAction) {
                    clickedOnMap = +team.number;
                    clickAction(+team.number, team.name ?? "");
                } else {
                    goto(teamHref(team.number));
                }
            },
        });
    });

    onDestroy(() => map?.destroy());

    let loadedFor: PitMapData | null = null;
    $: if (map && pitMap && pitMap !== loadedFor) {
        loadedFor = pitMap;
        map.setData(pitMap);
        if (focusedTeam) map.focusTeam(focusedTeam, FOCUS);
    }

    $: map?.update({ theme });

    // clickedOnMap is read in the function so setting it doesn't re-run this before focusedTeam updates
    $: if (map) onFocusedTeam(focusedTeam);

    function onFocusedTeam(team: number | null) {
        if (!map) return;
        map.update({ highlight: team });
        let fromMap = team != null && team === clickedOnMap;
        clickedOnMap = null;
        if (team && !fromMap && map.hasTeam(team)) map.focusTeam(team, FOCUS);
    }
</script>

<Loading store={$pitMapStore} checkExists={(d) => !!d.eventByCode?.pitMap}>
    <p slot="error" class="empty">No pit map has been published for this event.</p>
</Loading>

<div class="pit-map" class:hidden={!pitMap} bind:this={container} />

{#if pitMap}
    <p class="note">
        Click a pit to select the team · Ctrl/⌘ + scroll or pinch to zoom · Pit map data from
        <i>FIRST</i>, updated {new Date(pitMap.updatedAt).toLocaleDateString()}
    </p>
{/if}

<style>
    .pit-map {
        height: min(75vh, 900px);
        min-height: 360px;
        border: 1px solid var(--sep-color);
        border-radius: 8px;
        overflow: hidden;
    }

    .hidden {
        display: none;
    }

    .note,
    .empty {
        margin: var(--md-gap) 0 0;
        color: var(--secondary-text-color);
        font-size: var(--sm-font-size);
    }

    .empty {
        text-align: center;
        font-size: inherit;
    }

    .pit-map :global(.ftcpm-tip:not(.ftcpm-popup)) {
        min-width: 0;
        padding: 5px 9px;
        font-size: 14px;
        line-height: 1.4;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
        backdrop-filter: none;
    }
</style>
