"""Certified lower bound for max S over reachable placements: scripted opening with four pawn-takes-pawn
captures, then a capture-free beam search that promotes the twelve remaining pawns and pushes the men upward."""
import chess, math, sys, pickle, random
from core import LOG, LN10
from climb import LAB, Lval

MU = float(__import__("os").environ.get("MU", "0"))
OPEN = __import__("os").environ.get("OPENING", "a4 b5 axb5 c5 d4 cxd4 e4 f5 exf5 g5 h4 gxh4")

def score(b, lam):
    s = 0.0
    for sqr, pc in b.piece_map().items():
        if pc.piece_type == chess.PAWN:
            r = chess.square_rank(sqr)
            adv = (r - 1) if pc.color else (6 - r)
            pot = (9 if pc.color else 10) * LOG[56 + chess.square_file(sqr)] if False else 0
            f = chess.square_file(sqr)
            ahead = range(r + 1, 8) if pc.color else range(0, r)
            blockers = sum(1 for rr in ahead if b.piece_at(chess.square(f, rr)) is not None)
            s += LAB[(pc.piece_type, pc.color)] * LOG[sqr] + lam * (adv - 6) - MU * blockers
        else:
            s += LAB[(pc.piece_type, pc.color)] * LOG[sqr]
    return s

def beam(width, plies, lam, seed=0):
    rng = random.Random(seed)
    b0 = chess.Board()
    hist0 = []
    for san in OPEN.split():
        mv = b0.parse_san(san); hist0.append(mv); b0.push(mv)
    beamset = [(score(b0, lam), b0, hist0)]
    best = (Lval(b0), list(hist0), b0.fen())
    seen = set()
    for ply in range(plies):
        cand = {}
        for sc, b, hist in beamset:
            if b.is_game_over(claim_draw=False):
                continue
            for mv in b.legal_moves:
                if b.is_capture(mv):
                    continue
                if mv.promotion and mv.promotion != chess.QUEEN:
                    continue
                b.push(mv)
                key = b._transposition_key()
                if key not in seen and key not in cand and not b.is_game_over(claim_draw=False):
                    cand[key] = (score(b, lam) + rng.random()*1e-6, b.copy(stack=True), hist + [mv])
                b.pop()
        if not cand:
            break
        beamset = sorted(cand.values(), key=lambda x: -x[0])[:width]
        seen.update(b._transposition_key() for _, b, _ in beamset)
        for sc, b, hist in beamset[:5]:
            L = Lval(b)
            if L > best[0]:
                best = (L, hist, b.fen())
        if ply % 40 == 0:
            tb = beamset[0][1]
            print(ply, f"L10={Lval(tb)/LN10:.2f}", tb.board_fen(), flush=True)
    return best

if __name__ == "__main__":
    w, p, lam = int(sys.argv[1]), int(sys.argv[2]), float(sys.argv[3])
    best = beam(w, p, lam)
    print("BEST log10", best[0]/LN10, best[2], len(best[1]))
    pickle.dump(best, open(f"climb2_{w}_{p}_{lam}" + __import__("os").environ.get("TAG", "") + ".pkl", "wb"))
