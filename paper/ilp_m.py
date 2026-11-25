"""Upper bound U(m) for reachable placements with exactly m men (integer program of Theorem 15 plus a men count)."""
import json, math, pickle, sys
import numpy as np
from ilp import solve
from ilp3 import contact_rule
from core import *

def with_m(m):
    def f(X, iy, iz, ie, ia, terms):
        out = contact_rule(X, iy, iz, ie, ia, terms)
        out.append(({X(s, 0): 1 for s in range(64)}, 64 - m, 64 - m))
        return out
    return f

if __name__ == "__main__":
    res = {}
    for m in range(2, 33):
        r, v, meta, dt = solve(with_m(m))
        X, iy, iz, ie, ia, terms = meta
        if r.status != 0 or v is None:
            print(m, "status", r.status, r.message, flush=True); continue
        S = code(v)
        res[m] = dict(ln=-r.fun, dual=-r.mip_dual_bound, gap=r.mip_gap, fen=fen_board(v), v=v,
                      white_to_move=bool(r.x[iz] > 0.5), log10=math.log10(S), digits=len(str(S)))
        print(m, f"log10 {math.log10(S):.5f} digits {len(str(S))} gap {r.mip_gap:.1e}", fen_board(v), "W" if r.x[iz] > 0.5 else "B", f"{dt:.0f}s", flush=True)
        json.dump(res, open("ilp_m.json", "w"))
