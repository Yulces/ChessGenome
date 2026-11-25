#!/usr/bin/env python3
"""
Predice el winrate y la mejor jugada para un FEN usando el modelo de Gödel.
"""
import sys
import json
import os
import argparse
import numpy as np
import pickle
import chess

try:
    import tensorflow as tf
    from tensorflow.keras.models import load_model
    TF_AVAILABLE = True
except Exception as e:
    print(f"TF not available: {e}", file=sys.stderr)
    TF_AVAILABLE = False

def build_features_from_fen(fen):
    """Construye features de Gödel a partir de un FEN usando python-chess."""
    board = chess.Board(fen)
    # Exponents: por cada casilla, el valor de la pieza (1-12)
    PIECE_VALUES = {
        chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
        chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 11,
    }
    exp = []
    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if piece is None:
            exp.append(0)
        else:
            v = PIECE_VALUES[piece.piece_type]
            if piece.color == chess.BLACK:
                v += 1
            exp.append(v)
    # L, L10, S_digits, pieceCount (placeholder, se recalculan mejor desde el backend)
    # Nota: para predecir, usamos los mismos features que en entrenamiento.
    # L y L10 los calculamos aquí con los primos.
    PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47,
              53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107,
              109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167,
              173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229,
              233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283,
              293, 307, 311]
    L = 0.0
    L10 = 0.0
    import math
    S = 1
    for i, v in enumerate(exp):
        if v > 0:
            L += v * math.log(PRIMES[i])
            L10 += v * math.log10(PRIMES[i])
            S *= PRIMES[i] ** v
    S_digits = len(str(S))
    pieceCount = sum(1 for v in exp if v > 0)
    max_exp = max(exp) or 1
    exp_norm = [v / max_exp for v in exp]
    turn = 1.0 if board.turn == chess.WHITE else 0.0
    return [L, L10, S_digits, pieceCount, *exp_norm, turn], exp

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="Directorio del modelo (con godel_model.h5)")
    ap.add_argument("--fen", required=True)
    ap.add_argument("--top", type=int, default=3)
    args = ap.parse_args()

    if not TF_AVAILABLE:
        print(json.dumps({"error": "tensorflow not available"}))
        sys.exit(1)

    model_path = os.path.join(args.model, "godel_model.h5")
    scaler_path = os.path.join(args.model, "godel_model_scaler.pkl")
    if not os.path.exists(model_path):
        print(json.dumps({"error": f"model not found: {model_path}"}))
        sys.exit(1)
    if not os.path.exists(scaler_path):
        print(json.dumps({"error": f"scaler not found: {scaler_path}"}))
        sys.exit(1)

    model = load_model(model_path, compile=False)
    with open(scaler_path, "rb") as f:
        scaler = pickle.load(f)

    board = chess.Board(args.fen)
    moves = list(board.legal_moves)

    results = []
    for move in moves:
        board.push(move)
        features, exp = build_features_from_fen(board.fen())
        board.pop()
        X = np.array([features], dtype=np.float32)
        X_scaled = scaler.transform(X)
        pred = float(model.predict(X_scaled, verbose=0)[0][0])
        results.append({
            "uci": move.uci(),
            "san": board.san(move),
            "winrate": pred,
        })

    results.sort(key=lambda r: r["winrate"], reverse=True)
    print(json.dumps({
        "ok": True,
        "fen": args.fen,
        "turn": "w" if board.turn == chess.WHITE else "b",
        "best": results[0] if results else None,
        "top": results[:args.top],
    }))

if __name__ == "__main__":
    main()
