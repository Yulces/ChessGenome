# Supplementary material for "Prime Codes of Chess Positions and the Chess Genome Sequence"

Everything needed to reproduce the computations of the paper. Intended for the folder
`paper/` of https://github.com/Yulces/ChessGenome, which the paper cites as [software].

## Run the checks

    pip install numpy scipy chess ortools python-flint fpylll cysignals mpmath
    python3 verify.py          # about 90 seconds; prints one PASS/FAIL line per claim

Expected last line: `TOTAL: 58 PASS, 0 FAIL`.

## Data (all games in SAN, from the initial array)

| File | Content | Used in |
|---|---|---|
| `max_reachable_game.txt` | 272-ply game reaching the largest reachable code | Theorem 16 |
| `sharp_games.json` | 24 games with pi = 3a+2b, one per pair (a,b), 2a+b <= 8 | Theorem 12 |
| `general_games.json` | 17 games, one per a = 0..16, through min(3a+2b,16-a) | Theorem 12 |
| `proofgames.json` | proof games for genome terms, keyed by index n | Proposition 22 |
| `max_m_games.json` | games attaining U(2) and U(3) | Proposition 17 |
| `ilp_m.json`, `cpsat_m.json` | optimal placements for each number of men, two solvers | Proposition 17 |
| `delta_pair.json` | two admissible placements with gap 1.9e-75 | Proposition 23 |
| `genome_counts.json` | A(k) for k <= 26 | Table 5 |
| `oeis_data.txt` | data for the three sequences to be submitted to the OEIS | Section 6 |

## Programs

- `core.py` encoding, admissibility, exact codes; `genome.py` enumeration of the genome;
  `counting.py` exact count N and c(m); `bounds.py` maxima on the admissible set.
- `ilp.py`, `ilp3.py`, `ilp_m.py`, `cpsat.py`, `cpsat_m.py` integer programs (HiGHS, CP-SAT).
- `obstruct.py` the check conditions (K1)-(K3) as a test.
- `proofgame.py`, `proofgame_run.py`, `retract.py`, `handcraft.py` proof-game searches.
- `sharp_build.py`, `sharp_one.py`, `sharp_general.py` games for Theorem 12.
- `climb*.py`, `route.py` searches that produced the game of Theorem 16.
- `delta_lattice.py`, `delta_scan.py`, `delta_pair.py` lattice computations for Proposition 22.
- `build.py` + `template.tex` regenerate `title_paper.tex` with the tables filled in.

`proofgames.json` may contain games for terms beyond 10^15 from a search still in progress;
the paper uses only n <= 433.
