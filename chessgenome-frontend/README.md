# ChessGenome Frontend (React + Tailwind) – MVP completo

Plataforma colaborativa **The ChessGenome**.

## Páginas

| Página | Ruta interna | Función |
|--------|--------------|---------|
| **Inicio** | home | Hero, stats en vivo, explicación breve |
| **Calcular** | calculate | Tablero + FEN → L, factorización, lookup/guardado |
| **Explorar** | explore | Primeros términos del Genoma ordenados por L |
| **Contribuir** | contribute | Subir FEN o PGN y guardar en la base |

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS (naranja #ff6b00, verde Lichess #629924)
- chess.js + react-chessboard

## Arranque

```bash
# Terminal 1 – MongoDB
docker run -d -p 27017:27017 --name mongo mongo:7

# Terminal 2 – Backend
cd chessgenome-backend
npm install && npm run start:dev

# Terminal 3 – Frontend
cd chessgenome-frontend
npm install && npm run dev
```

Abre **http://localhost:5173**

## Estructura

```
src/
├── App.tsx                 ← navegación entre páginas
├── components/
│   ├── Layout.tsx          ← header + nav + footer
│   └── ResultPanel.tsx
├── pages/
│   ├── HomePage.tsx
│   ├── CalculatePage.tsx
│   ├── ExplorePage.tsx
│   └── ContributePage.tsx
├── services/api.ts
└── types/genome.ts
```

## Flujo típico

1. En **Calcular**: mueve piezas o pega FEN → Analizar (opcionalmente “Guardar si es nueva”).
2. En **Explorar**: ves las posiciones guardadas ordenadas por L.
3. En **Contribuir**: pegas un PGN o FEN y lo añades al Genoma.
4. En **Inicio**: stats globales (total, admisibles, mayor L).
