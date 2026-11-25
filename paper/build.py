import pickle, json, math, subprocess
from core import *
r = pickle.load(open("results.pkl", "rb"))
sym = " PpRrNnBbQqKk"
rows = []
for n, (S, v) in enumerate(r["terms"][:16], 1):
    men = sorted(((x, i) for i, x in enumerate(v) if x), key=lambda t: (-(t[0] >= 11), t[1]))
    men = sorted(((i, x) for i, x in enumerate(v) if x))
    desc = ",".join("\\sq{%s%s}" % (sym[x], sq(i)) for i, x in men)
    rows.append(f"${n}$ & ${S}$ & ${desc}$ & ${math.log10(S):.5f}$\\\\")
tabfirst = "\n".join(rows)
A = {int(k): x for k, x in json.load(open("genome_counts.json")).items()}
ks = sorted(A)
kmax = ks[-1]
third = -(-len(ks) // 3)
cols = [ks[i*third:(i+1)*third] for i in range(3)]
rows = []
for i in range(third):
    cells = []
    for c in cols:
        cells += [f"${c[i]}$", f"${A[c[i]]}$"] if i < len(c) else ["", ""]
    rows.append(" & ".join(cells) + "\\\\")
tabcount = "\n".join(rows)
tablayers = "\n".join(f"${m}$ & ${x}$\\\\" for m, x in r["layers"].items())
t = open("template.tex").read()
for key, val in (("@@TABFIRST@@", tabfirst), ("@@TABCOUNT@@", tabcount), ("@@TABLAYERS@@", tablayers),
                 ("@@NTOTAL@@", str(r["N"])), ("@@KMAX@@", str(kmax))):
    t = t.replace(key, val)
assert "@@" not in t and "%" not in t and all(ord(ch) < 128 for ch in t)
open("title_paper.tex", "w").write(t)
print("written; kmax", kmax)
