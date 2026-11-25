"""Independent exact solution of the same integer program with CP-SAT (integer arithmetic).
Objective coefficients are label * round(10^9 ln p); the rounding error of any placement is below 2.6e-7."""
import sys, pickle, math
from ortools.sat.python import cp_model
from core import *
from ilp import attack_terms
from ilp3 import origins

SCALE = 10**9
W = [round(SCALE * LOG[s]) for s in range(64)]

def solve(forbid=(), workers=2, tl=1200, men=None):
    m = cp_model.CpModel()
    x = [[m.NewBoolVar(f"x{s}_{l}") for l in range(13)] for s in range(64)]
    for s in range(64):
        m.AddExactlyOne(x[s])
        if not pawn_ok(s):
            m.Add(x[s][1] == 0); m.Add(x[s][2] == 0)
    m.Add(sum(x[s][11] for s in range(64)) == 1)
    m.Add(sum(x[s][12] for s in range(64)) == 1)
    for s in range(64):
        for t in range(64):
            if adjacent(s, t): m.AddBoolOr([x[s][11].Not(), x[t][12].Not()])
    z = [m.NewBoolVar("zW"), m.NewBoolVar("zB")]
    m.Add(z[0] + z[1] == 1)
    ys = {0: [], 1: []}; contact = {0: [], 1: []}
    for c in (0, 1):
        for k in range(64):
            for t, labs, btw in attack_terms(c, k):
                y = m.NewBoolVar("")
                att = m.NewBoolVar("")
                m.Add(sum(x[t][l] for l in labs) == att)
                lits = [x[k][11 + c], att] + [x[u][0] for u in btw]
                m.AddBoolOr([l.Not() for l in lits] + [y])       # all true => y
                ys[c].append(y)
                if not btw:
                    contact[c].append(y)
                    for l in labs:                                 # contact checker needs an empty origin
                        m.AddBoolOr([y.Not(), x[t][l].Not()] + [x[u][0] for u in origins(t, l)])
        m.Add(sum(ys[c]) <= 2 * z[c])
        m.Add(sum(contact[c]) <= 1)
    init = {3: 2, 5: 2, 7: 2, 9: 1}
    es = []
    for c in (0, 1):
        ec = []
        for base in (3, 5, 7, 9):
            e = m.NewIntVar(0, 8, "")
            m.Add(e >= sum(x[s][base + c] for s in range(64)) - init[base])
            ec.append(e)
        m.Add(sum(ec) + sum(x[s][1 + c] for s in range(64)) <= 8)
        es += ec
    E = sum(x[s][0] for s in range(64))
    Pn = sum(x[s][1] + x[s][2] for s in range(64))
    a = m.NewIntVar(0, 16, "a")
    m.Add(a <= E - 32)
    m.Add(sum(es) + Pn + a <= 16)
    m.Add(16 - Pn - a <= a + 2 * E - 64)
    if men is not None:
        m.Add(sum(x[s][0] for s in range(64)) == 64 - men)
    for v in forbid:
        m.AddBoolOr([x[s][v[s]].Not() for s in range(64)])
    m.Maximize(sum(l * W[s] * x[s][l] for s in range(64) for l in range(1, 13)))
    sol = cp_model.CpSolver()
    sol.parameters.num_search_workers = workers
    sol.parameters.max_time_in_seconds = tl
    st = sol.Solve(m)
    v = [max(range(13), key=lambda l: sol.Value(x[s][l])) for s in range(64)]
    return sol.StatusName(st), int(sol.ObjectiveValue()), int(sol.BestObjectiveBound()), v, sol.Value(z[0])

if __name__ == "__main__":
    st, obj, bound, v, zw = solve()
    print("CP-SAT", st, "objective", obj, "bound", bound, "FEN", fen_board(v), "to move", "W" if zw else "B", flush=True)
    st2, obj2, bound2, v2, _ = solve(forbid=[v])
    print("second best", st2, obj2, bound2, fen_board(v2), "difference", obj - obj2)
    pickle.dump(dict(st=st, obj=obj, bound=bound, v=v, st2=st2, obj2=obj2, bound2=bound2, v2=v2), open("cpsat.pkl", "wb"))
