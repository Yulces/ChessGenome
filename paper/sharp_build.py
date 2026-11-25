"""Staged construction of games with a pawn captures, b other captures and pi = 3a+2b promotions (2a+b <= 8).
Gadgets on the file pairs (a,b), (c,d), (e,f), (g,h):
  A : the white pawn of file f takes the black pawn of file g; three pawns then promote.
  B2: the black pawn of file g takes a white officer on file f, the white pawn of file f takes a black officer
      on file g; all four pawns of the two files then promote.
  B1: the black pawn of file g advances to g3, the white pawn of file f takes a black officer on file g above it;
      that pawn and the black pawn of file f promote."""
import chess, random, sys, json, time
W, B = chess.WHITE, chess.BLACK
OFF = (chess.ROOK, chess.KNIGHT, chess.BISHOP, chess.QUEEN)

def pawns_on(bd, color, f):
    return sorted([s for s in bd.pieces(chess.PAWN, color) if chess.square_file(s) == f],
                  key=lambda s: chess.square_rank(s), reverse=(color == W))

def stage_capture(color, f, g, victim):
    d = 1 if color == W else -1
    def done(bd, mv, before):
        if not before.is_capture(mv) or before.piece_type_at(mv.from_square) != chess.PAWN: return False
        if before.color_at(mv.from_square) != color: return False
        if chess.square_file(mv.from_square) != f or chess.square_file(mv.to_square) != g: return False
        vt = before.piece_type_at(mv.to_square)
        if (victim == "pawn") != (vt == chess.PAWN): return False
        if victim == "officer" and before.is_en_passant(mv): return False
        r = chess.square_rank(mv.to_square)
        for s in before.pieces(chess.PAWN, not color):              # capturing pawn must be past enemy pawns of file g
            if chess.square_file(s) == g and s != mv.to_square and ((chess.square_rank(s) > r) if color == W else (chess.square_rank(s) < r)):
                if victim == "officer": return False
        return True
    def score(bd):
        ps = pawns_on(bd, color, f)
        if not ps: return -1e6
        p = ps[0]; r = chess.square_rank(p)
        best = 1e6
        for k in range(0, 4):
            rr = r + d * k
            if not (1 <= rr + d <= 6 + (1 if color == W else 0) and 0 <= rr + d <= 7): break
            if k > 0 and bd.piece_at(chess.square(f, rr)) is not None: break
            T = chess.square(g, rr + d)
            if victim == "pawn":
                for s in bd.pieces(chess.PAWN, not color):
                    if chess.square_file(s) == g:
                        dist = (chess.square_rank(s) - (rr + d)) * d
                        if dist >= 0: best = min(best, 20 * dist + 10 * k)
            else:
                ok_rank = all(not (chess.square_file(s) == g and ((chess.square_rank(s) > rr + d) if color == W else (chess.square_rank(s) < rr + d)))
                              for s in bd.pieces(chess.PAWN, not color))
                if not ok_rank: continue
                for t in OFF:
                    for s in bd.pieces(t, not color):
                        dd = chess.square_distance(s, T)
                        best = min(best, 20 * dd + 10 * k)
        return -best
    return ("capture", color, f, g, victim), done, score

def stage_promote(color, g):
    last = 7 if color == W else 0
    d = 1 if color == W else -1
    def done(bd, mv, before):
        return bool(mv.promotion) and not before.is_capture(mv) and before.color_at(mv.from_square) == color and chess.square_file(mv.to_square) == g
    def score(bd):
        ps = pawns_on(bd, color, g)
        if not ps: return -1e6
        p = ps[0]; r = chess.square_rank(p)
        s = -30 * abs(last - r)
        for rr in range(r + d, last + d, d):
            if bd.piece_at(chess.square(g, rr)) is not None: s -= 15
        return s
    return ("promote", color, g), done, score

def stage_block(color, g):
    """The pawn of `color` on file g stands directly in front of the enemy pawn of file g."""
    d = 1 if color == W else -1
    def front(bd):
        ps = pawns_on(bd, color, g); es = pawns_on(bd, not color, g)
        if not ps or not es: return None
        return chess.square_rank(ps[0]), chess.square_rank(es[-1] if False else es[0])
    def done(bd, mv, before):
        fr = front(before)
        return fr is not None and fr[0] == fr[1] - d
    def score(bd):
        fr = front(bd)
        if fr is None: return -1e6
        return -30 * abs(fr[0] - (fr[1] - d))
    return ("block", color, g), done, score

