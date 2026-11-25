#!/usr/bin/env python3
"""Verification log for 'The Chess Genome'.  Run: python3 verify.py
Labels: [exact] integer/rational arithmetic; [numeric] IEEE double, tolerance stated; [search] exhaustive finite search."""
import math, random, pickle, json, time, os
from fractions import Fraction
import numpy as np
from scipy.optimize import linear_sum_assignment
import chess
from core import *
import bounds, counting, genome, games_check

NPASS = NFAIL = 0
def check(kind, name, cond, detail=""):
    global NPASS, NFAIL
    NPASS += bool(cond); NFAIL += (not cond)
    print(f"[{'PASS' if cond else 'FAIL'}] [{kind}] {name}" + (f" | {detail}" if detail else ""), flush=True)

t0 = time.time()
print("=" * 78); print("1. Primes and metadata tables"); print("=" * 78)
check("exact", "p_64 = 311, p_65 = 313", P[63] == 311 and P[64] == 313)
cast = {(w, b): P[64 + w + 4*b] for w in range(4) for b in range(4) if (w, b) != (0, 0)}
tab = [317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409]
check("exact", "castling primes p_{65+w+4b}, (w,b) != (0,0), are 317..409 in table order",
      [cast[(w, b)] for b in range(4) for w in range(4) if (w, b) != (0, 0)] == tab)
ep = [P[80 + j] for j in range(16)]
check("exact", "en-passant primes p_81..p_96 are 419..503",
      ep == [419, 421, 431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503])
F = 313 * 409 * 503
check("exact", "largest metadata factor 313*409*503 = 64392551 < 10^8", F == 64392551)

print("=" * 78); print("2. Injectivity, minimum"); print("=" * 78)
rng = random.Random(1)
seen = {}
ok = True
for _ in range(20000):
    v = tuple(rng.choice([0]*6 + list(range(13))) for _ in range(64))
    s = code(v)
    if s in seen and seen[s] != v: ok = False
    seen[s] = v
check("exact", "no collision of S among 20000 random label vectors (sanity check of Thm 3)", ok)
kmin = min(KING_PAIRS, key=lambda bw: BOARD[bw[0]]**12 * BOARD[bw[1]]**11)
check("search", "min of p_b^12 p_w^11 over all 3612 ordered non-adjacent king pairs is at (a1, c1)",
      (sq(kmin[0]), sq(kmin[1])) == ("a1", "c1"))
check("exact", "S_min = 2^12 * 5^11 = 200000000000", 2**12 * 5**11 == 200000000000)
check("exact", "number of ordered non-adjacent king pairs = 3612 = (n-1)(n-2)(n^2+3n-2) at n = 8",
      len(KING_PAIRS) == 3612 == 7*6*(64 + 24 - 2))

print("=" * 78); print("3. Maximum over statically admissible placements (Thm 8)"); print("=" * 78)
check("search", "each of the 324 classes (P, O, e) of one side has a pointwise-dominant officer multiset",
      bounds.all_dom and len(bounds.groups) == 324)
(val, v, wt, bt), ex, n = bounds.maximise(lambda w, b: True)
Smax = code(v)
check("search", "maximiser has material K+9Q+2R+2B+2N per side", wt == bt == (0, 2, 2, 2, 9), f"{n} class pairs, FEN {fen_board(v)}")
check("exact", "maximiser is statically admissible, kings on h8 (black) and f8 (white)",
      static_ok(v) and sq(v.index(12)) == "h8" and sq(v.index(11)) == "f8")
check("exact", "S_max has 614 decimal digits", len(str(Smax)) == 614, f"log10 = {math.log10(Smax):.6f}, ln = {math.log(Smax):.6f}")
Sx, vx = best_placement_exact(wt, bt)
check("exact", "integer comparison of the 3612 king placements confirms the maximiser (no floating point)", Sx == Smax and vx == v)
second = sorted((bounds.relaxed(w, b) for w in bounds.dominant.values() for b in bounds.dominant.values()), reverse=True)[1]
check("numeric", "relaxed bound of every other class pair is below the exact optimum (margin > 1)",
      second < val - 1, f"runner-up relaxed ln = {second:.4f} < {val:.4f}")

