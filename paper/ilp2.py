import pickle, sys
from ilp import *

def double_check_rule(X, iy, iz, ie, ia, terms):
    """In a double check one checker is a line piece at distance >= 2 (its line was opened by the last move).
    Hence at most one checker is adjacent to the king or a knight."""
    out = []
    for c in (0, 1):
        co = {}
        for j, (cc, k, t, labs, btw) in enumerate(terms):
            if cc == c and len(btw) == 0:
                co[iy + j] = 1
        out.append((co, -np.inf, 1))
    return out

def nogoods(vs):
    def f(X, iy, iz, ie, ia, terms):
        out = double_check_rule(X, iy, iz, ie, ia, terms)
        for v in vs:
            out.append(({X(s, v[s]): 1 for s in range(64)}, -np.inf, 63))
        return out
    return f

if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    found = []
    for i in range(n):
        res, v, meta, dt = solve(nogoods([f[0] for f in found]))
        X, iy, iz, ie, ia, terms = meta
        att = [(sq(k), sq(t)) for j, (c, k, t, labs, btw) in enumerate(terms) if res.x[iy + j] > 0.5 and v[k] == 11 + c and v[t] in labs]
        print(i, f"log10 {-res.fun/LN10:.6f} dual {-res.mip_dual_bound/LN10:.6f}", fen_board(v), "to move", "W" if res.x[iz] > 0.5 else "B",
              "a", round(res.x[ia]), "checks", att, f"{dt:.0f}s", flush=True)
        found.append((v, res.x[iz] > 0.5, -res.fun, -res.mip_dual_bound))
    pickle.dump(found, open("ilp2.pkl", "wb"))
