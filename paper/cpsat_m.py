import json, math
import cpsat
from core import *
d = json.load(open("ilp_m.json"))
out = {}
for m in range(2, 33):
    st, obj, bd, v, zw = cpsat.solve(workers=1, men=m, tl=600)
    hv = d[str(m)]
    same = (fen_board(v) == hv["fen"])
    out[m] = dict(status=st, obj=obj, bound=bd, fen=fen_board(v), same_as_highs=same, log10=math.log10(code(v)))
    print(m, st, obj == bd, f"log10 {math.log10(code(v)):.5f}", "same" if same else "DIFFERENT " + fen_board(v) + " vs " + hv["fen"], flush=True)
    json.dump(out, open("cpsat_m.json", "w"))
