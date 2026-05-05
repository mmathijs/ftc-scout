<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { FullMatchFragment } from "../../graphql/generated/graphql-operations";
    import Modal from "../Modal.svelte";

    type MatchVideo = {
        url: string;
        title: string;
        source: string;
        official: boolean;
    };

    export let shown = false;
    export let match: FullMatchFragment | null = null;

    let dispatch = createEventDispatcher();
    let selectedVideoIndex = 0;
    let lastMatchKey: string | null = null;

    $: videos = ((match as any)?.videos ?? []) as MatchVideo[];
    $: matchKey = match ? `${match.eventCode}-${match.id}` : null;
    $: if (matchKey !== lastMatchKey) {
        lastMatchKey = matchKey;
        selectedVideoIndex = videos.findIndex((v) => v.official);
        if (selectedVideoIndex < 0) selectedVideoIndex = 0;
    }
    $: selectedVideo = videos[selectedVideoIndex] ?? null;
    $: embedUrl = selectedVideo ? getEmbedUrl(selectedVideo.url) : null;

    function close() {
        shown = false;
        dispatch("close");
    }

    function selectVideo(index: number) {
        selectedVideoIndex = index;
    }

    function getEmbedUrl(rawUrl: string): string {
        try {
            const url = new URL(rawUrl);
            const host = url.hostname.replace(/^www\./, "");

            if (host == "youtu.be") {
                return `https://www.youtube.com/embed/${url.pathname.replace(/^\//, "")}`;
            }

            if (host.endsWith("youtube.com")) {
                if (url.pathname == "/watch") {
                    const id = url.searchParams.get("v");
                    if (id) {
                        return `https://www.youtube.com/embed/${id}`;
                    }
                }

                if (url.pathname.startsWith("/shorts/")) {
                    return `https://www.youtube.com/embed/${url.pathname.split("/")[2]}`;
                }

                if (url.pathname.startsWith("/embed/")) {
                    return rawUrl;
                }
            }

            return rawUrl;
        } catch {
            return rawUrl;
        }
    }
</script>

{#if match && videos.length}
    <Modal
        bind:shown
        titleText={selectedVideo
            ? `Match ${match.description} — ${selectedVideo.title}`
            : `Match ${match.description}`}
        {close}
    >
        <div class="video-modal">
            {#if videos.length > 1}
                <div class="sources">
                    {#each videos as video, index}
                        <button
                            type="button"
                            class:selected={selectedVideoIndex == index}
                            on:click={() => selectVideo(index)}
                        >
                            {video.title}
                        </button>
                    {/each}
                </div>
            {/if}

            {#if selectedVideo}
                <div class="frame-shell">
                    {#if embedUrl}
                        <iframe
                            src={embedUrl}
                            title={selectedVideo.title}
                            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                            allowfullscreen
                        />
                        {#if embedUrl == selectedVideo.url}
                            <a href={selectedVideo.url} target="_blank" rel="noreferrer">
                                Open original video
                            </a>
                        {/if}
                    {:else}
                        <div class="fallback">
                            <p>This video cannot be embedded directly.</p>
                            <a href={selectedVideo.url} target="_blank" rel="noreferrer">
                                Open original video
                            </a>
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </Modal>
{/if}

<style>
    .video-modal {
        display: flex;
        flex-direction: column;
        gap: var(--md-gap);
        width: min(90vw, 1100px);
    }

    .sources {
        display: flex;
        flex-wrap: wrap;
        gap: var(--sm-gap);
    }

    .sources button {
        border: 1px solid var(--sep-color);
        border-radius: 999px;
        background: var(--bg-color);
        color: var(--text-color);
        cursor: pointer;
        padding: 0.4em 0.8em;
        font: inherit;
    }

    .sources button.selected {
        border-color: var(--theme-color);
        color: var(--theme-color);
        font-weight: bold;
    }

    .frame-shell {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);
    }

    iframe {
        width: min(90vw, 1100px);
        aspect-ratio: 16 / 9;
        border: none;
        border-radius: 8px;
        background: #000;
    }

    .fallback {
        display: flex;
        flex-direction: column;
        gap: var(--sm-gap);
    }
</style>
