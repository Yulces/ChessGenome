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


## Contenido del repositorio

- `chessgenome-backend/`, `chessgenome-frontend/`, `DietrichessAnalyzer/`, `dietrichess-service/`: código del proyecto.
- `paper/`: scripts de análisis, datos y plantilla LaTeX del artículo.
- `data/mongodb/`: dump comprimido de la base de datos MongoDB (`chessgenome_mongo_dump.gz`). Ver `data/mongodb/README.md` para instrucciones de restauración.
- `deploy/`: configuración de despliegue (Nginx, systemd, etc.).
- `scripts/`: utilidades auxiliares.

## Restaurar la base de datos

    docker exec -i chessgenome-mongodb mongorestore --archive --gzip --drop < data/mongodb/chessgenome_mongo_dump.gz

Ver `data/mongodb/README.md` para más detalles.
