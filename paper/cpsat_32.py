import json, math, cpsat
from core import *
st, obj, bd, v, zw = cpsat.solve(workers=2, men=32, tl=3000)
cm = json.load(open("cpsat_m.json"))
d = json.load(open("ilp_m.json"))
cm["32"] = dict(status=st, obj=obj, bound=bd, fen=fen_board(v), same_as_highs=(fen_board(v) == d["32"]["fen"]), log10=math.log10(code(v)))
json.dump(cm, open("cpsat_m.json", "w"))
print(st, obj, bd, fen_board(v))
