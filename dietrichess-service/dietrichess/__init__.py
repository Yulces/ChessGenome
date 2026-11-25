"""
DietriChess – núcleo matemático de representación Gödeliana.

Incluye:
  - Codificación de posiciones (S, L, L10)
  - Aritmética de precisión arbitraria (4 operaciones + potencia)
"""

from .encoder import (
    analyze,
    encode_fen,
    validate_fen,
    fen_to_exponents,
    compute_L,
    compute_L10,
    get_factorization,
    position_hash,
    FenError,
)
from .primes import PRIMES, PIECE_VALUES, SQUARE_TO_PRIME, SQUARE_NAMES
from .bignum import (
    add,
    sub,
    mul,
    div,
    divmod_str,
    power,
    compare,
    normalize,
    is_zero,
    divide_by_small,
    compute_S_exact_native,
    compute_S_exact_string,
    # aliases VB6
    AddLargeNumbers,
    MultiplyLargeNumbers,
    PowerLargeNumbers,
    SubtractLong,
    DividirPorDos,
)

__version__ = "3.2.0-bignum-4ops"
__all__ = [
    "analyze",
    "encode_fen",
    "validate_fen",
    "fen_to_exponents",
    "compute_L",
    "compute_L10",
    "get_factorization",
    "position_hash",
    "FenError",
    "PRIMES",
    "PIECE_VALUES",
    "SQUARE_TO_PRIME",
    "SQUARE_NAMES",
    "add", "sub", "mul", "div", "divmod_str", "power",
    "compare", "normalize", "is_zero", "divide_by_small",
    "compute_S_exact_native", "compute_S_exact_string",
    "AddLargeNumbers", "MultiplyLargeNumbers", "PowerLargeNumbers",
    "SubtractLong", "DividirPorDos",
    "__version__",
]
