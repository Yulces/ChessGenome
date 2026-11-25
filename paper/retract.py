"""Fallback for proof games: retract one move from the target, reach the predecessor by search, then play the move."""
import chess, json, sys, os, time
from core import *
from genome import enumerate_codes
from proofgame import search, to_san, vec
import proofgame_run as PR

LAB2 = {1: (chess.PAWN, True), 2: (chess.PAWN, False), 3: (chess.ROOK, True), 4: (chess.ROOK, False), 5: (chess.KNIGHT, True),
        6: (chess.KNIGHT, False), 7: (chess.BISHOP, True), 8: (chess.BISHOP, False), 9: (chess.QUEEN, True), 10: (chess.QUEEN, False),
        11: (chess.KING, True), 12: (chess.KING, False)}

def retractions(T):
    """Yield (T1, from, to, promo) such that the move from->to in T1 produces T (possibly with a capture of a knight)."""
    out = []
    for t, x in enumerate(T):
        if not x: continue
        white = (x % 2 == 1)
        kind = (x + 1) // 2
        f, r = t % 8, t // 8
        srcs = []
        if kind == 1:
            d = -1 if white else 1
            if 0 <= r + d <= 7: srcs.append((8*(r + d) + f, False))
            if (white and r == 3) or (not white and r == 4): srcs.append((8*(r + 2*d) + f, False))
            for df in (-1, 1):
                if 0 <= f + df <= 7 and 1 <= r + d <= 6: srcs.append((8*(r + d) + f + df, True))
        else:
            dirs = []
            if kind in (2, 5, 6): dirs += [(1,0),(-1,0),(0,1),(0,-1)]
            if kind in (4, 5, 6): dirs += [(1,1),(1,-1),(-1,1),(-1,-1)]
            if kind == 6: dirs = [(1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)]
            if kind == 3:
                for df, dr in ((1,2),(2,1),(-1,2),(-2,1),(1,-2),(2,-1),(-1,-2),(-2,-1)):
                    if 0 <= f+df < 8 and 0 <= r+dr < 8: srcs += [(8*(r+dr)+f+df, False), (8*(r+dr)+f+df, True)]
            else:
                for df, dr in dirs:
                    ff, rr = f + df, r + dr
                    while 0 <= ff < 8 and 0 <= rr < 8:
                        s = 8*rr + ff
                        if T[s]: break
                        srcs += [(s, False), (s, True)]
                        if kind == 6: break
                        ff += df; rr += dr
        promo = []
        if 3 <= x <= 10 and r == (7 if white else 0):
            d = -1 if white else 1
            promo.append((8 * (r + d) + f, False))
            for df in (-1, 1):
                if 0 <= f + df <= 7: promo.append((8 * (r + d) + f + df, True))
        for s, cap in promo:
            if T[s]: continue
            T1 = list(T); T1[s] = 1 if white else 2; T1[t] = (6 if white else 5) if cap else 0
            out.append((T1, s, t, cap, chess.QUEEN if x in (9, 10) else {3: chess.ROOK, 4: chess.ROOK, 5: chess.KNIGHT, 6: chess.KNIGHT, 7: chess.BISHOP, 8: chess.BISHOP}[x]))
        for s, cap in srcs:
            if T[s]: continue
            T1 = list(T); T1[s] = x; T1[t] = 0
            if cap:
                T1[t] = 6 if white else 5            # captured man: a knight of the other color
            if kind == 1 and not pawn_ok(s): continue
            out.append((T1, s, t, cap, None))
    return out

def doubled(T):
    c = 0
    for x in (1, 2):
        files = [i % 8 for i in range(64) if T[i] == x]
        c += len(files) - len(set(files))
    return c

def attacked_king(T):
    import obstruct
    return bool(obstruct.attackers(T, 0, T.index(11)) or obstruct.attackers(T, 1, T.index(12)))

def try_target(n, S, T, width=int(__import__('os').environ.get('WIDTH', '80'))):
    import obstruct
    cands = [c for c in retractions(T) if not obstruct.obstructed(c[0])]
    cands.sort(key=lambda c: (doubled(c[0]), attacked_king(c[0]), c[3]))
    for T1, s, t, cap, pr in cands[:int(__import__('os').environ.get('NCAND', '6'))]:
        x = T[t]; white = (x % 2 == 1)
        if pr is not None: white = (x % 2 == 1)
        if PR.__dict__.get("obstructed_fn") and PR.obstructed_fn(T1): continue
        def final_ok(v, b, T1=T1, s=s, t=t, pr=pr):
            if v != T1 or b.turn != (chess.WHITE if white else chess.BLACK) or b.is_game_over(claim_draw=False): return False
            mv = chess.Move(s, t, promotion=pr)
            return mv in b.legal_moves
        keep = PR.make_keep(T1)
        b, hist = search(chess.Board(), [], T1, keep, lambda b, mv: True, width=width, plies=250, final_ok=final_ok)
        if b is None: continue
        mv = chess.Move(s, t, promotion=pr); b.push(mv)
        if vec(b) == T:
            return to_san(hist + [mv])
    return None

if __name__ == "__main__":
    import obstruct
    PR_terms = enumerate_codes(10**int(os.environ.get("KMAX", "15")))[1]
    res = json.load(open("proofgames.json"))
    todo = [int(x) for x in sys.argv[1:]]
    for n in todo:
        if str(n) in res: continue
        S, T = PR_terms[n - 1]; T = list(T)
        t0 = time.time()
        san = try_target(n, S, T)
        print(n, S, "found" if san else "NOT FOUND", len(san) if san else "", f"{time.time()-t0:.0f}s", flush=True)
        if san:
            res = json.load(open("proofgames.json")); res[str(n)] = dict(code=S, game=san); json.dump(res, open("proofgames.json", "w"))
