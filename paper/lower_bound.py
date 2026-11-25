"""Select the best beam-search result, write the game in SAN, and re-verify it from scratch."""
import glob, pickle, chess, math, json
from core import *
from climb import LAB

def replay(sans):
    b = chess.Board(); caps = proms = 0
    for san in sans:
        assert not b.is_game_over(claim_draw=False)
        mv = b.parse_san(san)
        caps += b.is_capture(mv); proms += bool(mv.promotion)
        b.push(mv)
    v = [0]*64
    for s, pc in b.piece_map().items():
        v[s] = LAB[(pc.piece_type, pc.color)]
    return b, v, caps, proms

if __name__ == "__main__":
    best = max((pickle.load(open(f, "rb")) for f in glob.glob("climb2_*.pkl")), key=lambda x: x[0])
    b = chess.Board(); sans = []
    for mv in best[1]:
        sans.append(b.san(mv)); b.push(mv)
    open("lower_bound_game.txt", "w").write(" ".join(sans) + "\n")
    b2, v, caps, proms = replay(sans)
    S = code(v)
    info = dict(plies=len(sans), caps=caps, proms=proms, fen=b2.board_fen(), digits=len(str(S)), log10=math.log10(S), static=static_ok(v))
    json.dump(info, open("lower_bound.json", "w"))
    print(info)
