import pickle, sys
from ilp import *
from ilp2 import double_check_rule

def origins(t, lab):
    """Squares from which a man with label lab standing on t may have arrived on the last move (one step back).
    For line pieces the neighbour in the direction of arrival is enough (it is empty after the move)."""
    f, r = t % 8, t // 8
    black = (lab % 2 == 0)
    kind = (lab + 1) // 2          # 1 pawn, 2 rook, 3 knight, 4 bishop, 5 queen
    out = set()
    def nb(dirs):
        for df, dr in dirs:
            if 0 <= f+df < 8 and 0 <= r+dr < 8: out.add(8*(r+dr) + f+df)
    ORT = ((1,0),(-1,0),(0,1),(0,-1)); DIA = ((1,1),(1,-1),(-1,1),(-1,-1))
    if kind == 2: nb(ORT)
    if kind == 4: nb(DIA)
    if kind == 5: nb(ORT + DIA)
    if kind == 3: out.update(knight(t))
    back = 1 if black else -1       # a black pawn comes from the rank above
    if kind == 1 or (kind >= 2 and r == (0 if black else 7)):   # pawn move, or promotion on the last rank
        nb(((0, back), (1, back), (-1, back)))
    return out

def contact_rule(X, iy, iz, ie, ia, terms):
    out = double_check_rule(X, iy, iz, ie, ia, terms)
    for j, (c, k, t, labs, btw) in enumerate(terms):
        if len(btw) == 0:
            for l in labs:
                co = {iy + j: 1, X(t, l): 1}
                for u in origins(t, l):
                    co[X(u, 0)] = co.get(X(u, 0), 0) - 1
                out.append((co, -np.inf, 1))
    return out

def with_nogoods(vs):
    def f(X, iy, iz, ie, ia, terms):
        out = contact_rule(X, iy, iz, ie, ia, terms)
        for v in vs:
            out.append(({X(s, v[s]): 1 for s in range(64)}, -np.inf, 63))
        return out
    return f

if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    found = []
    for i in range(n):
        res, v, meta, dt = solve(with_nogoods([f[0] for f in found]))
        X, iy, iz, ie, ia, terms = meta
        att = [(sq(k), sq(t)) for j, (c, k, t, labs, btw) in enumerate(terms) if res.x[iy + j] > 0.5 and v[k] == 11 + c and v[t] in labs]
        print(i, f"log10 {-res.fun/LN10:.6f} dual {-res.mip_dual_bound/LN10:.6f}", fen_board(v), "to move", "W" if res.x[iz] > 0.5 else "B",
              "a", round(res.x[ia]), "checks", att, f"{dt:.0f}s", flush=True)
        found.append((v, bool(res.x[iz] > 0.5), -res.fun, -res.mip_dual_bound))
        pickle.dump(found, open("ilp3.pkl", "wb"))
