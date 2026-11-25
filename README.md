# The ChessGenome — port completo DietrichessAnalyzer → Web (TypeScript)

## Módulos

### Backend NestJS
| Módulo | Origen desktop | Estado |
|--------|----------------|--------|
| `genome` / BigInt S_exact | calculate_exact_value / position_value | ✅ |
| `positions` + `transitions` | position_database.py | ✅ |
| `analysis` (PGN → curva L) | análisis de partida | ✅ |
| `stockfish` | StockfishEngine | 🟡 API + WASM cliente recomendado |
| `neural` | neural_network features | 🟡 extracción features; modelo a cargar |
| Redis cache | — | ✅ |
| DietriChess Python bridge | opcional | ✅ |

### Frontend React
| Página | Origen desktop |
|--------|----------------|
| Calcular | análisis de posición |
| **Editor** | PositionEditorDialog |
| **Partida** | análisis PGN + gráficos VPo/L |
| **Buscar** | SearchDialog (FEN, top, transiciones) |
| Explorar / Contribuir | Genome collab |

## Arranque

```bash
# Node 20 LTS recomendado para el frontend
cd chessgenome-backend && npm install && npm run start:dev
cd chessgenome-frontend && npm install && npm run dev
```

MongoDB + Redis deben estar activos.

## API principal

- `POST /api/positions/analyze` `{ fen, storeIfNew }`
- `GET  /api/positions/search?fen=`
- `GET  /api/positions/top`
- `GET  /api/positions/transitions/:fromHash`
- `POST /api/analysis/game` `{ fens, headers, sans }`
- `POST /api/neural/features` `{ fen }`
- `GET  /api/stockfish/status`

## Pendiente opcional (siguiente ciclo)
1. stockfish.wasm embebido en el cliente
2. Cargar modelo .h5 / TF.js exportado desde DietrichessAnalyzer
3. Auth usuarios + leaderboards
4. Siembra masiva desde PGNs

