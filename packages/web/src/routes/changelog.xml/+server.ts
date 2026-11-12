import { CHANGELOG } from "$lib/changelog";

const SITE_URL = "https://ftcscout.mmathijs.nl";

function escapeXml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

export const GET = async () => {
    let items = CHANGELOG.map(
        (e) => `
        <item>
            <title>${escapeXml(e.title)}</title>
            <link>${SITE_URL}/changelog#${e.id}</link>
            <guid isPermaLink="false">${e.id}</guid>
            <pubDate>${new Date(e.date).toUTCString()}</pubDate>
            <description>${escapeXml(e.description)}</description>
        </item>`
    ).join("");

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
    <channel>
        <title>ftcscout.mmathijs.nl API Changelog</title>
        <link>${SITE_URL}/changelog</link>
        <description>API Changes to the MMathijs' dev mirror ftcscout.mmathijs.nl</description>
        <language>en-us</language>${items}
    </channel>
</rss>
`;

    return new Response(xml, {
        headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
        },
    });
};
