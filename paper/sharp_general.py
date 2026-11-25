"""For each a = 0..16, one game that passes through moments with a pawn captures, b other captures and
min(3a+2b, 16-a) promotions for every b with a+b <= 30 and 2a+b >= 8 (the range 2a+b <= 8 is covered by
sharp_games.json)."""
import chess, random, sys, json, time
import sharp_build as SB
from proofgame import search as pg_search, vec
W, B = chess.WHITE, chess.BLACK

def stage_take_pawn(victim, f):
    """A pawn of colour `victim` on file f is taken by an enemy man that is not a pawn."""
    def done(bd, mv, before):
        return (before.is_capture(mv) and not before.is_en_passant(mv) and before.piece_type_at(mv.to_square) == chess.PAWN
                and before.color_at(mv.to_square) == victim and chess.square_file(mv.to_square) == f
                and before.piece_type_at(mv.from_square) != chess.PAWN)
    def score(bd):
        ps = SB.pawns_on(bd, victim, f)
        if not ps: return -1e6
        best = 1e6
        for p in ps:
            for t in (chess.ROOK, chess.KNIGHT, chess.BISHOP, chess.QUEEN, chess.KING):
                for s in bd.pieces(t, not victim):
                    best = min(best, chess.square_distance(s, p))
        return -20 * best
    return ("take_pawn", victim, f), done, score

def plan_general(a, pairs=((4, 5), (2, 3), (0, 1), (6, 7))):
    js = [1, 1, 1, 1]; rest = a - 4; i = 0
    while rest > 0:
        if js[i] < 4: js[i] += 1; rest -= 1
        else: i += 1
    st = []
    for (f, g), j in zip(pairs, js):
        F = {f, g}
        if j == 1:
            seq = [SB.stage_capture(W, f, g, "pawn"), SB.stage_promote(W, g), SB.stage_promote(B, f), SB.stage_promote(W, g)]
        elif j == 2:
            seq = [stage_take_pawn(B, f), stage_take_pawn(B, g), SB.stage_promote(W, f), SB.stage_promote(W, g)]
        elif j == 3:
            seq = [stage_take_pawn(B, f), stage_take_pawn(B, g), stage_take_pawn(W, f), SB.stage_promote(W, g)]
        else:
            seq = [stage_take_pawn(B, f), stage_take_pawn(B, g), stage_take_pawn(W, f), stage_take_pawn(W, g)]
        st += [(x, F) for x in seq]
    return st

def run_plan(stages, seed=0):
    rng = random.Random(seed)
    bd = chess.Board()
    for (name, done, score), files in stages:
        nb = None
        for width, depth in ((30, 40), (100, 60)):
            nb = SB.run_stage(bd, done, score, width, depth, rng, files)
            if nb is not None: break
        if nb is None: return None, name
        bd = nb
    return bd, None

def tail(bd, seed=0):
    """Capture everything except the kings; no pawns are left at this point."""
    assert not bd.pieces(chess.PAWN, W) and not bd.pieces(chess.PAWN, B)
    only_kings = lambda v, b: sum(1 for x in v if x) == 2
    for w in (60, 200):
        nb, hist = pg_search(bd, list(bd.move_stack), None, lambda v: True, lambda b, mv: True, width=w, plies=300,
                             seed=seed, final_ok=only_kings)
        if nb is not None: return hist
    return None

def timeline(san):
    bd = chess.Board(); a = b = pi = 0; seen = {(0, 0, 0)}
    for i, x in enumerate(san):
        assert not bd.is_game_over(claim_draw=False), i
        mv = bd.parse_san(x)
        if bd.is_capture(mv):
            if bd.is_en_passant(mv) or bd.piece_type_at(mv.to_square) == chess.PAWN: a += 1
            else: b += 1
        pi += bool(mv.promotion); bd.push(mv); seen.add((a, b, pi))
    return seen

if __name__ == "__main__":
    sharp = json.load(open("sharp_games.json"))
    out = {}
    try: out = json.load(open("general_games.json"))
    except FileNotFoundError: pass
    for a in [int(x) for x in sys.argv[1:]]:
        if str(a) in out: continue
        t = time.time()
        if a <= 4:
            bd = chess.Board()
            for x in sharp[f"{a},{8 - 2*a}"]: bd.push_san(x)
        else:
            bd = None
            for order in ((4, 5), (2, 3), (0, 1), (6, 7)), ((0, 1), (2, 3), (4, 5), (6, 7)), ((6, 7), (4, 5), (2, 3), (0, 1)):
                for seed in (0, 1):
                    bd, fail = run_plan(plan_general(a, order), seed)
                    if bd is not None: break
                if bd is not None: break
            if bd is None: print(a, "pattern phase FAILED", fail, flush=True); continue
        hist = tail(bd)
        if hist is None: print(a, "tail FAILED", flush=True); continue
        tmp = chess.Board(); san = []
        for mv in hist: san.append(tmp.san(mv)); tmp.push(mv)
        seen = timeline(san)
        need = [(a, b, 16 - a) for b in range(max(0, 8 - 2 * a), 31 - a)]
        miss = [x for x in need if x not in seen]
        print(a, len(san), "plies", "missing", miss, f"{time.time()-t:.0f}s", flush=True)
        if not miss:
            out = json.load(open("general_games.json")) if __import__("os").path.exists("general_games.json") else {}
            out[str(a)] = san; json.dump(out, open("general_games.json", "w"))
