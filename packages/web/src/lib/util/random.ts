export function shuffle(a: Int32Array, random: () => number) {
    for (let i = a.length - 1; i > 0; i--) {
        let j = Math.floor(random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
}

// FNV-1a.
function hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}

/**
 * [0, 1)
 */
export function seededRandom(seed: string): () => number {
    return mulberry32(hash(seed));
}

function mulberry32(seed: number): () => number {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
