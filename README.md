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

## Stockfish

El código de integración con Stockfish está incluido en:

- `chessgenome-backend/src/modules/stockfish/` (API NestJS)
- `chessgenome-frontend/src/services/stockfishEngine.ts` y `StockfishPanel.tsx` (cliente)

**El binario del motor Stockfish no se incluye en el repositorio** por dos motivos:

1. **Tamaño**: el ejecutable supera el límite de 100 MB por archivo de GitHub.
2. **Licencia**: Stockfish se distribuye bajo GPL v3, que exige proporcionar el código fuente o un enlace al mismo al distribuir el binario.

### Cómo obtener Stockfish

- Descarga oficial: https://stockfishchess.org/download/
- O desde tu gestor de paquetes (`apt install stockfish`, `brew install stockfish`, etc.)

Una vez descargado, colócalo en la ruta que espera el backend (ver `chessgenome-backend/src/modules/stockfish/stockfish.service.ts`) o configura la variable de entorno correspondiente.

### Alternativa futura

El README original ya contempla embeber `stockfish.wasm` en el cliente para eliminar la dependencia del binario en el servidor. Ver sección "Pendiente opcional".

### Binario de Stockfish usado por el proyecto

El binario concreto utilizado en el desarrollo está disponible en la Release:

https://github.com/Yulces/ChessGenome/releases/tag/stockfish-v1

Incluye la nota de licencia GPL v3 y el enlace al código fuente oficial.