def plan(a, b, pairs=((4, 5), (2, 3), (0, 1), (6, 7))):
    pairs = list(pairs)
    st = []; k = 0
    for _ in range(a):
        f, g = pairs[k]; k += 1
        st += [(x, {f, g}) for x in (stage_capture(W, f, g, "pawn"), stage_promote(W, g), stage_promote(B, f), stage_promote(W, g))]
    for _ in range(b // 2):
        f, g = pairs[k]; k += 1
        st += [(x, {f, g}) for x in (stage_capture(B, g, f, "officer"), stage_capture(W, f, g, "officer"),
               stage_promote(W, g), stage_promote(B, f), stage_promote(W, g), stage_promote(B, f))]
    if b % 2:
        f, g = pairs[k]; k += 1
        st += [(x, {f, g}) for x in (stage_block(B, g), stage_capture(W, f, g, "officer"), stage_promote(W, g), stage_promote(B, f))]
    return st

def run_stage(bd0, done, score, width, depth, rng, files=None):
    beamset = [(0.0, bd0)]
    seen = {bd0._transposition_key()}
    for ply in range(depth):
        cand = []
        for _, bd in beamset:
            for mv in bd.legal_moves:
                is_cap = bd.is_capture(mv)
                if mv.promotion and mv.promotion not in (chess.QUEEN, chess.KNIGHT): continue
                if files is not None and bd.piece_type_at(mv.from_square) == chess.PAWN and chess.square_file(mv.from_square) not in files: continue
                before = bd
                ok_event = done(bd.copy(stack=False) if False else bd, mv, before) if (is_cap or mv.promotion or True) else False
                nb = bd.copy(stack=True); nb.push(mv)
                quiet = any((not nb.is_capture(m)) and not m.promotion for m in nb.legal_moves)
                if ok_event:
                    if not nb.is_game_over(claim_draw=False) and quiet: return nb
                    continue
                if not quiet: continue
                if is_cap or mv.promotion: continue                       # no other captures or promotions
                key = nb._transposition_key()
                if key in seen or nb.is_game_over(claim_draw=False): continue
                seen.add(key)
                cand.append((score(nb) + rng.random(), nb))
        if not cand: return None
        cand.sort(key=lambda x: -x[0])
        beamset = cand[:width]
    return None

def build(a, b, seed=0, pairs=((4, 5), (2, 3), (0, 1), (6, 7))):
    rng = random.Random(seed)
    bd = chess.Board()
    for (name, done, score), files in plan(a, b, pairs):
        nb = None
        for width, depth in ((30, 40), (100, 60)):
            nb = run_stage(bd, done, score, width, depth, rng, files)
            if nb is not None: break
        if nb is None:
            return None, name
        bd = nb
    return bd, None

def counts(san):
    bd = chess.Board(); a = b = pi = 0
    for x in san:
        mv = bd.parse_san(x)
        assert not bd.is_game_over(claim_draw=False)
        if bd.is_capture(mv):
            if bd.is_en_passant(mv) or bd.piece_type_at(mv.to_square) == chess.PAWN: a += 1
            else: b += 1
        pi += bool(mv.promotion); bd.push(mv)
    return a, b, pi, bd

if __name__ == "__main__":
    res = {}
    try: res = json.load(open("sharp_games.json"))
    except FileNotFoundError: pass
    pairs = [(a, b) for a in range(5) for b in range(9) if 2 * a + b <= 8 and (a, b) != (0, 0)]
    for a, b in pairs:
        key = f"{a},{b}"
        if key in res: continue
        t = time.time()
        bd, fail = build(a, b)
        if bd is None:
            print(a, b, "FAILED at", fail, f"{time.time()-t:.0f}s", flush=True); continue
        tmp = chess.Board(); san = []
        for mv in bd.move_stack: san.append(tmp.san(mv)); tmp.push(mv)
        ca, cb, cp, _ = counts(san)
        print(a, b, "->", (ca, cb, cp), "target", 3*a + 2*b, len(san), "plies", f"{time.time()-t:.0f}s", flush=True)
        if (ca, cb, cp) == (a, b, 3*a + 2*b):
            res[key] = san; json.dump(res, open("sharp_games.json", "w"))
