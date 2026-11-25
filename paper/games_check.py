"""Empirical test of the capture lemma and of static admissibility on random legal games."""
import random, chess, math, pickle
from core import *
from bounds import capture_feasible

LAB = {(chess.PAWN, True): 1, (chess.PAWN, False): 2, (chess.ROOK, True): 3, (chess.ROOK, False): 4,
       (chess.KNIGHT, True): 5, (chess.KNIGHT, False): 6, (chess.BISHOP, True): 7, (chess.BISHOP, False): 8,
       (chess.QUEEN, True): 9, (chess.QUEEN, False): 10, (chess.KING, True): 11, (chess.KING, False): 12}

def vec(board):
    v = [0]*64
    for s, pc in board.piece_map().items():
        v[s] = LAB[(pc.piece_type, pc.color)]
    return v

def run(ngames, maxply, seed, bound_log):
    rng = random.Random(seed)
    stats = dict(positions=0, promotions=0, captures=0, maxpi=0, max_excess=0, maxlog=0.0, fails=0, tight=0)
    for g in range(ngames):
        board = chess.Board()
        a = b = pi = 0
        for ply in range(maxply):
            moves = list(board.legal_moves)
            if not moves:
                break
            r = rng.random()
            pool = moves
            if r < 0.45:
                sel = [m for m in moves if m.promotion or board.is_capture(m)]
                pool = sel or moves
            elif r < 0.8:
                sel = [m for m in moves if board.piece_type_at(m.from_square) == chess.PAWN]
                pool = sel or moves
            mv = rng.choice(pool)
            if board.is_capture(mv):
                if board.is_en_passant(mv):
                    a += 1
                elif board.piece_type_at(mv.to_square) == chess.PAWN:
                    a += 1
                else:
                    b += 1
            if mv.promotion:
                pi += 1
            board.push(mv)
            v = vec(board)
            Pn = v.count(1) + v.count(2)
            wt = tuple(v.count(l) for l in (1, 3, 5, 7, 9)); bt = tuple(v.count(l) for l in (2, 4, 6, 8, 10))
            L = sum(x*LOG[i] for i, x in enumerate(v) if x)
            ok = (16 == Pn + pi + a) and (pi <= 3*a + 2*b) and (a + b == 32 - sum(1 for x in v if x)) \
                 and static_ok(v) and capture_feasible(wt, bt) and L <= bound_log + 1e-9 \
                 and excess(*wt[1:]) + excess(*bt[1:]) <= pi
            stats["positions"] += 1
            stats["fails"] += (not ok)
            stats["tight"] += (pi == 3*a + 2*b and pi > 0)
            stats["maxpi"] = max(stats["maxpi"], pi)
            stats["max_excess"] = max(stats["max_excess"], excess(*wt[1:]) + excess(*bt[1:]))
            stats["maxlog"] = max(stats["maxlog"], L / LN10)
        stats["promotions"] += pi; stats["captures"] += a + b
    return stats

if __name__ == "__main__":
    res = pickle.load(open("bounds.pkl", "rb"))
    bound = math.log(res["capture"][3])
    print(run(1500, 500, 20261124, bound))