def hungarian(wt, bt, pairs):
    labs = [3]*wt[1] + [5]*wt[2] + [7]*wt[3] + [9]*wt[4] + [4]*bt[1] + [6]*bt[2] + [8]*bt[3] + [10]*bt[4] + [1]*wt[0] + [2]*bt[0]
    best = -1.0
    for (b, w) in pairs:
        free = [i for i in range(64) if i not in (b, w)]
        M = np.array([[(-1e6 if (l <= 2 and not pawn_ok(i)) else l * LOG[i]) for i in free] for l in labs])
        r, c = linear_sum_assignment(M, maximize=True)
        best = max(best, M[r, c].sum() + 12*LOG[b] + 11*LOG[w])
    return best
hv = hungarian(wt, bt, KING_PAIRS)
check("numeric", "Hungarian optimum over all 3612 king pairs equals the greedy optimum (tol 1e-9)", abs(hv - val) < 1e-9, f"{hv:.9f}")
okg = True; trials = 0
tl = bounds.tuples
for _ in range(300):
    w, b = rng.choice(tl), rng.choice(tl)
    pairs = rng.sample(KING_PAIRS, 4)
    g = best_placement(w, b, kings=pairs)[0]
    h = hungarian(w, b, pairs)
    trials += 1
    if abs(g - h) > 1e-9: okg = False
check("numeric", "greedy placement = Hungarian optimum on random material and king pairs (tol 1e-9)", okg, f"{trials} instances x 4 king pairs")
okr = True; cnt = 0
while cnt < 20000:
    w, b = rng.choice(tl), rng.choice(tl)
    bk, wk = rng.choice(KING_PAIRS)
    vv = [0]*64; vv[bk], vv[wk] = 12, 11
    men = [3]*w[1] + [5]*w[2] + [7]*w[3] + [9]*w[4] + [4]*b[1] + [6]*b[2] + [8]*b[3] + [10]*b[4]
    free = [i for i in range(64) if i not in (bk, wk)]; rng.shuffle(free)
    for l in men: vv[free.pop()] = l
    pf = [i for i in free if pawn_ok(i)]
    for l in [1]*w[0] + [2]*b[0]: vv[pf.pop()] = l
    assert static_ok(vv)
    cnt += 1
    if code(vv) > Smax: okr = False
check("exact", "no random statically admissible placement exceeds S_max", okr, f"{cnt} instances")

print("=" * 78); print("4. Capture lemma and the bound for reachable positions (Lemma 11, Prop 13)"); print("=" * 78)
(valc, vc, wtc, btc), exc, nc = bounds.maximise(bounds.capture_feasible)
Scap = code(vc)
check("search", "capture-feasible maximiser: White K+7Q+2B+2N, Black K+9Q+2B+2N, 26 men",
      wtc == (0, 0, 2, 2, 7) and btc == (0, 0, 2, 2, 9), f"{nc} feasible class pairs, FEN {fen_board(vc)}")
check("exact", "S_cap has 543 decimal digits, hence S < 10^543 for every reachable placement", len(str(Scap)) == 543,
      f"log10 = {math.log10(Scap):.6f}, ln = {math.log(Scap):.6f}")
Sxc, vxc = best_placement_exact(wtc, btc)
check("exact", "integer comparison of the 3612 king placements confirms B* (no floating point)", Sxc == Scap and vxc == vc)
cl = sorted((bounds.relaxed(w, b) for w in bounds.dominant.values() for b in bounds.dominant.values() if bounds.capture_feasible(w, b)), reverse=True)
check("numeric", "relaxed bound of every other feasible class pair is below ln S* (margin > 1)", cl[1] < valc - 1, f"runner-up relaxed ln = {cl[1]:.4f} < {valc:.4f}")
hc = hungarian(wtc, btc, KING_PAIRS)
check("numeric", "Hungarian cross-check of S_cap (tol 1e-9)", abs(hc - valc) < 1e-9)
st = games_check.run(1500, 500, 20261124, math.log(Scap))
check("search", "random legal games: pi <= 3a+2b, 16 = P+pi+a, static admissibility, capture feasibility, S <= S_cap",
      st["fails"] == 0, f"{st['positions']} positions, {st['promotions']} promotions, {st['captures']} captures")
