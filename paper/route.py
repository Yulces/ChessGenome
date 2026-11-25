"""Beam search for a legal, capture-free continuation that rearranges the men into a target placement."""
import chess, pickle, sys, random, math, json
from core import *
from climb import LAB, Lval

def vec(b):
    v = [0]*64
    for s, pc in b.piece_map().items(): v[s] = LAB[(pc.piece_type, pc.color)]
    return v
W = {7: 1000.0, 6: 300.0, 5: 100.0, 4: 30.0}
def cheb(a, b): return max(abs(a % 8 - b % 8), abs(a // 8 - b // 8))

def make_score(T, final_sq, final_lab, staging):
    tk_w, tk_b = T.index(11), T.index(12)
    sh_w = [i for i in range(64) if adjacent(i, tk_w)]
    sh_b = [i for i in range(64) if adjacent(i, tk_b)]
    def score(b):
        v = vec(b)
        home_w, home_b = v[tk_w] == 11, v[tk_b] == 12
        s = 0.0
        ok_rest = True
        for i in range(64):
            if T[i] == 0 or i == final_sq: continue
            guard = (i in sh_w and not home_w) or (i in sh_b and not home_b)
            if guard:
                ok_rest = False
                if v[i] != 0 and v[i] < 11: s -= 300.0
                continue
            if v[i] == T[i]:
                s += W.get(i // 8, 10.0) * (1.0 if (home_w and home_b) else 0.0) + (2000.0 if (i in sh_w or i in sh_b) else 0.0)
            else:
                ok_rest = False
                if v[i] != 0: s -= 120.0
        if v[final_sq] == final_lab:
            s += 500.0 if ok_rest else -400.0
        elif v[final_sq] != 0:
            s -= 50.0
        if any(v[u] == final_lab for u in staging): s += 60.0
        if not home_w:
            s -= 80.0 * sum(1 for i in range(64) if v[i] in (4, 8, 10) and i // 8 >= 4 and i % 8 <= 4)
        if not home_b:
            s -= 80.0 * sum(1 for i in range(64) if v[i] in (3, 7, 9) and i // 8 >= 4 and i % 8 >= 3)
        if not home_w and b.is_attacked_by(chess.BLACK, tk_w): s -= 700.0
        if not home_b and b.is_attacked_by(chess.WHITE, tk_b): s -= 700.0
        s += 6000.0 * (home_w + home_b)
        s -= 400.0 * cheb(v.index(11), tk_w) + 400.0 * cheb(v.index(12), tk_b)
        s += 0.02 * sum(x * LOG[i] for i, x in enumerate(v) if x)
        return s, v
    return score

def beam(start, T, final_sq, final_lab, staging, width, plies, seed=0):
    rng = random.Random(seed)
    score = make_score(T, final_sq, final_lab, staging)
    beamset = [(score(start)[0], start, [])]
    seen = set()
    for ply in range(plies):
        cand = {}
        for sc, b, hist in beamset:
            for mv in b.legal_moves:
                if b.is_capture(mv): continue
                if mv.promotion and mv.promotion != chess.QUEEN: continue
                b.push(mv)
                key = b._transposition_key()
                if key not in seen and key not in cand:
                    s, v = score(b)
                    if v == T:
                        nb = b.copy(stack=True); b.pop()
                        return nb, hist + [mv]
                    if not b.is_game_over(claim_draw=False):
                        cand[key] = (s + rng.random()*1e-3, b.copy(stack=True), hist + [mv])
                b.pop()
        if not cand:
            print("empty at ply", ply, len(beamset)); break
        beamset = []
        for item in sorted(cand.values(), key=lambda x: -x[0]):
            bb = item[1]
            if any((not bb.is_capture(m)) for m in bb.legal_moves):
                beamset.append(item)
                if len(beamset) == width: break
        if not beamset:
            print("dead end at ply", ply); break
        seen.update(b._transposition_key() for _, b, _ in beamset)
        if ply % 10 == 0 or ply < 6:
            tb = beamset[0][1]
            nm = sum(1 for i in range(64) if T[i] and vec(tb)[i] == T[i])
            print(ply, len(cand), f"score {beamset[0][0]:.1f} matched {nm}/{sum(1 for x in T if x)} clock {tb.halfmove_clock}", tb.board_fen(), flush=True)
    return None, None

if __name__ == "__main__":
    which, width, plies = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
    cut = int(sys.argv[4]) if len(sys.argv) > 4 else None
    found = pickle.load(open("ilp3.pkl", "rb"))
    T = found[which][0]
    sans = open("lower_bound_game.txt").read().split()
    b = chess.Board(); last_prom = 0
    for i, san in enumerate(sans):
        mv = b.parse_san(san)
        if mv.promotion: last_prom = i + 1
        b.push(mv)
    cutply = cut if cut is not None else last_prom
    b = chess.Board(); hist0 = []
    for san in sans[:cutply]:
        mv = b.parse_san(san); hist0.append(mv); b.push(mv)
    print("start after ply", cutply, b.fen(), "target", fen_board(T))
    final_sq = idx("b6"); staging = [idx("a4"), idx("c4"), idx("d5")]
    nb, hist = beam(b, T, final_sq, 6, staging, width, plies)
    if nb is None:
        print("NOT FOUND")
    else:
        full = hist0 + hist
        bb = chess.Board(); out = []
        for mv in full:
            out.append(bb.san(mv)); bb.push(mv)
        print("FOUND", len(full), "plies", bb.fen())
        open("max_reachable_game.txt" if which == 0 else f"route_{which}.txt", "w").write(" ".join(out) + "\n")
