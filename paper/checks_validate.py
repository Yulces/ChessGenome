"""Tests of the check conditions (Lemma on checks) and of the attack model of ilp.py on random legal games."""
import random, chess
from core import *
from climb import LAB
from ilp import attack_terms
from ilp3 import origins

def my_attackers(v, color, k):
    """Squares of the men attacking the king of `color` (0 white, 1 black) standing on k, by the ILP attack model."""
    out = []
    for t, labs, btw in attack_terms(color, k):
        if v[t] in labs and all(v[u] == 0 for u in btw):
            out.append((t, len(btw) == 0))
    return out

def run(ngames, maxply, seed):
    rng = random.Random(seed)
    st = dict(positions=0, checks=0, double=0, contact=0, fails=0, model_mismatch=0)
    for g in range(ngames):
        b = chess.Board()
        for ply in range(maxply):
            moves = list(b.legal_moves)
            if not moves: break
            chk = [m for m in moves if b.gives_check(m)]
            mv = rng.choice(chk) if (chk and rng.random() < 0.5) else rng.choice(moves)
            b.push(mv)
            v = [0]*64
            for s, pc in b.piece_map().items(): v[s] = LAB[(pc.piece_type, pc.color)]
            c = 0 if b.turn else 1                       # side to move
            kc, ko = v.index(11 + c), v.index(12 - c)
            mine = my_attackers(v, c, kc)
            ref = set(b.attackers(not b.turn, kc))
            st["model_mismatch"] += (set(t for t, _ in mine) != ref)
            other = my_attackers(v, 1 - c, ko)
            ok = (len(other) == 0) and (len(mine) <= 2) and (sum(1 for _, ct in mine if ct) <= 1)
            for t, ct in mine:
                if ct and not any(v[u] == 0 for u in origins(t, v[t])): ok = False
            st["positions"] += 1; st["checks"] += (len(mine) >= 1); st["double"] += (len(mine) == 2)
            st["contact"] += sum(1 for _, ct in mine if ct); st["fails"] += (not ok)
    return st

if __name__ == "__main__":
    print(run(600, 400, 7))
