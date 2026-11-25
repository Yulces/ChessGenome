"""Upper bound for reachable placements by integer programming.
Necessary conditions used: (S1)-(S3), the capture condition (Cor 12), and the check condition:
the king of the side not to move is not attacked, the other king is attacked by at most two men."""
import sys, time, pickle, math
import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds
from scipy.sparse import lil_matrix
from core import *

def rays(k):
    f, r = k % 8, k // 8
    for df, dr in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
        path = []
        ff, rr = f + df, r + dr
        while 0 <= ff < 8 and 0 <= rr < 8:
            path.append(8*rr + ff); ff += df; rr += dr
        yield (df == 0 or dr == 0), path
def knight(k):
    f, r = k % 8, k // 8
    return [8*(r+dr) + f+df for df, dr in ((1,2),(2,1),(-1,2),(-2,1),(1,-2),(2,-1),(-1,-2),(-2,-1))
            if 0 <= f+df < 8 and 0 <= r+dr < 8]

def attack_terms(color, k):
    """color 0: white king on k (attackers black, even labels); 1: black king. Yields (t, labels, between)."""
    en = 1 - color                      # enemy label offset: black = +1
    R, N, B, Q, Pn = 3 + en, 5 + en, 7 + en, 9 + en, 1 + en
    f, r = k % 8, k // 8
    for orth, path in rays(k):
        for d, t in enumerate(path):
            labs = [R, Q] if orth else [B, Q]
            if d == 0 and not orth:
                # enemy pawn attacks: white pawn (en=0) attacks upward, so it sits one rank below the king
                if (en == 0 and t // 8 == r - 1) or (en == 1 and t // 8 == r + 1):
                    labs = labs + [Pn]
            yield t, labs, path[:d]
    for t in knight(k):
        yield t, [N], []

def build(extra=None):
    nx = 64 * 13
    X = lambda s, l: 13 * s + l
    terms = []
    for c in (0, 1):
        for k in range(64):
            for t, labs, btw in attack_terms(c, k):
                terms.append((c, k, t, labs, btw))
    ny = len(terms)
    iy = nx
    iz = iy + ny            # z_W, z_B
    ie = iz + 2             # 8 excess variables (color, type)
    ia = ie + 8             # a
    nv = ia + 1
    rows = []; lo = []; hi = []
    def add(coefs, l, h):
        rows.append(coefs); lo.append(l); hi.append(h)
    for s in range(64):
        add({X(s, l): 1 for l in range(13)}, 1, 1)
    add({X(s, 11): 1 for s in range(64)}, 1, 1)
    add({X(s, 12): 1 for s in range(64)}, 1, 1)
    for s in range(64):
        for t in range(64):
            if adjacent(s, t):
                add({X(s, 11): 1, X(t, 12): 1}, -np.inf, 1)
    # attack indicators
    for j, (c, k, t, labs, btw) in enumerate(terms):
        co = {X(k, 11 + c): 1}
        for l in labs: co[X(t, l)] = 1
        for u in btw: co[X(u, 0)] = 1
        co[iy + j] = -1
        add(co, -np.inf, 1 + len(btw))
    for c in (0, 1):
        co = {iy + j: 1 for j, tm in enumerate(terms) if tm[0] == c}
        co[iz + c] = -2
        add(co, -np.inf, 0)
    add({iz: 1, iz + 1: 1}, 1, 1)
    # material
    init = {3: 2, 5: 2, 7: 2, 9: 1}
    for c in (0, 1):
        for q, base in enumerate((3, 5, 7, 9)):
            co = {X(s, base + c): 1 for s in range(64)}
            co[ie + 4*c + q] = -1
            add(co, -np.inf, init[base])
        co = {ie + 4*c + q: 1 for q in range(4)}
        for s in range(64): co[X(s, 1 + c)] = 1
        add(co, -np.inf, 8)
    # capture condition: with m = 64 - #empty, P = pawns, e = sum of excesses
    # a <= 32 - m  <=>  a - E <= -32  (E = number of empty squares)
    co = {ia: 1}
    for s in range(64): co[X(s, 0)] = -1
    add(co, -np.inf, -32)
    # e + P + a <= 16
    co = {ie + q: 1 for q in range(8)}; co[ia] = 1
    for s in range(64):
        co[X(s, 1)] = 1; co[X(s, 2)] = 1
    add(co, -np.inf, 16)
    # 16 - P - a <= a + 2(32 - m) = a + 2E - 64   <=>  -P - 2a - 2E <= -80
    co = {ia: -2}
    for s in range(64):
        co[X(s, 1)] = -1; co[X(s, 2)] = -1; co[X(s, 0)] = -2
    add(co, -np.inf, -80)
    if extra:
        for co, l, h in extra(X, iy, iz, ie, ia, terms): add(co, l, h)
    A = lil_matrix((len(rows), nv))
    for i, co in enumerate(rows):
        for j, v in co.items(): A[i, j] = v
    lb = np.zeros(nv); ub = np.ones(nv)
    for s in range(64):
        if not pawn_ok(s):
            ub[X(s, 1)] = ub[X(s, 2)] = 0
    ub[ie:ie+8] = 8; ub[ia] = 16
    integrality = np.ones(nv); integrality[iy:iy+ny] = 0
    cost = np.zeros(nv)
    for s in range(64):
        for l in range(1, 13): cost[X(s, l)] = -l * LOG[s]
    return cost, A.tocsr(), np.array(lo), np.array(hi), Bounds(lb, ub), integrality, (X, iy, iz, ie, ia, terms)

def solve(extra=None, time_limit=3000, cuts=None):
    cost, A, lo, hi, bnd, integ, meta = build(extra)
    t = time.time()
    res = milp(cost, constraints=LinearConstraint(A, lo, hi), bounds=bnd, integrality=integ,
               options=dict(mip_rel_gap=0.0, time_limit=time_limit, disp=False))
    X = meta[0]
    v = None
    if res.x is not None:
        v = [max(range(13), key=lambda l: res.x[X(s, l)]) for s in range(64)]
    return res, v, meta, time.time() - t

if __name__ == "__main__":
    res, v, meta, dt = solve()
    X, iy, iz, ie, ia, terms = meta
    print("status", res.status, res.message, f"{dt:.0f}s")
    print("primal ln", -res.fun, "log10", -res.fun / LN10, "dual bound ln", -res.mip_dual_bound, "gap", res.mip_gap)
    print("FEN", fen_board(v), "| to move:", "W" if res.x[iz] > 0.5 else "B", "| a =", round(res.x[ia]))
    print("static_ok", static_ok(v), "digits", len(str(code(v))))
    pickle.dump((v, res.x[iz] > 0.5, -res.fun, -res.mip_dual_bound), open("ilp.pkl", "wb"))
