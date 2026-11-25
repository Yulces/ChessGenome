"""
Position Database Module for Chess Gödel Analyzer
Almacena posiciones únicas usando S (Gödel number) como clave
"""

import sqlite3
import json
import logging
from typing import Optional, Dict, Any, Tuple
from datetime import datetime
import chess

logger = logging.getLogger(__name__)

class PositionDatabase:
    """Base de datos de posiciones de ajedrez indexadas por S (Gödel number)"""
    
    def __init__(self, db_path: str = None):
        """
        Inicializa la base de datos
        
        Args:
            db_path: Ruta al archivo .db. Si es None, usa en memoria
        """
        if db_path is None:
            # Por defecto, en el directorio data/ junto al script
            import os
            base_dir = os.path.dirname(os.path.abspath(__file__))
            data_dir = os.path.join(base_dir, "data")
            os.makedirs(data_dir, exist_ok=True)
            db_path = os.path.join(data_dir, "positions.db")
        
        self.db_path = db_path
        self.conn = None
        self._connect()
        self._init_tables()
    
    def _connect(self):
        """Conecta a la base de datos SQLite"""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        # Optimizaciones para rendimiento
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.execute("PRAGMA cache_size=-65536")  # 64 MB cache
        self.conn.execute("PRAGMA temp_store=MEMORY")
    
    def _init_tables(self):
        """Crea las tablas necesarias si no existen"""
        cursor = self.conn.cursor()
        
        # Tabla principal de posiciones
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS positions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                s_hash TEXT UNIQUE NOT NULL,      -- Hash de S para índice rápido
                s_value TEXT NOT NULL,             -- S como string (entero gigante)
                s_log REAL,                        -- log10(S) para ordenamiento
                fen TEXT NOT NULL,                 -- FEN de la posición
                frecuencia INTEGER DEFAULT 1,
                winrate_white REAL DEFAULT 0.5,    -- Winrate desde blancas
                winrate_turn REAL DEFAULT 0.5,     -- Winrate desde quien mueve
                mejor_jugada TEXT,                 -- Mejor jugada (UCI)
                segunda_mejor TEXT,                -- Segunda mejor jugada
                eval_engine INTEGER,               -- Evaluación de Stockfish (centipeones)
                metadata TEXT,                     -- JSON con info adicional
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Tabla de transiciones (para construir grafo de movimientos)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS transitions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_s_hash TEXT NOT NULL,
                to_s_hash TEXT NOT NULL,
                move_uci TEXT NOT NULL,
                frecuencia INTEGER DEFAULT 1,
                winrate_from_move REAL DEFAULT 0.5,
                FOREIGN KEY (from_s_hash) REFERENCES positions(s_hash),
                FOREIGN KEY (to_s_hash) REFERENCES positions(s_hash)
            )
        """)
        
        # Tabla de metadatos globales
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Crear índices para búsqueda rápida
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_s_hash ON positions(s_hash)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_fen ON positions(fen)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_s_log ON positions(s_log)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_frecuencia ON positions(frecuencia DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_from_hash ON transitions(from_s_hash)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_to_hash ON transitions(to_s_hash)")
        
        self.conn.commit()
        logger.info(f"Base de datos inicializada: {self.db_path}")
    
    def _compute_hash(self, s_value) -> str:
        """
        Calcula un hash para S (entero gigante)
        Usamos SHA-256 para evitar colisiones
        """
        import hashlib
        if isinstance(s_value, int):
            s_str = str(s_value)
        else:
            s_str = str(s_value)
        return hashlib.sha256(s_str.encode()).hexdigest()
    
    def save_position(self, s_value, fen: str, metadata: Dict[str, Any] = None) -> Tuple[str, bool]:
        """
        Guarda o actualiza una posición
        
        Args:
            s_value: S (Gödel number) como int o string
            fen: FEN de la posición
            metadata: Diccionario con info adicional
        
        Returns:
            (s_hash, es_nueva) - hash y si fue una posición nueva
        """
        s_hash = self._compute_hash(s_value)
        s_str = str(s_value)
        s_log = None
        
        # Calcular log10(S) si es posible
        try:
            import math
            if isinstance(s_value, int) and s_value > 0:
                s_log = math.log10(s_value)
        except:
            pass
        
        cursor = self.conn.cursor()
        
        # Verificar si ya existe
        cursor.execute("SELECT id, frecuencia FROM positions WHERE s_hash = ?", (s_hash,))
        existing = cursor.fetchone()
        
        if existing:
            # Actualizar frecuencia
            cursor.execute("""
                UPDATE positions 
                SET frecuencia = frecuencia + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE s_hash = ?
            """, (s_hash,))
            self.conn.commit()
            logger.debug(f"Posición actualizada (frecuencia: {existing['frecuencia'] + 1})")
            return s_hash, False
        else:
            # Insertar nueva posición
            metadata_json = json.dumps(metadata) if metadata else None
            
            cursor.execute("""
                INSERT INTO positions (s_hash, s_value, s_log, fen, metadata)
                VALUES (?, ?, ?, ?, ?)
            """, (s_hash, s_str, s_log, fen, metadata_json))
            self.conn.commit()
            logger.debug(f"Nueva posición guardada: {s_hash[:16]}...")
            return s_hash, True
    
    def save_transition(self, from_s, to_s, move_uci: str, resultado: float = None):
        """
        Guarda una transición entre dos posiciones
        
        Args:
            from_s: S de la posición origen
            to_s: S de la posición destino
            move_uci: Movimiento en notación UCI (ej: "e2e4")
            resultado: 1.0 (blancas ganan), 0.0 (negras ganan), 0.5 (tablas)
        """
        from_hash = self._compute_hash(from_s)
        to_hash = self._compute_hash(to_s)
        
        cursor = self.conn.cursor()
        
        # Verificar si ya existe esta transición
        cursor.execute("""
            SELECT id, frecuencia, winrate_from_move
            FROM transitions 
            WHERE from_s_hash = ? AND to_s_hash = ? AND move_uci = ?
        """, (from_hash, to_hash, move_uci))
        existing = cursor.fetchone()
        
        if existing:
            # Actualizar frecuencia y winrate
            nueva_frec = existing['frecuencia'] + 1
            if resultado is not None:
                nuevo_winrate = (existing['winrate_from_move'] * existing['frecuencia'] + resultado) / nueva_frec
            else:
                nuevo_winrate = existing['winrate_from_move']
            
            cursor.execute("""
                UPDATE transitions
                SET frecuencia = ?, winrate_from_move = ?
                WHERE id = ?
            """, (nueva_frec, nuevo_winrate, existing['id']))
        else:
            # Insertar nueva transición
            cursor.execute("""
                INSERT INTO transitions (from_s_hash, to_s_hash, move_uci, frecuencia, winrate_from_move)
                VALUES (?, ?, ?, 1, ?)
            """, (from_hash, to_hash, move_uci, resultado if resultado is not None else 0.5))
        
        self.conn.commit()
    
    def get_position(self, s_value) -> Optional[Dict[str, Any]]:
        """
        Recupera una posición por su S
        
        Args:
            s_value: S (Gödel number)
        
        Returns:
            Diccionario con los datos de la posición o None
        """
        s_hash = self._compute_hash(s_value)
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM positions WHERE s_hash = ?", (s_hash,))
        row = cursor.fetchone()
        if row:
            return dict(row)
        return None
    
    def get_position_by_fen(self, fen: str) -> Optional[Dict[str, Any]]:
        """Recupera una posición por su FEN"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM positions WHERE fen = ?", (fen,))
        row = cursor.fetchone()
        if row:
            return dict(row)
        return None
    
    def get_best_move(self, s_value) -> Optional[str]:
        """
        Obtiene la mejor jugada para una posición basada en winrate histórico
        
        Returns:
            Movimiento UCI o None
        """
        s_hash = self._compute_hash(s_value)
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT move_uci, winrate_from_move, frecuencia
            FROM transitions
            WHERE from_s_hash = ?
            ORDER BY winrate_from_move DESC, frecuencia DESC
            LIMIT 1
        """, (s_hash,))
        row = cursor.fetchone()
        if row:
            return row['move_uci']
        return None
    
    def get_positions_summary(self, limit: int = 10) -> list:
        """Obtiene resumen de las posiciones más frecuentes"""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT s_hash, s_log, fen, frecuencia, created_at
            FROM positions
            ORDER BY frecuencia DESC
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]
    
    def get_statistics(self) -> Dict[str, Any]:
        """Obtiene estadísticas de la base de datos"""
        cursor = self.conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM positions")
        total_positions = cursor.fetchone()[0]
        
        cursor.execute("SELECT SUM(frecuencia) FROM positions")
        total_occurrences = cursor.fetchone()[0] or 0
        
        cursor.execute("SELECT COUNT(*) FROM transitions")
        total_transitions = cursor.fetchone()[0]
        
        cursor.execute("SELECT AVG(frecuencia) FROM positions")
        avg_freq = cursor.fetchone()[0] or 0
        
        return {
            'total_positions': total_positions,
            'total_occurrences': total_occurrences,
            'total_transitions': total_transitions,
            'avg_frequency': round(avg_freq, 2),
            'db_path': self.db_path,
            'db_size_mb': self._get_db_size_mb()
        }
    
    def _get_db_size_mb(self) -> float:
        """Obtiene el tamaño de la BD en MB"""
        import os
        if os.path.exists(self.db_path):
            return round(os.path.getsize(self.db_path) / (1024 * 1024), 2)
        return 0.0
    
    def close(self):
        """Cierra la conexión a la base de datos"""
        if self.conn:
            # Actualizar metadata
            cursor = self.conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO metadata (key, value)
                VALUES (?, ?)
            """, ("last_closed", datetime.now().isoformat()))
            self.conn.commit()
            self.conn.close()
            logger.info("Base de datos cerrada")
    
    def vacuum(self):
        """Optimiza la base de datos (reduce tamaño)"""
        self.conn.execute("VACUUM")
        logger.info("VACUUM completado")