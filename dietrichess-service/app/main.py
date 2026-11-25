"""
DietriChess HTTP microservice – loads the real `dietrichess` package.

Run (from dietrichess-service/):
  pip install -r requirements.txt
  uvicorn app.main:app --host 0.0.0.0 --port 5000

Optional: point to your portable DietriChess folder on the VPS:
  export DIETRICHESS_PATH=/opt/chessgenome/DietriChessPortable
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


def _bootstrap_dietrichess_path() -> None:
    raw = os.environ.get("DIETRICHESS_PATH", "").strip()
    if not raw:
        service_root = Path(__file__).resolve().parent.parent
        sys.path.insert(0, str(service_root))
        return

    p = Path(raw).expanduser().resolve()
    if not p.exists():
        raise RuntimeError(f"DIETRICHESS_PATH does not exist: {p}")

    if (p / "dietrichess").is_dir():
        sys.path.insert(0, str(p))
    elif p.name == "dietrichess" and (p / "__init__.py").exists():
        sys.path.insert(0, str(p.parent))
    else:
        sys.path.insert(0, str(p))


_bootstrap_dietrichess_path()

try:
    import dietrichess
    from dietrichess import analyze, FenError, PRIMES, PIECE_VALUES, __version__
except Exception as e:  # pragma: no cover
    raise RuntimeError(
        "Cannot import dietrichess. Set DIETRICHESS_PATH or install the package. "
        f"Original error: {e}"
    ) from e


app = FastAPI(
    title="DietriChess Encoding Service",
    description="Real DietriChess prime encoding for The ChessGenome",
    version=__version__,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class EncodeRequest(BaseModel):
    fen: str = Field(..., min_length=1, max_length=120)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "dietrichess",
        "version": __version__,
        "engine": "dietrichess-real",
        "path": getattr(dietrichess, "__file__", None),
    }


@app.post("/encode")
def encode(req: EncodeRequest):
    try:
        return analyze(req.fen)
    except FenError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Encoding error: {e}")


@app.get("/primes")
def primes():
    return {"primes": list(PRIMES), "count": len(PRIMES)}


@app.get("/piece-values")
def piece_values():
    return PIECE_VALUES
