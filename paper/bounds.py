"""Maximum of S over statically admissible placements, and the capture-refined bound."""
import math, itertools, pickle
from core import *

WL = {1: 3, 2: 5, 3: 7, 4: 9}   # index in tuple -> white label
def labels(t, black):
    Pn, R, N, B, Q = t
    off = [3 + black]*R + [5 + black]*N + [7 + black]*B + [9 + black]*Q
    return sorted(off, reverse=True)

# 1. classes (P, O, e) per side with a pointwise-dominant officer multiset
tuples = side_tuples()
groups = {}
for t in tuples:
    key = (t[0], sum(t[1:]), excess(*t[1:]))
    groups.setdefault(key, []).append(t)
dominant = {}
all_dom = True
for key, ts in groups.items():
    labs = [labels(t, 0) for t in ts]
    top = max(labs)                       # lexicographic max of sorted lists
    if not all(all(a >= b for a, b in zip(top, l)) for l in labs):
        all_dom = False
    dominant[key] = ts[labs.index(top)]

SORTED_LOG = sorted(LOG, reverse=True)
PREF = [0.0]
for x in SORTED_LOG: PREF.append(PREF[-1] + x)

def relaxed(wt, bt):
    """Upper bound: ignore king adjacency and pawn ranks (sorted assignment)."""
    labs = sorted([11, 12] + labels(wt, 0) + labels(bt, 1) + [1]*wt[0] + [2]*bt[0], reverse=True)
    return sum(l * x for l, x in zip(labs, SORTED_LOG))

def capture_feasible(wt, bt):
    """Necessary condition for reachability (capture lemma)."""
    Pn = wt[0] + bt[0]
    e = excess(*wt[1:]) + excess(*bt[1:])
    m = 2 + sum(wt) + sum(bt)
    c = 32 - m
    lo = max(0, -(-(16 - Pn) // 2) - c)
    hi = min(c, 16 - Pn - e)
    return lo <= hi

def maximise(filter_fn):
    cands = []
    for kw, wt in dominant.items():
        for kb, bt in dominant.items():
            if filter_fn(wt, bt):
                cands.append((relaxed(wt, bt), wt, bt))
    cands.sort(reverse=True)
    best = (-1.0, None, None, None)
    examined = 0
    for U, wt, bt in cands:
        if U < best[0] - 1e-9:
            break
        examined += 1
        val, v = best_placement(wt, bt)
        if val > best[0]:
            best = (val, v, wt, bt)
    return best, examined, len(cands)

if __name__ == "__main__":
    print("classes per side:", len(groups), "| every class has a pointwise-dominant multiset:", all_dom)
    res = {}
    for name, fn in (("static", lambda w, b: True), ("capture", capture_feasible)):
        (val, v, wt, bt), ex, n = maximise(fn)
        S = code(v)
        print(f"\n[{name}] candidates {n}, examined exactly {ex}")
        print("  white (P,R,N,B,Q) =", wt, " black =", bt, " men =", 2 + sum(wt) + sum(bt))
        print("  log10 S =", val / LN10, " ln S =", val, " digits =", len(str(S)))
        print("  static_ok:", static_ok(v), " FEN:", fen_board(v))
        print("  kings: black", sq(v.index(12)), "white", sq(v.index(11)))
        res[name] = (v, wt, bt, S)
    pickle.dump(res, open("bounds.pkl", "wb"))
