"""Proof games for genome terms with few men: beam search over legal moves (captures allowed)."""
import chess, random, sys, json, pickle, time
from core import *
from climb import LAB

def vec(b):
    v = [0]*64
    for s, pc in b.piece_map().items(): v[s] = LAB[(pc.piece_type, pc.color)]
    return v
def cheb(a, b): return max(abs(a % 8 - b % 8), abs(a // 8 - b // 8))

def make_score(T, keep):
    """T: target vector or None (then only `keep` matters). keep: function(v) -> bool, men to preserve."""
    tw = T.index(11) if T else None
    tb = T.index(12) if T else None
    tmen = sum(1 for x in T if x) if T else None
    extra_men = [(i, x) for i, x in enumerate(T) if x and x < 11] if T else []
    def score(b, v):
        m = sum(1 for x in v if x)
        s = -100.0 * m
        if T:
            near = 1.0 if m <= tmen + 3 else 0.05
            s -= near * 8.0 * (cheb(v.index(11), tw) + cheb(v.index(12), tb))
            by_label = {}
            for i, x in extra_men: by_label.setdefault(x, []).append(i)
            for x, tsq in by_label.items():
                cands = [j for j in range(64) if v[j] == x]
                if not cands: continue
                if len(tsq) == 1:
                    s -= near * 4.0 * min(cheb(j, tsq[0]) for j in cands)
                else:
                    import numpy as _np
                    from scipy.optimize import linear_sum_assignment as _lsa
                    Cm = _np.array([[cheb(j, i) for j in cands] for i in tsq], dtype=float)
                    r_, c_ = _lsa(Cm)
                    s -= near * 4.0 * Cm[r_, c_].sum() + near * 8.0 * (len(tsq) - len(r_))
        return s
    return score

def search(start, hist0, T, keep, allow, width=60, plies=400, seed=0, final_ok=None):
    rng = random.Random(seed)
    score = make_score(T, keep)
    beamset = [(0.0, start, list(hist0))]
    seen = set()
    for ply in range(plies):
        cand = {}
        for _, b, hist in beamset:
            for mv in b.legal_moves:
                if not allow(b, mv): continue
                b.push(mv)
                key = b._transposition_key()
                if key in seen or key in cand:
                    b.pop(); continue
                v = vec(b)
                if keep(v):
                    if final_ok(v, b):
                        nb = b.copy(stack=True); b.pop()
                        return nb, hist + [mv]
                    if not b.is_game_over(claim_draw=False):
                        cand[key] = (score(b, v) + rng.random(), b.copy(stack=True), hist + [mv])
                b.pop()
        if not cand: return None, None
        beamset = sorted(cand.values(), key=lambda x: -x[0])[:width]
        seen.update(b._transposition_key() for _, b, _ in beamset)
    return None, None

def to_san(moves):
    b = chess.Board(); out = []
    for mv in moves:
        out.append(b.san(mv)); b.push(mv)
    return out

def pawn_rule(f, r):
    """A white pawn on file f, rank <= r (0-based ranks), must stay alive; the pawn on (f,1) never captures."""
    def keep(v):
        return any(v[8*rr + f] == 1 for rr in range(1, r + 1))
    def allow(b, mv):
        if mv.from_square % 8 == f and b.piece_type_at(mv.from_square) == chess.PAWN and b.color_at(mv.from_square):
            if mv.to_square % 8 != f: return False                     # no captures by it
            if mv.to_square // 8 > r: return False
        return True
    return keep, allow

if __name__ == "__main__":
    pass
