import sys, json, chess, fcntl
import sharp_build as SB
a, b, seed, order = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
pairs = [tuple(int(c) for c in p) for p in order.split("-")]
bd, fail = SB.build(a, b, seed=seed, pairs=pairs)
if bd is None:
    print(a, b, seed, order, "FAIL", fail); sys.exit(1)
tmp = chess.Board(); san = []
for mv in bd.move_stack: san.append(tmp.san(mv)); tmp.push(mv)
ca, cb, cp, _ = SB.counts(san)
ok = (ca, cb, cp) == (a, b, 3*a + 2*b)
print(a, b, seed, order, (ca, cb, cp), len(san), "OK" if ok else "BAD")
if ok:
    with open("sharp_games.lock", "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        try: r = json.load(open("sharp_games.json"))
        except FileNotFoundError: r = {}
        r[f"{a},{b}"] = san; json.dump(r, open("sharp_games.json", "w"))
