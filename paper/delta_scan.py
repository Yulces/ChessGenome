import sys, pickle, math
from fractions import Fraction
from delta_lattice import certificate, NORM2, SUM1
best = None
for M in (16, 64, 256):
    for E in range(130, 152):
        ok, g, need = certificate(E, M, 0, beta=int(sys.argv[1]))
        # exact min GS^2 is recomputed inside; g is its float value, used only to pick T; the final T is re-certified below
        rem = g - M * M * NORM2
        if rem <= (SUM1 // 2 + 1) ** 2: continue
        T = int(math.isqrt(int(rem * 0.999999))) - SUM1 // 2 - 1
        if T < 1: continue
        ok2, g2, need2 = certificate(E, M, T, beta=int(sys.argv[1]))
        val = math.log10(T) - E
        print(M, E, T, ok2, f"log10 bound = {val:.3f}", flush=True)
        if ok2 and (best is None or val > best[0]):
            best = (val, M, E, T)
            pickle.dump(dict(log10=val, M=M, E=E, T=T, beta=int(sys.argv[1])), open("delta.pkl", "wb"))
print("BEST", best)
