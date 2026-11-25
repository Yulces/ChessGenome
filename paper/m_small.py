"""Games attaining U(m) for small m: staged black promotions, then a target-driven search."""
import chess, json, sys, time, random
import sharp_build as SB
from sharp_general import stage_take_pawn
import target_search as TS
from proofgame import to_san, vec
W, B = chess.WHITE, chess.BLACK
FILES = [7, 6, 5, 4, 3, 2, 1, 0]

def promotions_phase(k, seed=0):
    rng = random.Random(seed); bd = chess.Board()
    for f in FILES[:k]:
        for (name, done, score) in (stage_take_pawn(W, f), SB.stage_promote(B, f)):
            nb = None
            for width, depth in ((30, 40), (100, 60)):
                nb = SB.run_stage(bd, done, score, width, depth, rng, {f})
                if nb is not None: break
            if nb is None: return None, name
            bd = nb
    return bd, None

if __name__ == "__main__":
    d = json.load(open("ilp_m.json"))
    res = json.load(open("max_m_games.json"))
    for m in [int(x) for x in sys.argv[1:]]:
        if str(m) in res: continue
        t = time.time()
        T = d[str(m)]["v"]
        nq = T.count(10)
        bd, fail = promotions_phase(nq - 1)
        if bd is None: print(m, "promotions FAILED", fail, flush=True); continue
        found = None
        import proofgame as PG, proofgame_run as PR
        keep = PR.make_keep(T)
        for w, seed in ((60, 0), (150, 1)):
            nb, hist = PG.search(bd, list(bd.move_stack), T, keep, lambda b, mv: not mv.promotion, width=w, plies=400, seed=seed,
                                 final_ok=lambda v, b: v == T)
            if nb is not None: found = hist; break
        if found is None: print(m, "arrangement NOT FOUND", f"{time.time()-t:.0f}s", flush=True); continue
        san = to_san(found)
        res = json.load(open("max_m_games.json")); res[str(m)] = san; json.dump(res, open("max_m_games.json", "w"))
        print(m, "found", len(san), "plies", f"{time.time()-t:.0f}s", flush=True)