board = chess.Board()
line = "a4 b5 axb5 Nc6 b6 a5 b7 a4 b8=Q a3 b3 Nf6 Nc3 Ng8 Rb1 a2 Rb2 a1=Q Qb4 Nf6 Qd4 Ng8 b4 Nf6 b5 Ng8 b6 Nf6 b7 Ng8 b8=Q"
caps = promos = 0
for san in line.split():
    mv = board.parse_san(san)
    caps += board.is_capture(mv); promos += bool(mv.promotion)
    board.push(mv)
check("exact", "explicit legal game with one capture (pawn takes pawn) and three promotions: bound pi <= 3a+2b is attained",
      caps == 1 and promos == 3, board.board_fen())
print("=" * 78); print("4b. Check conditions and the maximum over reachable placements (Lemma 14, Thm 15)"); print("=" * 78)
import ilp, ilp3, cpsat, checks_validate, lower_bound
res_h, v_h, meta_h, dt_h = ilp.solve(ilp3.contact_rule)
FEN_OPT = "KQqqqqqk/QQQQqqqq/nnBBbbQQ/6NN/8/8/8/8"
check("numeric", "HiGHS: integer program with (S1)-(S3), capture and check conditions is solved to optimality at B_o",
      res_h.status == 0 and fen_board(v_h) == FEN_OPT and res_h.mip_gap == 0.0,
      f"ln = {-res_h.fun:.7f}, dual bound = {-res_h.mip_dual_bound:.7f}, {dt_h:.0f} s")
st1, obj1, bd1, v_c, zw = cpsat.solve()
check("exact", "CP-SAT (integer arithmetic, coefficients round(1e9 ln p)): proved optimum is the same placement B_o",
      st1 == "OPTIMAL" and obj1 == bd1 and v_c == v_h and zw == 1, f"objective {obj1}")
st2, obj2, bd2, v_c2, _ = cpsat.solve(forbid=[v_c])
check("exact", "CP-SAT with B_o excluded: optimum drops by more than 8e6 units (8e-3), rounding error is below 260 units",
      st2 == "OPTIMAL" and obj2 == bd2 and obj1 - obj2 > 8 * 10**6 and sum(v_c) * 1 <= 260, f"difference {obj1 - obj2}")
Sopt = code(v_c)
check("exact", "S(B_o) has 543 digits and is below S(B_*)", len(str(Sopt)) == 543 and Sopt < Scap,
      f"log10 = {math.log10(Sopt):.7f}, ln = {math.log(Sopt):.7f}")
_b, _v, _caps, _proms = lower_bound.replay(open("max_reachable_game.txt").read().split())
check("exact", "game of Thm 15: every move legal, game not over before the last move, final placement is exactly B_o",
      _v == v_c and _b.turn == chess.WHITE and _b.is_check() and len(_b.move_stack) == 272 and _caps == 6 and _proms == 14,
      f"{len(_b.move_stack)} plies, {_caps} captures, {_proms} promotions, halfmove clock {_b.halfmove_clock}")
cv = checks_validate.run(600, 400, 7)
check("search", "random legal games: (K1)-(K3) hold and the attack model of the integer program agrees with python-chess",
      cv["fails"] == 0 and cv["model_mismatch"] == 0,
      f"{cv['positions']} positions, {cv['checks']} checks, {cv['double']} double checks, {cv['contact']} contact checks")
vi = [0]*64
back = [3, 5, 7, 9, 11, 7, 5, 3]
for f in range(8):
    vi[f] = back[f]; vi[8+f] = 1; vi[48+f] = 2; vi[56+f] = back[f] + 1
