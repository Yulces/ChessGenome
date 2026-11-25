#!/usr/bin/env python3
"""
Añade las claves de 'Guardar partida completa' al analyze de los 3 genome.json.
Backup automático. Escritura con indent=2, ensure_ascii=False.
"""
import json
import shutil
from pathlib import Path
from datetime import datetime

LOCALES_DIR = Path.home() / "ChessGenome/chessgenome-frontend/public/locales"
BACKUP_DIR = Path.home() / "backups/locales"
LANGS = ["es", "en", "de"]

# Claves nuevas, en orden de inserción dentro de "analyze"
NEW_KEYS = {
    "es": {
        "bulkSaveBtn": "💾 Guardar partida completa en el Genoma",
        "bulkSaveSaving": "⏳ Guardando…",
        "bulkSaveStoreNew": "Guardar posiciones nuevas",
        "bulkSaveTransitions": "Guardar transiciones",
        "bulkResultTitle": "{{total}} posiciones procesadas",
        "bulkResultStored": "Nuevas",
        "bulkResultUpdated": "Actualizadas",
        "bulkResultSkipped": "Omitidas",
        "bulkResultTransitions": "Transiciones",
    },
    "en": {
        "bulkSaveBtn": "💾 Save full game to the Genome",
        "bulkSaveSaving": "⏳ Saving…",
        "bulkSaveStoreNew": "Save new positions",
        "bulkSaveTransitions": "Save transitions",
        "bulkResultTitle": "{{total}} positions processed",
        "bulkResultStored": "New",
        "bulkResultUpdated": "Updated",
        "bulkResultSkipped": "Skipped",
        "bulkResultTransitions": "Transitions",
    },
    "de": {
        "bulkSaveBtn": "💾 Ganze Partie im Genom speichern",
        "bulkSaveSaving": "⏳ Speichern…",
        "bulkSaveStoreNew": "Neue Stellungen speichern",
        "bulkSaveTransitions": "Übergänge speichern",
        "bulkResultTitle": "{{total}} Stellungen verarbeitet",
        "bulkResultStored": "Neu",
        "bulkResultUpdated": "Aktualisiert",
        "bulkResultSkipped": "Übersprungen",
        "bulkResultTransitions": "Übergänge",
    },
}


def main():
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")

    for lang in LANGS:
        path = LOCALES_DIR / lang / "genome.json"
        if not path.exists():
            print(f"⚠️  {path} no existe, salto")
            continue

        # Backup
        backup = BACKUP_DIR / f"{lang}-genome.json.{ts}.bak"
        shutil.copy2(path, backup)

        # Cargar
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)

        if "analyze" not in data:
            print(f"⚠️  {lang}: no hay 'analyze' en {path}, salto")
            continue

        added = 0
        skipped = 0
        for k, v in NEW_KEYS[lang].items():
            if k in data["analyze"]:
                skipped += 1
                continue
            data["analyze"][k] = v
            added += 1

        # Escribir
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")  # newline final

        print(f"✅ {lang}: +{added} añadidas, {skipped} ya existían  →  {path}")
        print(f"   backup: {backup}")

    print("\n🎉 Hecho.")


if __name__ == "__main__":
    main()
