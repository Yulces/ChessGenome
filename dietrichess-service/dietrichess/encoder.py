"""
DietriChess Encoder – núcleo matemático headless + S exacto ilimitado.

Extraído de chess_analyzer_local.py + aritmética de precisión arbitraria
(traducción del módulo calcular.bas de Visual Basic 6).

Contrato:
    analyze(fen) → exponents, L, L10, S (float o null), S_exact (string),
                   factorization, hash, pieceCount, staticallyAdmissible, ...
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from .primes import PRIMES, PIECE_VALUES, PIECE_CHARS, SQUARE_NAMES
from .bignum import compute_S_exact_native

__version__ = "3.2.0-bignum-4ops"


class FenError(ValueError):
    """FEN inválido."""


def validate_fen(fen: str) -> None:
    if not isinstance(fen, str) or not fen.strip():
        raise FenError("FEN vacío o no válido")

    parts = fen.strip().split()
    board = parts[0]
    if len(board) < 15:
        raise FenError("FEN inválido: parte del tablero demasiado corta")

    ranks = board.split("/")
    if len(ranks) != 8:
        raise FenError(f"FEN inválido: se esperaban 8 filas, se encontraron {len(ranks)}")

    for r, rank in enumerate(ranks):
        if not rank:
            raise FenError(f"FEN inválido: la fila {8 - r} está vacía")
        squares = 0
        for ch in rank:
            if "1" <= ch <= "8":
                squares += int(ch)
            elif ch in PIECE_CHARS:
                squares += 1
            else:
                raise FenError(
                    f"FEN inválido: carácter '{ch}' no permitido en la fila {8 - r}"
                )
            if squares > 8:
                raise FenError(f"FEN inválido: la fila {8 - r} tiene más de 8 casillas")
        if squares != 8:
            raise FenError(
                f"FEN inválido: la fila {8 - r} tiene {squares} casillas en lugar de 8"
            )

    if len(parts) >= 2 and parts[1] not in ("w", "b"):
        raise FenError("FEN inválido: turno debe ser 'w' o 'b'")


def fen_to_exponents(fen: str) -> List[int]:
    validate_fen(fen)
    board_part = fen.strip().split()[0]
    ranks = board_part.split("/")

    exp = [0] * 64
    for rank_idx, rank in enumerate(ranks):
        base = (7 - rank_idx) * 8
        file_idx = 0
        for ch in rank:
            if "1" <= ch <= "8":
                file_idx += int(ch)
            else:
                exp[base + file_idx] = PIECE_VALUES.get(ch, 0)
                file_idx += 1
    return exp


def compute_L(exponents: List[int]) -> float:
    total = 0.0
    for i, v in enumerate(exponents):
        if v > 0:
            total += v * math.log(PRIMES[i])
    return total


def compute_L10(exponents: List[int]) -> float:
    total = 0.0
    for i, v in enumerate(exponents):
        if v > 0:
            total += v * math.log10(PRIMES[i])
    return total


def get_factorization(exponents: List[int]) -> Dict[str, int]:
    factors: Dict[str, int] = {}
    for i, v in enumerate(exponents):
        if v > 0:
            factors[str(PRIMES[i])] = v
    return factors


def position_hash(exponents: List[int]) -> str:
    return ",".join(str(v) for v in exponents)


def count_pieces(exponents: List[int]) -> int:
    return sum(1 for v in exponents if v > 0)


def is_statically_admissible(exponents: List[int]) -> bool:
    white_king = -1
    black_king = -1
    for i, v in enumerate(exponents):
        if v == 11:
            if white_king != -1:
                return False
            white_king = i
        elif v == 12:
            if black_king != -1:
                return False
            black_king = i

    if white_king == -1 or black_king == -1:
        return False

    r1, f1 = divmod(white_king, 8)
    r2, f2 = divmod(black_king, 8)
    if abs(r1 - r2) <= 1 and abs(f1 - f2) <= 1:
        return False
    return True


def analyze(fen: str) -> Dict[str, Any]:
    """
    Función principal.

    Siempre calcula S_exact como string (precisión ilimitada).
    Si además cabe en float64, también lo devuelve en el campo "S".
    """
    exponents = fen_to_exponents(fen)
    L = compute_L(exponents)
    L10 = compute_L10(exponents)
    factorization = get_factorization(exponents)
    h = position_hash(exponents)
    piece_count = count_pieces(exponents)
    admissible = is_statically_admissible(exponents)

    # S exacto sin límite de cifras (método equivalente al de tu VB6)
    S_exact = compute_S_exact_native(exponents, PRIMES)
    digits = len(S_exact)

    # Intentar también el float (solo si cabe)
    S_float: Optional[float] = None
    if L10 < 308.0:
        try:
            S_float = float(S_exact)
            if not math.isfinite(S_float):
                S_float = None
        except (OverflowError, ValueError):
            S_float = None

    result: Dict[str, Any] = {
        "exponents": exponents,
        "L": L,
        "L10": L10,
        "S": S_float,                    # float o null
        "S_exact": S_exact,              # string con todas las cifras
        "S_digits": digits,              # número de dígitos de S
        "factorization": factorization,
        "hash": h,
        "pieceCount": piece_count,
        "staticallyAdmissible": admissible,
        "engine": "dietrichess-real",
        "version": __version__,
    }

    result["activePrimes"] = {
        SQUARE_NAMES[i]: PRIMES[i]
        for i, v in enumerate(exponents) if v > 0
    }

    return result


def encode_fen(fen: str) -> Dict[str, Any]:
    return analyze(fen)
