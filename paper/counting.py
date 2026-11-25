"""Exact number of statically admissible placements, by number of men."""
from fractions import Fraction
from math import comb, factorial
from core import *

def layer_counts(nsq=64, pawn_squares=None, king_pairs=None, p0=8, init=INIT):
    if pawn_squares is None:
        pawn_squares = {i for i in range(64) if pawn_ok(i)}
    if king_pairs is None:
        king_pairs = KING_PAIRS
    g = {}
    for (Pn, R, N, B, Q) in side_tuples(p0, init):
        key = (Pn, R + N + B + Q)
        g[key] = g.get(key, 0) + Fraction(1, factorial(R)*factorial(N)*factorial(B)*factorial(Q))
    nk = {}
    for (b, w) in king_pairs:
        k1 = (b in pawn_squares) + (w in pawn_squares)
        nk[k1] = nk.get(k1, 0) + 1
    free = nsq - 2
    out = {}
    keys = list(g.items())
    for k1, mult in nk.items():
        ps = len(pawn_squares) - k1
        for (Pw, Ow), gw in keys:
            for (Pb, Ob), gb in keys:
                Pn, O = Pw + Pb, Ow + Ob
                if Pn > ps or O > free - Pn:
                    continue
                ways = comb(ps, Pn) * comb(Pn, Pw) * Fraction(factorial(free - Pn), factorial(free - Pn - O)) * gw * gb
                m = 2 + Pn + O
                out[m] = out.get(m, 0) + mult * ways
    assert all(x.denominator == 1 for x in out.values())
    return {m: int(x) for m, x in sorted(out.items())}

def brute(nf, nr, pawn_ranks, p0, init):
    """Brute-force count on an nf x nr board (toy validation)."""
    n = nf * nr
    def adj(i, j):
        return max(abs(i % nf - j % nf), abs(i // nf - j // nf)) <= 1 and i != j
    pawnsq = {i for i in range(n) if i // nf in pawn_ranks}
    kp = [(b, w) for b in range(n) for w in range(n) if b != w and not adj(b, w)]
    counts = {}
    def rec(i, kings, cnt, m):
        if i == n:
            counts[m] = counts.get(m, 0) + 1
            return
        if i in kings:
            rec(i + 1, kings, cnt, m); return
        rec(i + 1, kings, cnt, m)
        for col in (0, 1):
            for typ in range(5):
                if typ == 0 and i not in pawnsq:
                    continue
                cnt[col][typ] += 1
                if side_ok(*cnt[col], p0=p0, init=init):
                    rec(i + 1, kings, cnt, m + 1)
                cnt[col][typ] -= 1
    for (b, w) in kp:
        rec(0, (b, w), [[0]*5, [0]*5], 2)
    return dict(sorted(counts.items())), pawnsq, kp, n

if __name__ == "__main__":
    c = layer_counts()
    total = sum(c.values())
    for m, x in c.items():
        print(m, x)
    print("TOTAL", total, f"~ {total:.6e}", "digits", len(str(total)))
    # toy validation
    bc, pawnsq, kp, n = brute(3, 4, {1, 2}, 1, (1, 0, 0, 1))
    fc = layer_counts(nsq=n, pawn_squares=pawnsq, king_pairs=kp, p0=1, init=(1, 0, 0, 1))
    print("toy 3x4 brute :", bc)
    print("toy 3x4 formula:", fc, "MATCH" if bc == fc else "MISMATCH")
