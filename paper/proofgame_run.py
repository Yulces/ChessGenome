import chess, json, sys, time, pickle
from core import *
from genome import enumerate_codes
from proofgame import *

sym = " PpRrNnBbQqKk"
c, terms = enumerate_codes(10**int(__import__('os').environ.get('KMAX', '14')))
which = sys.argv[1] if len(sys.argv) > 1 else "test"
results = {}
try: results = json.load(open("proofgames.json"))
except FileNotFoundError: pass

def exact(T):
    return lambda v, b: v == T

def make_keep(T):
    men = [(i, x) for i, x in enumerate(T) if x and x < 11]
    need = {}
    for i, x in men:
        if x > 2: need[x] = need.get(x, 0) + 1
    pw = [(i % 8, i // 8, x) for i, x in men if x <= 2]
    def match(tg, cur, x, spare):
        def reach(c, t):
            (cf, cr), (tf, tr) = c, t
            steps = (tr - cr) if x == 1 else (cr - tr)
            return steps >= 0 and abs(cf - tf) <= min(steps, spare)
        match_of = [None] * len(cur)
        def aug(i, seen):
            for j, c in enumerate(cur):
                if j in seen or not reach(c, tg[i]): continue
                seen.add(j)
                if match_of[j] is None or aug(match_of[j], seen):
                    match_of[j] = i; return True
            return False
        return all(aug(i, set()) for i in range(len(tg)))
    tcount = {}
    for i, x in men: tcount[x] = tcount.get(x, 0) + 1
    def keep(v):
        for x, k in need.items():
            if v.count(x) < k: return False
        for x in (1, 2):
            tg = [(f, r) for f, r, y in pw if y == x]
            if not tg: continue
            enemy = [y for y in v if y and y < 11 and (y % 2) != (x % 2)]
            spare = len(enemy) - sum(k for y, k in tcount.items() if (y % 2) != (x % 2))
            cur = [(i % 8, i // 8) for i in range(64) if v[i] == x]
            if not match(tg, cur, x, max(spare, 0)): return False
        return True
    return keep

def run_term(n, S, T, width=int(__import__('os').environ.get('WIDTH', '60'))):
    men = [(i, x) for i, x in enumerate(T) if x and x < 11]
    t0 = time.time()
    keep = make_keep(T)
    allow = lambda b, mv: True
    b, hist = search(chess.Board(), [], T, keep, allow, width=width, plies=500, seed=int(__import__('os').environ.get('SEED', '0')), final_ok=exact(T))
    dt = time.time() - t0
    if b is None:
        print(n, S, "NOT FOUND", f"{dt:.0f}s", flush=True); return None
    san = to_san(hist)
    print(n, S, "found", len(san), "plies", f"{dt:.0f}s", b.fen(), flush=True)
    return san

if __name__ == '__main__':
    lo, hi = map(int, which.split(":"))
    skip = set(json.load(open("obstructed16.json"))) if __import__("os").path.exists("obstructed16.json") else {113, 178}
    for n in range(lo, hi):
        if n in skip: continue
        S, T = terms[n - 1]
        if str(n) in results: continue
        san = run_term(n, S, list(T))
        if san:
            results[str(n)] = dict(code=S, game=san)
            import fcntl
            with open("proofgames.lock", "w") as lk:
                fcntl.flock(lk, fcntl.LOCK_EX)
                try: old = json.load(open("proofgames.json"))
                except FileNotFoundError: old = {}
                old.update(results); json.dump(old, open("proofgames.json.tmp", "w"))
                __import__("os").replace("proofgames.json.tmp", "proofgames.json")
