from counting import brute, layer_counts
for (nf, nr, pr, p0, init) in [(3, 3, {1}, 1, (1, 0, 0, 1)), (4, 3, {1}, 2, (1, 0, 0, 0)), (3, 3, {1}, 2, (0, 1, 0, 1))]:
    bc, pawnsq, kp, n = brute(nf, nr, pr, p0, init)
    fc = layer_counts(nsq=n, pawn_squares=pawnsq, king_pairs=kp, p0=p0, init=init)
    print((nf, nr, p0, init), "brute total", sum(bc.values()), "formula total", sum(fc.values()), "MATCH" if bc == fc else "MISMATCH")
