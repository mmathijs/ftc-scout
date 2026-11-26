import { savedAt } from "@/format";

/** How long a request runs before the page says the connection is slow, as on the website. */
export const SLOW_MS = 6000;

export type SavedNoteState = {
    online: boolean;
    /** The last request failed. */
    failed: boolean;
    /** A request has been running for at least SLOW_MS. */
    slow: boolean;
    /** When the shown data was fetched, or 0 when nothing is shown yet. */
    updatedAt: number;
};

export type Note = { kind: "offline" | "failed" | "slow"; text: string };

export function savedNote({ online, failed, slow, updatedAt }: SavedNoteState): Note | null {
    let saved = updatedAt ? savedAt(updatedAt) : null;
    if (!online) return saved ? { kind: "offline", text: `Offline · saved ${saved}` } : null;
    if (failed) return saved ? { kind: "failed", text: `Couldn't refresh · saved ${saved}` } : null;
    if (slow) {
        return {
            kind: "slow",
            text: saved
                ? `Slow connection · showing data from ${saved} until the latest arrives`
                : "Slow connection · still loading",
        };
    }
    return null;
}
