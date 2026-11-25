import chess, json
from core import *
from proofgame import search, to_san, vec
import proofgame_run as PR
from genome import enumerate_codes
_, t15 = enumerate_codes(10**15)
def T_of(desc):
    v = [0]*64; sym = " PpRrNnBbQqKk"
    for tok in desc.split():
        v[idx(tok[1:])] = sym.index(tok[0])
    return v
jobs = {205: ("ka1 Nb1 Kc1 Pb2 pa2", "a2", "b1", chess.ROOK, chess.BLACK),
        352: ("ka1 Kc1 Pa2 Pb5 na6", "b5", "a6", None, chess.WHITE)}
res = json.load(open("proofgames.json"))
for n, (desc, fr, to, pr, side) in jobs.items():
    T1 = T_of(desc); S, T = t15[n - 1]; T = list(T)
    mv = chess.Move(chess.parse_square(fr), chess.parse_square(to), promotion=pr)
    def final_ok(v, b): return v == T1 and b.turn == side and not b.is_game_over(claim_draw=False) and mv in b.legal_moves
    for w, seed in ((80, 0), (200, 1), (400, 2)):
        b, hist = search(chess.Board(), [], T1, PR.make_keep(T1), lambda b, m: True, width=w, plies=300, seed=seed, final_ok=final_ok)
        if b is not None: break
    if b is None: print(n, "NOT FOUND"); continue
    b.push(mv)
    print(n, "found", len(hist) + 1, b.fen(), vec(b) == T)
    if vec(b) == T:
        res[str(n)] = dict(code=S, game=to_san(hist + [mv])); json.dump(res, open("proofgames.json", "w"))
