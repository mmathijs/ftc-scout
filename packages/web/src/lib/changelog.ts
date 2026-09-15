export type ChangelogEntry = {
    id: string;
    date: string;
    title: string;
    description: string;
};

// Newest first.
export const CHANGELOG: ChangelogEntry[] = [
    {
        id: "2026-09-14-changelog-added",
        date: "2026-09-14",
        title: "Changelog added",
        description:
            "I have added a changelog feature showing all small and minor api changes in an RSS Feed and show a popup, when there is a new one since last visit.",
    },
];
