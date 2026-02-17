<script lang="ts">
    import Navbar from "$lib/components/nav/Navbar.svelte";
    import { browser } from "$app/environment";
    import Sidebar from "$lib/components/nav/Sidebar.svelte";
    import { afterNavigate } from "$app/navigation";
    import { sendAnalyticsRequest } from "./analytics";

    if (browser) {
        // Svelte uses window.scrollTo to emulate the scroll resetting when navigation. However we
        // have overflow hidden on the body (so the scrollbar is under the navbar). Therefore
        // instead of scrolling the window we scroll the content div.
        // This is pretty hacky but seems to work.
        window.scrollTo = (x: any, y?: any) => {
            document.getElementById("content")?.scrollTo(x, y);
        };
        // Similarly sveltekit uses these props to figure out the current scroll of the document.
        Object.defineProperties(window, {
            pageXOffset: { get: () => document.getElementById("content")?.scrollLeft },
            pageYOffset: { get: () => document.getElementById("content")?.scrollTop },
        });
    }

    afterNavigate(sendAnalyticsRequest);
</script>

<svelte:head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" />
    <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap"
        rel="stylesheet"
    />
</svelte:head>

<Navbar />
<Sidebar />

<!-- Autofocus allows the document to be scrolled immediately without having to click. -->
<!-- svelte-ignore a11y-autofocus -->
<div class="app">
    <div class="beta-warning">
        <p>
            This is an <strong>unofficial</strong> beta release of FTCScout. Report
            advancement/leagues bugs on
            <a
                href="https://github.com/mmathijs/ftc-scout"
                target="_blank"
                rel="noopener noreferrer">GitHub</a
            >
            or
            <a
                href="https://discordapp.com/users/595972406745628703"
                target="_blank"
                rel="noopener noreferrer">Discord</a
            >. <!--<br>Official GitHub repository: <a
            href="https://github.com/ftc-scout/ftc-scout"
            target="_blank"
            rel="noopener noreferrer">
            can be found here</a>.-->
        </p>
    </div>
    <div id="content" tabindex="-1" autofocus>
        <slot />
    </div>
</div>

<style>
    @import "/static/css/global.css";
    @import "/static/css/form-reset.css";

    #content {
        position: relative;

        /*margin-top: var(--navbar-size);*/
        margin-left: var(--sidebar-size);
        padding: var(--md-pad);
        padding-bottom: 80px;

        overflow: auto;
        max-height: calc(100vh - var(--navbar-size));
        scrollbar-gutter: stable both-edges;

        scroll-padding-top: var(--lg-gap);
    }

    @media (max-width: 1500px) {
        #content {
            margin-left: 0;
        }
    }

    @media (max-width: 550px) {
        #content {
            padding-left: 0;
            padding-right: 0;
            scrollbar-gutter: initial;
        }
    }

    #content:focus,
    #content:focus-visible {
        outline: none;
    }

    :global(body) {
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        position: fixed;
        overflow: hidden;

        background: var(--bg-color);
    }

    .beta-warning {
        top: 0;
        left: 0;
        right: 0;
        z-index: 1000;

        background: var(--alert-bar-color);
        color: var(--alert-bar-text-color);
        text-align: center;
        padding: var(--md-pad) var(--lg-pad);
        font-size: var(--lg-font-size);
    }

    .app {
        position: relative;

        margin-top: var(--navbar-size);
    }
</style>
