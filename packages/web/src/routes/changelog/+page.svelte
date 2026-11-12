<script lang="ts">
    import Head from "$lib/components/Head.svelte";
    import Card from "$lib/components/Card.svelte";
    import WidthProvider from "$lib/components/WidthProvider.svelte";
    import { CHANGELOG } from "$lib/changelog";
</script>

<Head
    title="Changelog | FTCScout"
    description="API Changes to the MMathijs' dev mirror ftcscout.mmathijs.nl"
    canonical="/changelog"
>
    <link rel="alternate" type="application/rss+xml" title="API Changelog" href="/changelog.xml" />
</Head>

<WidthProvider width="90ch">
    <Card>
        <div class="head">
            <h1>Changelog</h1>
            <a href="/changelog.xml">RSS feed</a>
        </div>
    </Card>

    {#if CHANGELOG.length == 0}
        <Card>
            <p class="empty">No updates yet.</p>
        </Card>
    {/if}

    {#each CHANGELOG as entry (entry.id)}
        <Card>
            <article id={entry.id}>
                <div class="entry-head">
                    <h2><a href="#{entry.id}">{entry.title}</a></h2>
                    <time datetime={entry.date}>{entry.date}</time>
                </div>
                <p>{entry.description}</p>
            </article>
        </Card>
    {/each}
</WidthProvider>

<style>
    .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--md-gap);
    }

    h1 {
        font-size: var(--vl-font-size);
    }

    .entry-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--md-gap);
        margin-bottom: var(--sm-gap);
    }

    h2 {
        font-size: var(--lg-font-size);
    }

    time {
        font-style: italic;
        color: var(--secondary-text-color);
        white-space: nowrap;
    }

    a {
        color: inherit;
    }

    p {
        line-height: 1.75;
    }

    .empty {
        color: var(--secondary-text-color);
        font-style: italic;
    }
</style>
