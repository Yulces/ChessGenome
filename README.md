# The ChessGenome — Full port of DietrichessAnalyzer → Web (TypeScript)

## Modules

### Backend (NestJS)
| Module | Desktop origin | Status |
|--------|----------------|--------|
| `genome` / BigInt S_exact | calculate_exact_value / position_value | ✅ |
| `positions` + `transitions` | position_database.py | ✅ |
| `analysis` (PGN → L-curve) | game analysis | ✅ |
| `stockfish` | StockfishEngine | 🟡 API + client WASM recommended |
| `neural` | neural_network features | 🟡 feature extraction; model to be loaded |
| Redis cache | — | ✅ |
| DietriChess Python bridge | optional | ✅ |

### Frontend (React)
| Page | Desktop origin |
|------|----------------|
| Calculate | position analysis |
| **Editor** | PositionEditorDialog |
| **Game** | PGN analysis + VPo/L charts |
| **Search** | SearchDialog (FEN, top, transitions) |
| Explore / Contribute | Genome collab |

## Getting started

```bash
# Node 20 LTS recommended for the frontend
cd chessgenome-backend && npm install && npm run start:dev
cd chessgenome-frontend && npm install && npm run dev