Sinit = code(vi)
check("exact", "initial array: S has 239 digits", len(str(Sinit)) == 239, f"log10 = {math.log10(Sinit):.5f}, ln = {math.log(Sinit):.5f}")

print("=" * 78); print("4c. Sharpness of Lemma 11, proof games, maxima by number of men (Thm 16, Props 17, 18)"); print("=" * 78)
import obstruct
sg = json.load(open("sharp_games.json"))
okall = True; npairs = 0
for a_ in range(17):
    for b_ in range(31):
        if 2 * a_ + b_ <= 8 and (a_, b_) != (0, 0):
            npairs += 1
            san = sg.get(f"{a_},{b_}")
            if san is None: okall = False; continue
            bd_ = chess.Board(); ca = cb = cp = 0
            for x in san:
                if bd_.is_game_over(claim_draw=False): okall = False
                mv = bd_.parse_san(x)
                if bd_.is_capture(mv):
                    if bd_.is_en_passant(mv) or bd_.piece_type_at(mv.to_square) == chess.PAWN: ca += 1
                    else: cb += 1
                cp += bool(mv.promotion); bd_.push(mv)
            if (ca, cb, cp) != (a_, b_, 3 * a_ + 2 * b_): okall = False
check("exact", "for each of the 24 pairs with 2a+b <= 8, (a,b) != (0,0), a legal game ends with a, b captures and 3a+2b promotions",
      okall and npairs == 24, f"{npairs} games, longest {max(len(x) for x in sg.values())} plies")
import sharp_general
gg = json.load(open("general_games.json"))
okg = len(gg) == 17
for a_ in range(17):
    seen_ = sharp_general.timeline(gg[str(a_)])
    need_ = [(a_, b_, 16 - a_) for b_ in range(max(0, 8 - 2 * a_), 31 - a_)]
    if any(x not in seen_ for x in need_): okg = False
covered = set()
for a_ in range(17):
    for b_ in range(31 - a_):
        if 2 * a_ + b_ <= 8: covered.add((a_, b_))
        if 2 * a_ + b_ >= 8: covered.add((a_, b_))
check("exact", "Thm 12: for every (a,b) with a <= 16, a+b <= 30 a legal game reaches min(3a+2b,16-a) promotions (24 + 17 games)",
      okg and len(covered) == sum(31 - a_ for a_ in range(17)), f"{len(covered)} pairs, longest general game {max(len(x) for x in gg.values())} plies")
import mpmath
mpmath.mp.dps = 900
dp = json.load(open("delta_pair.json"))
Sv_, Sw_ = code(dp["v"]), code(dp["w"])
gap_ = abs(mpmath.log(mpmath.mpf(Sv_)) - mpmath.log(mpmath.mpf(Sw_)))
check("exact", "Prop 22: explicit admissible pair with |L(A)-L(B)| < 1.91e-75 (900-digit arithmetic from the exact codes)",
      static_ok(dp["v"]) and static_ok(dp["w"]) and dp["v"] != dp["w"] and gap_ < mpmath.mpf("1.91e-75"), mpmath.nstr(gap_, 8))
pg = json.load(open("proofgames.json"))
_, t15 = genome.enumerate_codes(10**15)
obs = [n for n, (S_, v_) in enumerate(t15, 1) if obstruct.obstructed(list(v_))]
check("exact", "terms 113 and 178 of the genome violate (K1)-(K3) for both sides to move, and no other term up to 10^15 does",
      obs == [113, 178], str(obs))
_, t16_ = genome.enumerate_codes(10**16)
okp = True; nchk = 0
for key, rec in pg.items():
    n_ = int(key)
    _b2, _v2, _, _ = lower_bound.replay(rec["game"])
    nchk += 1
    ref = t15 if n_ <= len(t15) else t16_
    if code(_v2) != rec["code"] or ref[n_ - 1][0] != rec["code"]: okp = False
missing = [n for n in range(1, len(t15) + 1) if str(n) not in pg and n not in obs]
check("exact", "proof games: each replays legally (game not over before its last move) and ends in the stated genome term",
      okp, f"{nchk} games; terms up to 10^15 without a game and not obstructed: {missing}")
