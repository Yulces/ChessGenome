"""Lemma 14 as a test: a placement violating (K1)-(K3) for both choices of the side to move is unreachable."""
from core import *
from ilp import attack_terms
from ilp3 import origins

def attackers(v, color, k):
    out = []
    for t, labs, btw in attack_terms(color, k):
        if v[t] in labs and all(v[u] == 0 for u in btw):
            out.append((t, len(btw) == 0))
    return out

def ok_with_mover(v, c):
    """c = 0: White to move, 1: Black to move."""
    kc, ko = v.index(11 + c), v.index(12 - c)
    if attackers(v, 1 - c, ko): return False                          # (K1)
    at = attackers(v, c, kc)
    if len(at) > 2 or sum(1 for _, ct in at if ct) > 1: return False    # (K2)
    for t, ct in at:
        if ct and not any(v[u] == 0 for u in origins(t, v[t])): return False   # (K3)
    return True

def obstructed(v):
    return not ok_with_mover(v, 0) and not ok_with_mover(v, 1)
