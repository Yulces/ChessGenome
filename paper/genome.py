"""Enumerate all statically admissible placements with code S <= X (exact integers)."""
import sys, time
from core import *

def enumerate_codes(X, collect=True):
    out = []
    count = 0
    cnt = [[0]*5, [0]*5]
    TYP = {1: (0, 0), 2: (1, 0), 3: (0, 1), 4: (1, 1), 5: (0, 2), 6: (1, 2), 7: (0, 3), 8: (1, 3), 9: (0, 4), 10: (1, 4)}
    POW = [[p**l for l in range(11)] for p in BOARD]
    def rec(start, S, vec):
        nonlocal count
        count += 1
        if collect:
            out.append((S, tuple(vec)))
        lim = X // S
        for i in range(start, 64):
            p = BOARD[i]
            if p > lim:
                break
            if vec[i]:
                continue
            for lab in range(1, 11):
                q = POW[i][lab]
                if q > lim:
                    break
                if lab <= 2 and not pawn_ok(i):
                    continue
                col, typ = TYP[lab]
                cnt[col][typ] += 1
                if side_ok(*cnt[col]):
                    vec[i] = lab
                    rec(i + 1, S * q, vec)
                    vec[i] = 0
                cnt[col][typ] -= 1
    for (b, w) in KING_PAIRS:
        S0 = BOARD[b]**12 * BOARD[w]**11
        if S0 <= X:
            vec = [0]*64
            vec[b], vec[w] = 12, 11
            rec(0, S0, vec)
    return count, sorted(out)

if __name__ == "__main__":
    for k in range(11, 20):
        t = time.time()
        c, _ = enumerate_codes(10**k, collect=False)
        print(k, c, f"{time.time()-t:.1f}s", flush=True)
        if time.time() - t > 60:
            break
