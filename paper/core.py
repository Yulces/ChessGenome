"""Core routines for 'The Chess Genome'. Exact integer arithmetic unless noted."""
import math, itertools
from fractions import Fraction
from functools import lru_cache

def _primes(n):
    out, k = [], 2
    while len(out) < n:
        if all(k % q for q in out if q * q <= k):
            out.append(k)
        k += 1
    return out
P = _primes(96)                                     # p_1..p_96
BOARD = P[:64]
LOG = [math.log(p) for p in BOARD]
LN10 = math.log(10)

def sq(i):            # 0-based index -> name
    return "abcdefgh"[i % 8] + str(i // 8 + 1)
def idx(name):
    return "abcdefgh".index(name[0]) + 8 * (int(name[1]) - 1)
def adjacent(i, j):
    return max(abs(i % 8 - j % 8), abs(i // 8 - j // 8)) <= 1 and i != j
def pawn_ok(i):
    return 1 <= i // 8 <= 6

KING_PAIRS = [(b, w) for b in range(64) for w in range(64) if b != w and not adjacent(b, w)]  # (black, white)

# labels: wP1 bP2 wR3 bR4 wN5 bN6 wB7 bB8 wQ9 bQ10 wK11 bK12
INIT = (2, 2, 2, 1)   # original R, N, B, Q per side

def excess(R, N, B, Q, init=INIT):
    return max(R-init[0], 0) + max(N-init[1], 0) + max(B-init[2], 0) + max(Q-init[3], 0)

def side_ok(Pn, R, N, B, Q, p0=8, init=INIT):
    return 0 <= Pn <= p0 and excess(R, N, B, Q, init) <= p0 - Pn

def static_ok(v):
    """v: list of 64 labels. Conditions (S1)-(S3)."""
    if v.count(11) != 1 or v.count(12) != 1:
        return False
    if adjacent(v.index(11), v.index(12)):
        return False
    for i, x in enumerate(v):
        if x in (1, 2) and not pawn_ok(i):
            return False
    for c in (0, 1):
        cnt = [v.count(l + c) for l in (1, 3, 5, 7, 9)]
        if not side_ok(*cnt):
            return False
    return True

def code(v):
    s = 1
    for i, x in enumerate(v):
        if x:
            s *= BOARD[i] ** x
    return s

def side_tuples(p0=8, init=INIT):
    out = []
    for Pn in range(p0 + 1):
        cap = p0 - Pn
        for R in range(init[0] + cap + 1):
            for N in range(init[1] + cap + 1):
                for B in range(init[2] + cap + 1):
                    for Q in range(init[3] + cap + 1):
                        if excess(R, N, B, Q, init) <= cap:
                            out.append((Pn, R, N, B, Q))
    return out

def best_placement(wt, bt, kings=None):
    """Exact optimum of sum v_i log p_i for material wt, bt = (P,R,N,B,Q) of White, Black.
    Greedy (justified in the paper) over all ordered non-adjacent king pairs. Returns (logS, vector)."""
    officers = sorted([3]*wt[1] + [5]*wt[2] + [7]*wt[3] + [9]*wt[4] +
                      [4]*bt[1] + [6]*bt[2] + [8]*bt[3] + [10]*bt[4], reverse=True)
    pawns = [2]*bt[0] + [1]*wt[0]
    best = (-1.0, None)
    for (bk, wk) in (kings or KING_PAIRS):
        v = [0]*64
        v[bk], v[wk] = 12, 11
        free = [i for i in range(63, -1, -1) if i != bk and i != wk]
        for lab, i in zip(officers, free):
            v[i] = lab
        rest = [i for i in free[len(officers):] if pawn_ok(i)]
        if len(rest) < len(pawns):
            continue
        for lab, i in zip(pawns, rest):
            v[i] = lab
        val = sum(x * LOG[i] for i, x in enumerate(v) if x)
        if val > best[0]:
            best = (val, v)
    return best

def best_placement_exact(wt, bt):
    """Same optimisation with exact integer codes for all king pairs (no floating point)."""
    best = (0, None)
    for pair in KING_PAIRS:
        val, v = best_placement(wt, bt, kings=[pair])
        if v is not None:
            S = code(v)
            if S > best[0]:
                best = (S, v)
    return best

def fen_board(v):
    sym = " PpRrNnBbQqKk"
    rows = []
    for r in range(7, -1, -1):
        row, e = "", 0
        for f in range(8):
            x = v[8*r + f]
            if x == 0:
                e += 1
            else:
                if e: row += str(e); e = 0
                row += sym[x]
        if e: row += str(e)
        rows.append(row)
    return "/".join(rows)
