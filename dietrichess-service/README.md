# DietriChess HTTP Service + Núcleo Matemático (S ilimitado)

## Contenido

```
dietrichess-service/
├── app/
│   └── main.py              # FastAPI – puente HTTP
├── dietrichess/             # PAQUETE REAL
│   ├── __init__.py
│   ├── primes.py            # 64 primos + valores de piezas (idénticos al desktop)
│   ├── encoder.py           # analyze(fen) → L, L10, S, S_exact, ...
│   └── bignum.py            # 4 operaciones de precisión arbitraria (VB6 + nativo)
├── requirements.txt
└── README.md
```

## Novedades de hoy (2026-09-02)

- **S exacto sin límite de cifras** (`S_exact` como string)
- Módulo de aritmética de precisión arbitraria con las 4 operaciones:
  - `add`, `sub`, `mul`, `div` (cociente + resto)
  - `power`
  - Traducción fiel del `.bas` de Visual Basic 6 + versión nativa Python
- Compatible 100 % con el cálculo de la aplicación de escritorio

## Arranque

```bash
cd dietrichess-service
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 5000
```

Opcional – apuntar a otra carpeta con el paquete dietrichess:

```bash
export DIETRICHESS_PATH=/ruta/a/tu/DietrichessAnalyzer
```

## Contrato de analyze(fen)

```python
{
  "exponents": [int x 64],
  "L": float,              # ln
  "L10": float,            # log10
  "S": float | null,       # solo si cabe en float64
  "S_exact": "1234...",    # TODAS las cifras (string)
  "S_digits": int,
  "factorization": {"2": 3, ...},
  "hash": "3,5,7,...",
  "pieceCount": int,
  "staticallyAdmissible": bool,
  "engine": "dietrichess-real",
  "version": "3.2.0-bignum-4ops"
}
```

## Aritmética de grandes números

```python
from dietrichess import add, sub, mul, div, power

add("999", "1")          # "1000"
sub("50", "100")         # "-50"
mul("123", "456")        # "56088"
div("100", "7")          # ("14", "2")
power("13", 5)           # "371293"
```

También disponibles los nombres originales del VB6:
`AddLargeNumbers`, `MultiplyLargeNumbers`, `PowerLargeNumbers`, `SubtractLong`, `DividirPorDos`.
