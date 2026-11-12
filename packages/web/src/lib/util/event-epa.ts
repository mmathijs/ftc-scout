export function eventEpa(t: { stats?: unknown; team?: unknown }): number | null {
    let stats = t.stats as { epa?: number | null; epaGroup?: { np?: number | null } | null } | null;
    let team = t.team as { epa?: { epa: number } | null } | null;
    return stats?.epaGroup?.np ?? stats?.epa ?? team?.epa?.epa ?? null;
}
