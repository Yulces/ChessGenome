# ChessGenome Backend (NestJS + MongoDB + Redis)

Backend de la plataforma colaborativa **The ChessGenome**.

## Stack

- NestJS + TypeScript
- MongoDB + Mongoose (fuente de verdad)
- Redis (caché optimizada; degradación elegante si no está disponible)
- Cálculo de S / L en pure TypeScript

## Arranque

```bash
docker run -d -p 27017:27017 --name mongo mongo:7
docker run -d -p 6379:6379 --name redis redis:7-alpine

cd chessgenome-backend
npm install
npm run start:dev
```

```bash
export MONGODB_URI="mongodb://localhost:27017/chessgenome"
export REDIS_URL="redis://localhost:6379"
```

## Estrategia de caché (optimizada)

### Principios

1. **Encoding siempre fresco** – FEN → L es CPU-bound y barato; no se cachea el cómputo, solo el resultado de BD.
2. **Solo se cachean posiciones conocidas** (`existsInDb: true`). Los “new / not stored” no entran en Redis (evitar basura y datos obsoletos).
3. **Rank separado** – `countDocuments({ L: { $lt } })` se cachea por L cuantizado a 4 decimales.
4. **Invalidación selectiva** – al insertar una posición nueva se invalidan stats, terms y ranks (SCAN por prefijo, no KEYS).
5. **timesSeen eventualmente consistente** – en cache hit se incrementa en Mongo en background sin bloquear la respuesta.

### Claves y TTL

| Clave | Contenido | TTL |
|-------|-----------|-----|
| `genome:pos:v1:{hash}` | Payload completo de posición conocida | 6 h |
| `genome:rank:v1:{L.4dec}` | Rango aproximado | 30 min |
| `genome:stats:v1` | Stats globales | 45 s |
| `genome:terms:v1:{off}:{lim}` | Página del Genoma | 3 min |

### Flujo analyze

```
FEN → validate → encode (CPU)
     → Redis pos hit? → return (+ bump timesSeen async)
     → MongoDB lookup
        → exists → rank (Redis/Mongo) → cache pos → return
        → new + storeIfNew → insert → invalidate ranks/terms/stats → cache pos → return
        → new + !store → return sin cachear
```

## Endpoints

```bash
curl -X POST http://localhost:3000/api/positions/analyze \
  -H "Content-Type: application/json" \
  -d '{"fen":"...","storeIfNew":true}'

curl http://localhost:3000/api/positions/stats
curl "http://localhost:3000/api/positions/first-terms?limit=20"
```

Respuestas incluyen `cached: true/false`. Stats incluyen `redisEnabled`.

## Validación FEN

Estricta en cliente y servidor → HTTP 400 con mensaje descriptivo.

## Estructura

```
src/modules/
├── genome/      → codificación + validación FEN
├── positions/   → MongoDB + estrategia de caché
└── redis/       → RedisService (ioredis, SCAN, fallback)
```

## Puente DietriChess (Python)

NestJS intenta usar el microservicio Python si está vivo:

```bash
export DIETRICHESS_URL="http://localhost:5000"
export DIETRICHESS_TIMEOUT_MS=3000
export DIETRICHESS_ENABLED=true   # false = solo encoder TS
```

Flujo:
1. Health check cacheado 15s
2. POST /encode en Python
3. Si falla → fallback al `PrimeEncodingService` TypeScript
4. La respuesta incluye `"engine": "dietrichess-python"` o `"typescript-local"`

## Stockfish nativo (stockfish.exe)

```bash
# Windows (Git Bash)
export STOCKFISH_PATH="/d/ChessGenome/DietrichessAnalyzer/engines/stockfish.exe"

# PowerShell
$env:STOCKFISH_PATH="D:\ChessGenome\DietrichessAnalyzer\engines\stockfish.exe"

npm run start:dev
```

Comprobar: `GET http://localhost:3000/api/stockfish/status` → `"configured": true`

El frontend permite elegir **WASM** o **stockfish.exe** en el panel de análisis.
