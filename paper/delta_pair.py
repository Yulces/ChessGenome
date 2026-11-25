"""Explicit pairs of admissible placements with tiny |L(A)-L(B)|: lattice short vectors + decomposition ILP."""
import sys, json, math, itertools
import numpy as np, mpmath
from fpylll import IntegerMatrix, LLL, BKZ
from scipy.optimize import milp, LinearConstraint, Bounds
from scipy.sparse import lil_matrix
from core import *

mpmath.mp.dps = 400
LOGS = [mpmath.log(p) for p in BOARD]

def decompose(c):
    """Find admissible v, w with v - w = c (labels 0..12), via an integer program. Returns (v, w) or None."""
    nx = 2 * 64 * 13
    X = lambda k, s, l: (k * 64 + s) * 13 + l
    ie = nx; nv = nx + 16
    rows = []; lo = []; hi = []
    def add(co, l, h): rows.append(co); lo.append(l); hi.append(h)
    for k in (0, 1):
        for s in range(64): add({X(k, s, l): 1 for l in range(13)}, 1, 1)
        add({X(k, s, 11): 1 for s in range(64)}, 1, 1)
        add({X(k, s, 12): 1 for s in range(64)}, 1, 1)
        for s in range(64):
            for t in range(64):
                if adjacent(s, t): add({X(k, s, 11): 1, X(k, t, 12): 1}, -np.inf, 1)
        init = {3: 2, 5: 2, 7: 2, 9: 1}
        for col in (0, 1):
            for q, base in enumerate((3, 5, 7, 9)):
                co = {X(k, s, base + col): 1 for s in range(64)}; co[ie + 8 * k + 4 * col + q] = -1
                add(co, -np.inf, init[base])
            co = {ie + 8 * k + 4 * col + q: 1 for q in range(4)}
            for s in range(64): co[X(k, s, 1 + col)] = 1
            add(co, -np.inf, 8)
    for s in range(64):
        co = {X(0, s, l): l for l in range(1, 13)}
        for l in range(1, 13): co[X(1, s, l)] = -l
        add(co, c[s], c[s])
    A = lil_matrix((len(rows), nv))
    for i, co in enumerate(rows):
        for j, val in co.items(): A[i, j] = val
    lb = np.zeros(nv); ub = np.ones(nv); ub[ie:] = 8
    for k in (0, 1):
        for s in range(64):
            if not pawn_ok(s): ub[X(k, s, 1)] = ub[X(k, s, 2)] = 0
    res = milp(np.zeros(nv), constraints=LinearConstraint(A.tocsr(), lo, hi), bounds=Bounds(lb, ub),
               integrality=np.ones(nv), options=dict(time_limit=60, disp=False))
    if res.x is None: return None
    v = [max(range(13), key=lambda l: res.x[X(0, s, l)]) for s in range(64)]
    w = [max(range(13), key=lambda l: res.x[X(1, s, l)]) for s in range(64)]
    assert all(v[s] - w[s] == c[s] for s in range(64)) and static_ok(v) and static_ok(w)
    return v, w

def short_vectors(squares, E, M, beta):
    C = mpmath.mpf(10) ** E
    w = [int(mpmath.nint(C * LOGS[s])) for s in squares]
    n = len(squares)
    A = IntegerMatrix.from_matrix([[(M if i == j else 0) for j in range(n)] + [w[i]] for i in range(n)])
    LLL.reduction(A)
    if beta: BKZ.reduction(A, BKZ.Param(block_size=beta, max_loops=6))
    out = []
    for i in range(n):
        row = [int(A[i, j]) for j in range(n + 1)]
        coeff = [x // M for x in row[:n]]
        c = [0] * 64
        for s, x in zip(squares, coeff): c[s] = x
        out.append(c)
    return out

def gap(c):
    return abs(mpmath.fsum(ci * LOGS[s] for s, ci in enumerate(c) if ci))

if __name__ == "__main__":
    squares = (list(range(64)) if int(sys.argv[1]) == 64 else list(range(64 - int(sys.argv[1]) // 2 - 32 + 32, 64))[:0] or sorted(range(64), key=lambda s: -s)[: int(sys.argv[1])])
    import os
    best = None
    if os.path.exists("delta_pair.json"):
        best = (mpmath.mpf(json.load(open("delta_pair.json"))["gap"]), None, None)
    for E in [int(x) for x in sys.argv[2].split(",")]:
        cands = short_vectors(squares, E, int(sys.argv[3]), int(sys.argv[4]))
        cands = sorted(cands, key=lambda c: sum(abs(x) for x in c))
        for c in cands[:20]:
            if max(abs(x) for x in c) > 12 or not any(c): continue
            g = gap(c)
            if best is not None and g >= best[0]: continue
            dec = decompose(c)
            print(E, "L1", sum(abs(x) for x in c), "max", max(abs(x) for x in c), "nnz", sum(1 for x in c if x),
                  "gap", mpmath.nstr(g, 5), "decomposable" if dec else "no", flush=True)
            if dec:
                best = (g, dec, E)
                json.dump(dict(gap=mpmath.nstr(g, 30), log10=float(mpmath.log10(g)), v=dec[0], w=dec[1],
                               S_v=str(code(dec[0])), S_w=str(code(dec[1]))), open("delta_pair.json", "w"))
    print("BEST", mpmath.nstr(best[0], 6) if best else None)