check("exact", "all 96 terms up to 10^14, in particular the 16 terms of Table 3, have proof games",
      all(str(n) in pg for n in range(1, 97)))
dm = json.load(open("ilp_m.json"))
cm = json.load(open("cpsat_m.json")) if os.path.exists("cpsat_m.json") else {}
okm = all(dm[str(m)]["gap"] == 0.0 for m in range(2, 33))
check("numeric", "HiGHS solves the integer program with exactly m men to optimality for m = 2..32", okm)
okc = all(cm[str(m)]["status"] == "OPTIMAL" and cm[str(m)]["obj"] == cm[str(m)]["bound"] and cm[str(m)]["same_as_highs"] for m in range(2, 32))
check("exact", "CP-SAT (integer arithmetic) proves the same optimum placement for every m = 2..31", okc)
check("exact", "m = 32: CP-SAT finds the same placement as HiGHS (optimality not proved by CP-SAT, as stated in the paper)",
      cm["32"]["same_as_highs"], cm["32"]["status"])
mg = json.load(open("max_m_games.json"))
okg2 = True
for m in ("2", "3"):
    _b3, _v3, _, _ = lower_bound.replay(mg[m])
    if fen_board(_v3) != dm[m]["fen"]: okg2 = False
check("exact", "U(2) and U(3) are attained: games ending in the optimal placements 5K1k/8/... and 5Kqk/8/...", okg2)

print("=" * 78); print("5. Counting statically admissible placements (Thm 18)"); print("=" * 78)
c = counting.layer_counts()
N = sum(c.values())
check("exact", "c(2) = 3612", c[2] == 3612)
b3 = sum(8*62 + 2*(48 - pawn_ok(b) - pawn_ok(w)) for (b, w) in KING_PAIRS)
check("search", "c(3) by direct enumeration", c[3] == b3 == 2127600, str(b3))
b4 = 0
for (bk, wk) in KING_PAIRS:
    f = 62; pw = 48 - pawn_ok(bk) - pawn_ok(wk)
    opts = [(i, l) for i in range(64) if i not in (bk, wk) for l in range(1, 11) if l > 2 or pawn_ok(i)]
    tot = len(opts); same = 8 + 2  # per square: number of labels available
    per_sq = {}
    for i, l in opts: per_sq[i] = per_sq.get(i, 0) + 1
    b4 += (tot*tot - sum(x*x for x in per_sq.values())) // 2
check("search", "c(4) by direct enumeration", c[4] == b4, str(b4))
check("exact", "total N = 21479616060441275961994497474036924399739608659772 (50 digits)",
      N == 21479616060441275961994497474036924399739608659772)
bc, pawnsq, kp, nsq = counting.brute(3, 3, {1}, 1, (1, 0, 0, 1))
fc = counting.layer_counts(nsq=nsq, pawn_squares=pawnsq, king_pairs=kp, p0=1, init=(1, 0, 0, 1))
check("search", "counting formula = brute force on a 3x3 toy board with promotion constraint", bc == fc, f"{sum(bc.values())} placements")

