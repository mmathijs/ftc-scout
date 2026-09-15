<script lang="ts" context="module">
    import { writable } from "svelte/store";
    import { browser } from "$app/environment";
    import { parse, serialize } from "cookie";
    import { CHANGELOG_SEEN_COOKIE_AGE, CHANGELOG_SEEN_COOKIE_NAME } from "../../constants";
    import { CHANGELOG } from "../../changelog";

    function markSeen(id: string) {
        document.cookie = serialize(CHANGELOG_SEEN_COOKIE_NAME, id, {
            path: "/",
            maxAge: CHANGELOG_SEEN_COOKIE_AGE,
            httpOnly: false,
        });
    }

    function loadShown(): boolean {
        if (!browser || CHANGELOG.length == 0) return false;

        let lastSeen = parse(document.cookie)[CHANGELOG_SEEN_COOKIE_NAME];
        let latestId = CHANGELOG[0].id;

        if (lastSeen === undefined) {
            markSeen(latestId);
            return false;
        }

        return lastSeen != latestId;
    }

    export let shown = writable(loadShown());
</script>

<script lang="ts">
    import Modal from "../Modal.svelte";

    $: lastSeenIndex = browser
        ? CHANGELOG.findIndex((e) => e.id == parse(document.cookie)[CHANGELOG_SEEN_COOKIE_NAME])
        : -1;

    $: newEntries = lastSeenIndex > 0 ? CHANGELOG.slice(0, lastSeenIndex) : CHANGELOG.slice(0, 1);

    function dismiss() {
        $shown = false;
        if (browser) markSeen(CHANGELOG[0].id);
    }
</script>

<Modal
    bind:shown={$shown}
    titleText={newEntries.length > 1 ? "What's new" : newEntries[0]?.title ?? "What's new"}
    close={dismiss}
>
    <div class="entries">
        {#each newEntries as entry (entry.id)}
            <div class="entry">
                {#if newEntries.length > 1}
                    <div class="entry-head">
                        <h3>{entry.title}</h3>
                        <time datetime={entry.date}>{entry.date}</time>
                    </div>
                {:else}
                    <time datetime={entry.date}>{entry.date}</time>
                {/if}
                <p>{entry.description}</p>
            </div>
        {/each}
    </div>

    <svelte:fragment slot="actions">
        <a class="cta" href="/changelog" on:click={dismiss}>See the full changelog</a>
    </svelte:fragment>
</Modal>

<style>
    .entries {
        display: flex;
        flex-direction: column;
        gap: var(--lg-gap);
        width: min(90vw, 50ch);
    }

    .entry-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--md-gap);
    }

    h3 {
        font-size: var(--lg-font-size);
    }

    time {
        font-style: italic;
        color: var(--secondary-text-color);
        white-space: nowrap;
    }

    p {
        line-height: 1.6;
        margin-top: var(--sm-gap);
    }

    .cta {
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;

        background: var(--hover-color);
        color: var(--text-color);
        font-weight: bold;

        padding: var(--lg-pad);

        cursor: pointer;
    }

    .cta:hover {
        filter: brightness(0.9);
    }
</style>
