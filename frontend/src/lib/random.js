export function pickRandom({ pool, seen }) {
    // Gdy wszystko już było, zaczynamy od nowa (ale nie od tego samego przepisu)
    const fresh = pool.filter((id) => !seen.includes(id));
    const candidates = fresh.length ? fresh : pool.filter((id) => id !== seen[seen.length - 1]);
    const id = candidates[Math.floor(Math.random() * candidates.length)];
    return { pool, seen: fresh.length ? [...seen, id] : [id] };
}
export function currentRandom(state) {
    return state.seen[state.seen.length - 1];
}
