<script lang="ts">
    import BlogTemplate from "../BlogTemplate.svelte";
</script>

<BlogTemplate slug="advancement-and-leagues">
    <svelte:fragment slot="title">Advancement and Leagues Are Here</svelte:fragment>
    <svelte:fragment slot="author">MMathijs</svelte:fragment>
    <svelte:fragment slot="date">March 19, 2026</svelte:fragment>

    <p>
        We shipped a big update focused on advancement and leagues. The goal was simple: make event
        pages show the full picture, so you can make decisions faster without jumping between sites.
    </p>

    <h2>New Features</h2>
    <ul>
        <li>
            <b>Advancement tab on event pages:</b> You can now see advancement rankings directly on the
            event page, including eligibility, advancement rank, and who is currently in a qualifying
            slot.
        </li>
        <li>
            <b>Advancement slots are loaded from the FTC API:</b> FTC<em>Scout</em> now pulls slot information
            from the official API, including number of slots, where teams advance next, and reserved
            FIRST Championship slots.
        </li>
        <li>
            <b>League rankings tab:</b> League tournament events now include a League tab with standings,
            plus a quick toggle between all league teams and teams at the current event.
        </li>
        <li>
            <b>Advancement summary in event info:</b> Event pages now clearly show how many teams advance,
            including the split between Championship and next-level advancement when that data is available.
        </li>
        <li>
            <b>Preview Tab:</b> View the competition before it happens with a preview tab showing all
            teams ranked based on their opr or whatever metric you choose.
        </li>
    </ul>

    <h2>Improvements</h2>
    <ul>
        <li>
            <b>GraphQL updates:</b> Advancement and league data is also added
        </li>
        <li>
            <b>New REST API For Advancement and Leagues:</b> We added new REST endpoints for
            advancement and league data. You can read about them <a href="/api/rest">here</a>.
        </li>
        <li>
            <b>Better region team search:</b> Region team search is now based on a team's actual region
            data, instead of inferring region from events they played.
        </li>
        <li>
            <b>Cleaner icons:</b> Duplicate icons were removed and replaced with icons that better match
            each section.
        </li>
    </ul>

    <h2>Bug Fixes</h2>
    <ul>
        <li>
            <b>DQ handling is now consistent:</b> Disqualifications now always count as a loss and contribute
            0 where relevant in tie-break calculations (matching FIRST behavior).
        </li>
        <li>
            Because of that DQ fix, displayed records, rankings, and tie-breaks may change compared
            to prior releases.
        </li>
    </ul>

    <h2>Why This Matters</h2>
    <p>
        If you are trying to answer "Who advances from here?" this update should make that much
        easier. You now get advancement slots, rankings, and league context directly in FTC<em
            >Scout</em
        >, with no need to switch back and forth between FTC-Events and FTC<em>Scout</em>.
    </p>

    <p>
        As always, thank you for all the bug reports and feature requests. If something still looks
        off for your region or season format, send us a message and we will take a look.
    </p>
</BlogTemplate>

<style>
    h2 {
        font-size: var(--lg-font-size);
        margin: var(--lg-gap) 0 var(--sm-gap) 0;
    }

    ul {
        line-height: 1.75;
        margin-left: var(--vl-gap);
    }
</style>
