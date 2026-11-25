"""Proof-game search toward a target placement, with pawns counted as potential officers."""
import chess, random, json, sys, time, math
import numpy as np
from scipy.optimize import linear_sum_assignment
from core import *
from climb import LAB
from proofgame import vec, to_san

def cheb(a, b): return max(abs(a % 8 - b % 8), abs(a // 8 - b // 8))

def assign_cost(v, T):
    total = 0.0
    for color in (0, 1):
        tg = [(i, x) for i, x in enumerate(T) if x and x < 11 and (x % 2 == 1) == (color == 0)]
        if not tg: continue
        men = [(i, x) for i, x in enumerate(v) if x and x < 11 and (x % 2 == 1) == (color == 0)]
        if len(men) < len(tg): return 1e6
        C = np.full((len(tg), len(men)), 1e4)
        for a, (t, x) in enumerate(tg):
            for b, (s, y) in enumerate(men):
                if y == x:
                    if x <= 2:
                        f, r = s % 8, s // 8; tf, tr = t % 8, t // 8
                        steps = (tr - r) if x == 1 else (r - tr)
                        if steps >= 0 and abs(tf - f) <= steps: C[a, b] = steps + abs(tf - f)
                    else:
                        C[a, b] = cheb(s, t)
                elif y <= 2 and x > 2 and (y % 2) == (x % 2):
                    r = s // 8; last = 7 if y == 1 else 0; f = s % 8
                    enemy = 2 if y == 1 else 1
                    blocked = any(v[8 * q + f] == enemy for q in (range(r + 1, 8) if y == 1 else range(0, r)))
                    C[a, b] = abs(last - r) + cheb(8 * last + f, t) + 3 + (12 if blocked else 0)
        rr, cc = linear_sum_assignment(C)
        total += C[rr, cc].sum()
    return total

def search(T, width=60, plies=500, seed=0, start=None, hist0=()):
    rng = random.Random(seed)
    tmen = sum(1 for x in T if x)
    tw, tb = T.index(11), T.index(12)
    b0 = start.copy(stack=True) if start else chess.Board()
    beamset = [(0.0, b0, list(hist0))]
    seen = set()
    for ply in range(plies):
        cand = {}
        for _, b, hist in beamset:
            for mv in b.legal_moves:
                if mv.promotion and mv.promotion != chess.QUEEN: continue
                b.push(mv)
                key = b._transposition_key()
                if key in seen or key in cand:
                    b.pop(); continue
                v = vec(b)
                if v == T:
                    nb = b.copy(stack=True); b.pop(); return nb, hist + [mv]
                if not b.is_game_over(claim_draw=False):
                    c = assign_cost(v, T)
                    if c < 1e5:
                        m = sum(1 for x in v if x)
                        sc = -10.0 * c - float(__import__('os').environ.get('MW', '60')) * (m - tmen) - 6.0 * (cheb(v.index(11), tw) + cheb(v.index(12), tb)) + rng.random()
                        cand[key] = (sc, b.copy(stack=True), hist + [mv])
                b.pop()
        if not cand: return None, None
        beamset = sorted(cand.values(), key=lambda x: -x[0])[:width]
        seen.update(x[1]._transposition_key() for x in beamset)
    return None, None

if __name__ == "__main__":
    d = json.load(open("ilp_m.json"))
    res = {}
    try: res = json.load(open("max_m_games.json"))
    except FileNotFoundError: pass
    ms = [int(x) for x in sys.argv[1:]]
    import os
    START = None; HIST = ()
    if os.environ.get("FROM_MAX"):
        sans = open("max_reachable_game.txt").read().split()[:int(os.environ["FROM_MAX"])]
        START = chess.Board(); HIST = []
        for x in sans:
            mv = START.parse_san(x); HIST.append(mv); START.push(mv)
    for m in ms:
        if str(m) in res: continue
        T = d[str(m)]["v"]
        t = time.time()
        b, hist = None, None
        for w, seed in ((60, 0), (150, 1)):
            b, hist = search(T, width=w, seed=seed, start=START, hist0=HIST)
            if b is not None: break
        if b is None:
            print(m, "NOT FOUND", f"{time.time()-t:.0f}s", flush=True); continue
        san = to_san(hist)
        res = json.load(open("max_m_games.json")) if __import__("os").path.exists("max_m_games.json") else {}
        res[str(m)] = san; json.dump(res, open("max_m_games.json", "w"))
        print(m, "found", len(san), "plies", f"{time.time()-t:.0f}s", b.fen(), flush=True)