def _adjn(i, j, n): return max(abs(i % n - j % n), abs(i // n - j // n)) <= 1 and i != j
def _c3_brute(n):
    sq_ = n * n; tot = 0
    for b_ in range(sq_):
        for w_ in range(sq_):
            if b_ == w_ or _adjn(b_, w_, n): continue
            tot += 8 * (sq_ - 2) + 2 * (n * (n - 2) - (1 <= b_ // n <= n - 2) - (1 <= w_ // n <= n - 2))
    return tot
_poly = lambda n: 10*n**6 - 4*n**5 - 110*n**4 + 164*n**3 + 92*n**2 - 272*n + 112
check("exact", "Prop on n x n boards: c_n(3) polynomial equals direct enumeration for n = 3..15, and c_8(3) = c(3)",
      all(_c3_brute(n) == _poly(n) for n in range(3, 16)) and _poly(8) == c[3])
print("=" * 78); print("6. First terms of the Genome and the counting function (Tables 3, 4)"); print("=" * 78)
cnt14, terms = genome.enumerate_codes(10**14)
exp = [200000000000, 500000000000, 4600000000000, 5400000000000, 5800000000000, 6200000000000, 7400000000000,
       8099130339328, 8200000000000, 8600000000000, 9400000000000, 10600000000000, 11500000000000, 11800000000000,
       12200000000000, 13400000000000]
check("search", "first 16 Genome terms", [s for s, _ in terms[:16]] == exp)
check("exact", "every enumerated term is statically admissible and decodes to its vector",
      all(static_ok(list(v)) and code(v) == s for s, v in terms))
A = {k: genome.enumerate_codes(10**k, collect=False)[0] for k in range(11, 22)}
expA = [0, 2, 11, 96, 433, 2548, 10282, 46778, 172222, 670639, 2274707]
check("search", "A(k) = #{codes <= 10^k}, k = 11..21", [A[k] for k in range(11, 22)] == expA, str(expA))
try:
    js = json.load(open("genome_counts.json"))
    print("      (longer run, genome_counts.py):", {int(k): x for k, x in js.items() if int(k) > 21})
except FileNotFoundError:
    pass

print("=" * 78); print("7. Separation of L-values (Prop 19)"); print("=" * 78)
Lmax, Lmin = math.log(Smax), math.log(2**12 * 5**11)
ub = (Lmax - Lmin) / (N - 1)
check("numeric", "pigeonhole: some two placements have L-gap <= (Lmax-Lmin)/(N-1) < 10^-46", ub < 1e-46, f"{ub:.3e}")
check("exact", "elementary lower bound 1/S_max > 10^-614", Smax < 10**614)
check("exact", "sum of labels = 260 and sum of squared labels = 2292 for the material of B_max", sum(v) == 260 and sum(x*x for x in v) == 2292)
import delta_lattice
okd, gsd, needd = delta_lattice.certificate(141, 256, 1983, beta=30)
check("exact", "lattice certificate (M = 256, C = 10^141, T = 1983): min Gram-Schmidt norm^2 exceeds 4584 M^2 + 2243^2, so delta > 1983e-141 > 1e-138",
      okd and needd == 4584 * 256**2 + 2243**2, f"min GS^2 = {gsd:.6e} > {needd}")
_, t17 = genome.enumerate_codes(10**17)
r, s1, s2 = min(((b[0] - a[0]) / a[0], a[0], b[0]) for a, b in zip(t17, t17[1:]))
check("exact", "explicit close pair below 10^17: 91815791091791872 and 91815800000000000",
      (s1, s2) == (91815791091791872, 91815800000000000), f"L-gap = {math.log1p(r):.4e}")

print("=" * 78); print("8. Cantor pairing and base 13 (Section 7)"); print("=" * 78)
def cp(a, b): return (a + b)*(a + b + 1)//2 + b
def cantor(v):
    v = list(v)
    while len(v) > 1: v = [cp(v[i], v[i+1]) for i in range(0, len(v), 2)]
    return v[0]
vm = [0]*64; vm[0], vm[2] = 12, 11
check("exact", "Cantor tree: all-12 vector gives a 90-digit value (upper bound for all vectors)", len(str(cantor([12]*64))) == 90)
check("exact", "Cantor tree: bare kings a1, c1 give a 60-digit value; S has 12 digits", len(str(cantor(vm))) == 60 and len(str(code(vm))) == 12)
check("exact", "Cantor tree: initial array gives 73 digits; S has 239 digits", len(str(cantor(vi))) == 73)
check("exact", "13^64 has 72 digits", len(str(13**64)) == 72)
print("=" * 78)
print(f"TOTAL: {NPASS} PASS, {NFAIL} FAIL   ({time.time()-t0:.0f} s)")
pickle.dump(dict(Sopt=Sopt, vopt=v_c, Smax=Smax, Scap=Scap, vmax=v, vcap=vc, layers=c, N=N, Sinit=Sinit, terms=terms[:40]), open("results.pkl", "wb"))
