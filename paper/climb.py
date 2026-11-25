"""Beam search over legal games for a reachable placement with a large code (certified lower bound)."""
import chess, math, sys, pickle, random
from core import LOG, LN10
LAB = {(chess.PAWN, True): 1, (chess.PAWN, False): 2, (chess.ROOK, True): 3, (chess.ROOK, False): 4,
       (chess.KNIGHT, True): 5, (chess.KNIGHT, False): 6, (chess.BISHOP, True): 7, (chess.BISHOP, False): 8,
       (chess.QUEEN, True): 9, (chess.QUEEN, False): 10, (chess.KING, True): 11, (chess.KING, False): 12}
def Lval(board):
    return sum(LAB[(pc.piece_type, pc.color)] * LOG[s] for s, pc in board.piece_map().items())

def beam(width, plies, seed=0):
    rng = random.Random(seed)
    start = chess.Board()
    beamset = [(Lval(start), start, [])]
    best = (Lval(start), [], start.board_fen())
    seen = set()
    for ply in range(plies):
        cand = {}
        for L, b, hist in beamset:
            if b.is_game_over(claim_draw=False):
                continue
            for mv in b.legal_moves:
                b.push(mv)
                key = b._transposition_key()
                if key not in seen and key not in cand:
                    cand[key] = (Lval(b) + rng.random()*1e-6, b.copy(stack=False), hist + [mv])
                b.pop()
        if not cand:
            break
        ordered = sorted(cand.values(), key=lambda x: -x[0])
        beamset = ordered[:width]
        for k in list(cand)[:0]: pass
        seen.update(b._transposition_key() for _, b, _ in beamset)
        if beamset[0][0] > best[0]:
            best = (beamset[0][0], beamset[0][2], beamset[0][1].board_fen())
        if ply % 25 == 0:
            print(ply, f"{beamset[0][0]/LN10:.2f}", beamset[0][1].board_fen(), flush=True)
    return best

if __name__ == "__main__":
    w, p = int(sys.argv[1]), int(sys.argv[2])
    best = beam(w, p)
    print("BEST log10", best[0]/LN10, best[2], len(best[1]))
    pickle.dump(best, open(f"climb_{w}_{p}.pkl", "wb"))
