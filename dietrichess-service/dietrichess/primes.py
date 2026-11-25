"""
Tablas canónicas de primos y valores de piezas.
Extraídas directamente de chess_analyzer_local.py (mapeo_casillas + valores_piezas).

Índice 0 = a1, índice 63 = h8  (orden row-major, igual que chess.SQUARES).
"""

from __future__ import annotations

from typing import Dict, Tuple

# Primeros 64 primos (OEIS A000040) – exactamente el mapeo de tu aplicación de escritorio
PRIMES: Tuple[int, ...] = (
    2, 3, 5, 7, 11, 13, 17, 19,          # a1..h1
    23, 29, 31, 37, 41, 43, 47, 53,      # a2..h2
    59, 61, 67, 71, 73, 79, 83, 89,      # a3..h3
    97, 101, 103, 107, 109, 113, 127, 131,  # a4..h4
    137, 139, 149, 151, 157, 163, 167, 173,  # a5..h5
    179, 181, 191, 193, 197, 199, 211, 223,  # a6..h6
    227, 229, 233, 239, 241, 251, 257, 263,  # a7..h7
    269, 271, 277, 281, 283, 293, 307, 311,  # a8..h8
)

# Valores de pieza (exponentes) – idénticos a valores_piezas de tu app
PIECE_VALUES: Dict[str, int] = {
    "P": 1, "p": 2,
    "R": 3, "r": 4,
    "N": 5, "n": 6,
    "B": 7, "b": 8,
    "Q": 9, "q": 10,
    "K": 11, "k": 12,
}

PIECE_CHARS = frozenset(PIECE_VALUES.keys())

# Mapa nombre de casilla → primo (por si se necesita acceso por nombre)
SQUARE_TO_PRIME: Dict[str, int] = {
    "a1": 2, "b1": 3, "c1": 5, "d1": 7, "e1": 11, "f1": 13, "g1": 17, "h1": 19,
    "a2": 23, "b2": 29, "c2": 31, "d2": 37, "e2": 41, "f2": 43, "g2": 47, "h2": 53,
    "a3": 59, "b3": 61, "c3": 67, "d3": 71, "e3": 73, "f3": 79, "g3": 83, "h3": 89,
    "a4": 97, "b4": 101, "c4": 103, "d4": 107, "e4": 109, "f4": 113, "g4": 127, "h4": 131,
    "a5": 137, "b5": 139, "c5": 149, "d5": 151, "e5": 157, "f5": 163, "g5": 167, "h5": 173,
    "a6": 179, "b6": 181, "c6": 191, "d6": 193, "e6": 197, "f6": 199, "g6": 211, "h6": 223,
    "a7": 227, "b7": 229, "c7": 233, "d7": 239, "e7": 241, "f7": 251, "g7": 257, "h7": 263,
    "a8": 269, "b8": 271, "c8": 277, "d8": 281, "e8": 283, "f8": 293, "g8": 307, "h8": 311,
}

# Nombres de casilla en el mismo orden que PRIMES (índice 0 = a1)
SQUARE_NAMES: Tuple[str, ...] = (
    "a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1",
    "a2", "b2", "c2", "d2", "e2", "f2", "g2", "h2",
    "a3", "b3", "c3", "d3", "e3", "f3", "g3", "h3",
    "a4", "b4", "c4", "d4", "e4", "f4", "g4", "h4",
    "a5", "b5", "c5", "d5", "e5", "f5", "g5", "h5",
    "a6", "b6", "c6", "d6", "e6", "f6", "g6", "h6",
    "a7", "b7", "c7", "d7", "e7", "f7", "g7", "h7",
    "a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8",
)
