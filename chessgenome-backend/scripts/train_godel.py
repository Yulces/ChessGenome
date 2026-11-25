#!/usr/bin/env python3
"""
Entrena una red neuronal para ChessGenome usando features de Gödel.
Lee un JSON de posiciones exportadas desde /api/neural/corpus/export-positions
y guarda el modelo en models/<timestamp>/.
"""
import sys
import json
import os
import argparse
import numpy as np
import datetime
import pickle

try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers, models
    TF_AVAILABLE = True
except Exception as e:
    print(f"TF not available: {e}", file=sys.stderr)
    TF_AVAILABLE = False

from sklearn.preprocessing import StandardScaler

def build_features(pos):
    """Construye el vector de features de Gödel para una posición."""
    exp = pos.get("exponents") or [0]*64
    if len(exp) < 64:
        exp = exp + [0]*(64-len(exp))
    exp = exp[:64]
    max_exp = max(exp) or 1
    exp_norm = [v / max_exp for v in exp]
    turn = 1.0 if pos.get("turn") == "w" else 0.0
    return [
        float(pos.get("L") or 0.0),
        float(pos.get("L10") or 0.0),
        float(pos.get("S_digits") or 0.0),
        float(pos.get("pieceCount") or 0.0),
        *exp_norm,
        turn,
    ]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=50)
    ap.add_argument("--batch", type=int, default=32)
    args = ap.parse_args()

    if not TF_AVAILABLE:
        print(json.dumps({"error": "tensorflow not available"}))
        sys.exit(1)

    with open(args.corpus, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list) or len(data) < 10:
        print(json.dumps({"error": f"corpus too small: {len(data)}"}))
        sys.exit(1)

    X = []
    y = []
    for pos in data:
        try:
            X.append(build_features(pos))
            y.append(float(pos.get("winrateWhite", 0.5)))
        except Exception:
            continue
    X = np.array(X, dtype=np.float32)
    y = np.array(y, dtype=np.float32)

    if len(X) < 10:
        print(json.dumps({"error": f"not enough valid samples: {len(X)}"}))
        sys.exit(1)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    n = len(X_scaled)
    idx = np.random.permutation(n)
    split = int(n * 0.8)
    train_idx, val_idx = idx[:split], idx[split:]

    model = models.Sequential([
        layers.Input(shape=(X.shape[1],)),
        layers.Dense(128, activation="relu"),
        layers.Dropout(0.2),
        layers.Dense(64, activation="relu"),
        layers.Dropout(0.2),
        layers.Dense(32, activation="relu"),
        layers.Dense(1, activation="linear"),
    ])
    model.compile(optimizer="adam", loss="mse", metrics=["mae"])

    history = model.fit(
        X_scaled[train_idx], y[train_idx],
        validation_data=(X_scaled[val_idx], y[val_idx]),
        epochs=args.epochs,
        batch_size=args.batch,
        verbose=0,
    )

    val_loss, val_mae = model.evaluate(X_scaled[val_idx], y[val_idx], verbose=0)
    train_loss, train_mae = model.evaluate(X_scaled[train_idx], y[train_idx], verbose=0)

    os.makedirs(args.out, exist_ok=True)
    base = os.path.join(args.out, "godel_model")
    model.save(f"{base}.h5")
    with open(f"{base}_scaler.pkl", "wb") as f:
        pickle.dump(scaler, f)
    metadata = {
        "input_dim": int(X.shape[1]),
        "samples": int(len(X)),
        "train_samples": int(len(train_idx)),
        "val_samples": int(len(val_idx)),
        "epochs": args.epochs,
        "batch_size": args.batch,
        "train_loss": float(train_loss),
        "train_mae": float(train_mae),
        "val_loss": float(val_loss),
        "val_mae": float(val_mae),
        "created_at": datetime.datetime.now().isoformat(),
        "version": "1.0",
        "features": "L,L10,S_digits,pieceCount,exponents[64],turn",
    }
    with open(f"{base}_metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    print(json.dumps({
        "ok": True,
        "model": base + ".h5",
        "metadata": metadata,
    }))

if __name__ == "__main__":
    main()
