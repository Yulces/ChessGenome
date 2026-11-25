"""Rigorous lower bound for the smallest gap delta = min |L(A) - L(B)| over distinct admissible placements.
Lattice spanned by the rows (M e_i, w_i), w_i = round(C ln p_i).  Exact integer arithmetic (python-flint);
the logarithms are computed with mpmath at 400 digits only to obtain the integers w_i, with a checked rounding margin."""
import sys, pickle
from fractions import Fraction
import mpmath
from flint import fmpz_mat, fmpz
from core import BOARD

NORM2 = 4584      # ||v(A) - v(B)||^2 <= 2 * 2292
SUM1 = 520        # sum |v_i(A) - v_i(B)| <= 2 * 260

def certificate(E, M, T, beta=0):
    """Returns True if the lattice certificate proves delta >= T / 10^E."""
    mpmath.mp.dps = E + 80
    C = mpmath.mpf(10) ** E
    w = []
    for p in BOARD:
        val = C * mpmath.log(p)
        r = mpmath.nint(val)
        assert abs(val - r) < mpmath.mpf("0.4999999")          # rounding is unambiguous at this precision
        w.append(int(r))
    n = 64
    rows = [[(M if i == j else 0) for j in range(n)] + [w[i]] for i in range(n)]
    B0 = fmpz_mat(rows)
    if beta:
        from fpylll import IntegerMatrix, LLL, BKZ
        A = IntegerMatrix.from_matrix(rows)
        LLL.reduction(A)
        BKZ.reduction(A, BKZ.Param(block_size=beta, max_loops=8))
        red = [[int(A[i, j]) for j in range(n + 1)] for i in range(n)]
        B = fmpz_mat(red)
        # exact check that the reduced rows span the same lattice
        for r in red:
            assert all(x % M == 0 for x in r[:n]) and r[n] == sum((x // M) * wi for x, wi in zip(r[:n], w))
        assert (B * B.transpose()).det() == (B0 * B0.transpose()).det()
    else:
        B = B0.lll()
    G = B * B.transpose()
    # Gram-Schmidt norms from leading principal minors: |b_i*|^2 = d_i / d_{i-1}
    dprev = fmpz(1); gs_min = None
    for i in range(1, n + 1):
        d = fmpz_mat([[G[r, c] for c in range(i)] for r in range(i)]).det()
        q = Fraction(int(d), int(dprev))
        gs_min = q if gs_min is None or q < gs_min else gs_min
        dprev = d
    need = M * M * NORM2 + (T + SUM1 // 2) ** 2
    return gs_min > need, float(gs_min), need

if __name__ == "__main__":
    M = int(sys.argv[1]); beta = int(sys.argv[2]); E0 = int(sys.argv[3]); step = int(sys.argv[4])
    T = 68 * M
    best = None
    for E in range(E0, 200, step):
        ok, g, need = certificate(E, M, T, beta)
        print(E, ok, f"min GS^2 = {g:.4e}, needed {need:.4e}", flush=True)
        if ok:
            best = E; break
    print("RESULT: delta >=", T, "* 10^-%d" % best, "(M = %d, beta = %d)" % (M, beta))
    pickle.dump(dict(E=best, M=M, T=T, beta=beta), open("delta.pkl", "wb"))
