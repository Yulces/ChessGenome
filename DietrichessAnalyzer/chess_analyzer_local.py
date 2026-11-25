#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
CHESSANALYZER - Sistema de Análisis de Ajedrez con Representación Gödeliana
Versión: 3.0 COMPLETA - CON RED NEURONAL INTEGRADA
"""

import sys
import os
from PyQt5.QtCore import Qt, QCoreApplication, QPointF, QPoint, pyqtSignal, QTimer
from PyQt5.QtGui import QPainter, QColor, QPen, QFont, QIcon, QPolygonF, QPixmap
from PyQt5.QtSvg import QSvgWidget, QSvgRenderer
from PyQt5.QtWidgets import (QApplication, QMainWindow, QDesktopWidget, QTabWidget, QFileDialog, 
                            QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QTextEdit, QWidget, 
                            QMessageBox, QDialog, QTableWidget, QTableWidgetItem, QScrollArea, 
                            QHeaderView, QComboBox, QTextBrowser, QSplitter, QSizePolicy, 
                            QScrollBar, QFrame, QGroupBox, QFormLayout, QCheckBox, QProgressDialog,
                            QGridLayout, QRadioButton, QButtonGroup, QDialogButtonBox, QGraphicsScene,
                            QGraphicsView, QGraphicsEllipseItem, QGraphicsLineItem, QGraphicsItem,
                            QGraphicsPolygonItem, QLineEdit, QProgressBar)

import chess
import chess.pgn
import chess.svg
import numpy as np
import matplotlib
matplotlib.use('Agg')
matplotlib.use('Qt5Agg')
from matplotlib import pyplot as plt
from matplotlib.ticker import ScalarFormatter
from scipy.interpolate import make_interp_spline
from math import log10, isfinite
from io import StringIO, BytesIO
from PyQt5.QtCore import QTranslator, QLocale
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.backends.backend_qt5agg import NavigationToolbar2QT as NavigationToolbar
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT
from datetime import datetime
import logging
from collections import defaultdict
import hashlib
import sqlite3
import json
import shutil
import re

# ============================================================================
# VERIFICACIÓN DE DISPONIBILIDAD DE RED NEURONAL
# ============================================================================
import sys
import os

# Agregar el directorio actual al path para encontrar neural_network.py
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
    print(f"📁 Directorio agregado al path: {current_dir}")

NEURAL_AVAILABLE = False
try:
    from neural_network import NeuralNetworkDialog, open_neural_network_dialog
    NEURAL_AVAILABLE = True
    print("✅ Red Neuronal disponible")
except ImportError as e:
    print(f"⚠️ Red Neuronal no disponible: {e}")
    print("   Para instalarla: pip install tensorflow scikit-learn")
except Exception as e:
    print(f"⚠️ Error cargando red neuronal: {e}")

if sys.platform == 'win32':
    os.environ['QT_AUTO_SCREEN_SCALE_FACTOR'] = '1'
    os.environ['QT_SCALE_FACTOR'] = '1'
    os.environ['QT_SCREEN_SCALE_FACTORS'] = '1'

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

if hasattr(Qt, 'AA_EnableHighDpiScaling'):
    QApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
if hasattr(Qt, 'AA_UseHighDpiPixmaps'):
    QApplication.setAttribute(Qt.AA_UseHighDpiPixmaps, True)

def get_base_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    else:
        return os.path.dirname(os.path.abspath(__file__))

def ensure_directories():
    base_dir = get_base_dir()
    directories = [
        os.path.join(base_dir, "data"),
        os.path.join(base_dir, "engines"),
        os.path.join(base_dir, "logs"),
        os.path.join(base_dir, "exports"),
        os.path.join(base_dir, "models"),
    ]
    for directory in directories:
        os.makedirs(directory, exist_ok=True)
    return base_dir


# ============================================================================
# CLASE: StockfishEngine - VERSIÓN ORIGINAL FUNCIONAL
# ============================================================================
class StockfishEngine:
    def __init__(self, engine_path=None, depth=18, threads=4, hash_size=256):
        self.engine = None
        self.depth = depth
        self.threads = threads
        self.hash_size = hash_size
        self.is_ready = False
        self.engine_path = engine_path
        self.last_error = None
        self.cache = {}
        
        if engine_path is None:
            explicit_path = r"D:\DIDI\ChessAnalyzer\engines\stockfish.exe"
            if os.path.exists(explicit_path):
                self.engine_path = explicit_path
                logger.info(f"Usando ruta absoluta: {self.engine_path}")
            else:
                self.engine_path = self._find_stockfish()
        
        if self.engine_path and os.path.exists(self.engine_path):
            logger.info(f"Inicializando Stockfish desde: {self.engine_path}")
            self._initialize_engine()
        else:
            self.last_error = f"Stockfish no encontrado en: {self.engine_path}"
            logger.warning(self.last_error)
    
    def _find_stockfish(self):
        base_dir = get_base_dir()
        explicit_path = r"D:\DIDI\ChessAnalyzer\engines\stockfish.exe"
        if os.path.exists(explicit_path):
            return explicit_path
        
        stockfish_names = ["stockfish.exe", "stockfish", "stockfish_18.exe", "stockfish_18", "sf.exe", "sf"]
        search_paths = [
            os.path.join(base_dir, "engines"), os.path.join(base_dir, "Engine"),
            os.path.join(base_dir, "stockfish"), base_dir,
            os.getcwd(), r"D:\DIDI\ChessAnalyzer\engines", r"D:\DIDI\ChessAnalyzer"
        ]
        
        for search_path in search_paths:
            if not os.path.exists(search_path):
                continue
            for name in stockfish_names:
                full_path = os.path.join(search_path, name)
                if os.path.exists(full_path):
                    return full_path
        
        self.last_error = "Stockfish no encontrado en ninguna ubicación"
        return None
    
    def set_engine_path(self, path):
        if os.path.exists(path):
            self.engine_path = path
            self._initialize_engine()
            return True
        else:
            self.last_error = f"El archivo no existe: {path}"
            return False
    
    def _initialize_engine(self):
        """Inicializa el motor - VERSIÓN ORIGINAL FUNCIONAL"""
        try:
            from stockfish import Stockfish
            
            if not os.path.exists(self.engine_path):
                self.last_error = f"El archivo no existe: {self.engine_path}"
                self.is_ready = False
                return
            
            logger.info(f"Inicializando motor desde: {self.engine_path}")
            
            params = {
                "Threads": self.threads,
                "Hash": self.hash_size,
            }
            
            self.engine = Stockfish(
                path=self.engine_path,
                depth=self.depth,
                parameters=params
            )
            
            try:
                fen_inicial = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                self.engine.set_fen_position(fen_inicial)
                best_move = self.engine.get_best_move()
                if best_move:
                    self.is_ready = True
                    logger.info(f"Stockfish iniciado (profundidad: {self.depth}, threads: {self.threads})")
                    self.last_error = None
                    self.cache = {}
                else:
                    self.last_error = "El motor no devolvió un movimiento válido"
                    self.is_ready = False
            except Exception as e:
                self.last_error = f"El motor no responde: {str(e)}"
                self.is_ready = False
                logger.error(self.last_error)
            
        except ImportError:
            self.last_error = "Módulo 'stockfish' no instalado. Ejecuta: pip install stockfish"
            self.is_ready = False
        except Exception as e:
            self.last_error = f"Error iniciando Stockfish: {str(e)}"
            self.is_ready = False
            logger.error(self.last_error)
    
    def get_best_move(self, fen, depth=None):
        if not self.is_ready:
            logger.warning(f"Stockfish no listo: {self.last_error}")
            return None
        
        try:
            cache_key = f"{fen}_{depth or self.depth}"
            if cache_key in self.cache:
                logger.debug(f"✅ Cache hit para FEN: {fen[:30]}...")
                return self.cache[cache_key]
            
            self.engine.set_fen_position(fen)
            best_move = self.engine.get_best_move()
            
            if not best_move:
                return None
            
            evaluation = self.engine.get_evaluation()
            best_move_san = self._uci_to_san(fen, best_move)
            
            result = {
                'best_move': best_move,
                'best_move_san': best_move_san,
                'score': evaluation.get('value', 0),
                'mate': evaluation.get('mate', None),
                'depth': depth or self.depth,
                'fen': fen,
            }
            
            self.cache[cache_key] = result
            
            if len(self.cache) > 1000:
                keys = list(self.cache.keys())
                for k in keys[:200]:
                    del self.cache[k]
            
            return result
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error obteniendo mejor jugada: {str(e)}")
            return None
    
    def analyze_position(self, fen, depth=None):
        if not self.is_ready:
            logger.warning(f"Stockfish no listo: {self.last_error}")
            return None
        
        try:
            cache_key = f"analyze_{fen}_{depth or self.depth}"
            if cache_key in self.cache:
                logger.debug(f"✅ Cache hit para análisis: {fen[:30]}...")
                return self.cache[cache_key]
            
            self.engine.set_fen_position(fen)
            best_move = self.engine.get_best_move()
            
            if not best_move:
                return None
            
            evaluation = self.engine.get_evaluation()
            top_moves = self.engine.get_top_moves(5)
            best_move_san = self._uci_to_san(fen, best_move)
            
            result = {
                'best_move': best_move,
                'best_move_san': best_move_san,
                'score': evaluation.get('value', 0),
                'mate': evaluation.get('mate', None),
                'depth': depth or self.depth,
                'fen': fen,
                'top_moves': top_moves,
            }
            
            self.cache[cache_key] = result
            
            if len(self.cache) > 1000:
                keys = list(self.cache.keys())
                for k in keys[:200]:
                    del self.cache[k]
            
            return result
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error analizando posición: {str(e)}")
            return None
    
    def _uci_to_san(self, fen, uci_move):
        try:
            board = chess.Board(fen)
            move = chess.Move.from_uci(uci_move)
            if board.is_legal(move):
                return board.san(move)
            return uci_move
        except:
            return uci_move
    
    def is_available(self):
        return self.is_ready
    
    def get_error(self):
        return self.last_error
    
    def clear_cache(self):
        self.cache = {}
        logger.info("Caché de Stockfish limpiado")
    
    def set_depth(self, depth):
        if depth >= 1:
            self.depth = depth
            if self.engine:
                try:
                    self.engine.update_engine_parameters({"depth": depth})
                except:
                    pass
            self.clear_cache()
            logger.info(f"Profundidad cambiada a: {depth}")


# ============================================================================
# CLASE: PositionDatabase
# ============================================================================
class PositionDatabase:
    def __init__(self, db_path: str = None):
        if db_path is None:
            base_dir = get_base_dir()
            data_dir = os.path.join(base_dir, "data")
            os.makedirs(data_dir, exist_ok=True)
            db_path = os.path.join(data_dir, "positions.db")
        
        self.db_path = db_path
        self.conn = None
        self._connect()
        self._init_tables()
    
    def _connect(self):
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.execute("PRAGMA cache_size=-65536")
        self.conn.execute("PRAGMA temp_store=MEMORY")
    
    def _init_tables(self):
        cursor = self.conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS positions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                s_hash TEXT UNIQUE NOT NULL,
                s_value TEXT NOT NULL,
                s_log REAL,
                fen TEXT NOT NULL,
                frecuencia INTEGER DEFAULT 1,
                winrate_white REAL DEFAULT 0.5,
                winrate_turn REAL DEFAULT 0.5,
                mejor_jugada TEXT,
                segunda_mejor TEXT,
                eval_engine INTEGER,
                sf_best_move TEXT,
                sf_score INTEGER,
                sf_depth INTEGER,
                sf_analysis TEXT,
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
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
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_s_hash ON positions(s_hash)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_fen ON positions(fen)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_s_log ON positions(s_log)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_frecuencia ON positions(frecuencia DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_from_hash ON transitions(from_s_hash)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_to_hash ON transitions(to_s_hash)")
        
        self.conn.commit()
        logger.info(f"Base de datos inicializada: {self.db_path}")
    
    def _compute_hash(self, s_value) -> str:
        import hashlib
        if isinstance(s_value, int):
            s_str = str(s_value)
        else:
            s_str = str(s_value)
        return hashlib.sha256(s_str.encode()).hexdigest()
    
    def save_position(self, s_value, fen: str, metadata: dict = None, sf_analysis: dict = None):
        s_hash = self._compute_hash(s_value)
        s_str = str(s_value)
        s_log = None
        try:
            import math
            if isinstance(s_value, int) and s_value > 0:
                s_log = math.log10(s_value)
        except:
            pass
        
        cursor = self.conn.cursor()
        cursor.execute("SELECT id, frecuencia FROM positions WHERE s_hash = ?", (s_hash,))
        existing = cursor.fetchone()
        
        sf_best_move = sf_analysis.get('best_move') if sf_analysis else None
        sf_score = sf_analysis.get('score') if sf_analysis else None
        sf_depth = sf_analysis.get('depth') if sf_analysis else None
        sf_analysis_json = json.dumps(sf_analysis) if sf_analysis else None
        
        if existing:
            cursor.execute("""
                UPDATE positions 
                SET frecuencia = frecuencia + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE s_hash = ?
            """, (s_hash,))
            self.conn.commit()
            return s_hash, False
        else:
            metadata_json = json.dumps(metadata) if metadata else None
            cursor.execute("""
                INSERT INTO positions 
                (s_hash, s_value, s_log, fen, metadata, sf_best_move, sf_score, sf_depth, sf_analysis)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (s_hash, s_str, s_log, fen, metadata_json, sf_best_move, sf_score, sf_depth, sf_analysis_json))
            self.conn.commit()
            return s_hash, True
    
    def save_transition(self, from_s, to_s, move_uci: str, resultado: float = None):
        from_hash = self._compute_hash(from_s)
        to_hash = self._compute_hash(to_s)
        
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT id, frecuencia, winrate_from_move
            FROM transitions 
            WHERE from_s_hash = ? AND to_s_hash = ? AND move_uci = ?
        """, (from_hash, to_hash, move_uci))
        existing = cursor.fetchone()
        
        if existing:
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
            cursor.execute("""
                INSERT INTO transitions (from_s_hash, to_s_hash, move_uci, frecuencia, winrate_from_move)
                VALUES (?, ?, ?, 1, ?)
            """, (from_hash, to_hash, move_uci, resultado if resultado is not None else 0.5))
        
        self.conn.commit()
    
    def get_position_by_fen(self, fen: str):
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM positions WHERE fen = ?", (fen,))
        row = cursor.fetchone()
        return dict(row) if row else None
    
    def get_position_by_hash(self, s_hash: str):
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM positions WHERE s_hash = ?", (s_hash,))
        row = cursor.fetchone()
        return dict(row) if row else None
    
    def get_best_move_from_hash(self, s_hash: str) -> str:
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT move_uci, winrate_from_move, frecuencia
            FROM transitions
            WHERE from_s_hash = ?
            ORDER BY winrate_from_move DESC, frecuencia DESC
            LIMIT 1
        """, (s_hash,))
        row = cursor.fetchone()
        return row['move_uci'] if row else None
    
    def get_transitions_from_hash(self, s_hash: str, limit: int = 20):
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT move_uci, frecuencia, winrate_from_move
            FROM transitions
            WHERE from_s_hash = ?
            ORDER BY frecuencia DESC
            LIMIT ?
        """, (s_hash, limit))
        return [dict(row) for row in cursor.fetchall()]
    
    def get_positions_summary(self, limit: int = 50):
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT s_hash, s_value, fen, frecuencia, created_at, winrate_white,
                   sf_best_move, sf_score, sf_depth
            FROM positions
            ORDER BY frecuencia DESC
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]
    
    def get_statistics(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM positions")
        total_positions = cursor.fetchone()[0]
        cursor.execute("SELECT SUM(frecuencia) FROM positions")
        total_occurrences = cursor.fetchone()[0] or 0
        cursor.execute("SELECT COUNT(*) FROM transitions")
        total_transitions = cursor.fetchone()[0]
        cursor.execute("SELECT AVG(frecuencia) FROM positions")
        avg_freq = cursor.fetchone()[0] or 0
        cursor.execute("SELECT COUNT(*) FROM positions WHERE sf_best_move IS NOT NULL")
        positions_with_sf = cursor.fetchone()[0]
        
        import os
        db_size = round(os.path.getsize(self.db_path) / (1024 * 1024), 2) if os.path.exists(self.db_path) else 0
        
        return {
            'total_positions': total_positions,
            'total_occurrences': total_occurrences,
            'total_transitions': total_transitions,
            'avg_frequency': round(avg_freq, 2),
            'positions_with_sf': positions_with_sf,
            'db_path': self.db_path,
            'db_size_mb': db_size
        }
    
    def update_position_with_sf(self, fen: str, sf_analysis: dict):
        cursor = self.conn.cursor()
        cursor.execute("""
            UPDATE positions 
            SET sf_best_move = ?, sf_score = ?, sf_depth = ?, sf_analysis = ?
            WHERE fen = ?
        """, (
            sf_analysis.get('best_move'),
            sf_analysis.get('score'),
            sf_analysis.get('depth'),
            json.dumps(sf_analysis),
            fen
        ))
        self.conn.commit()
    
    def close(self):
        if self.conn:
            cursor = self.conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO metadata (key, value)
                VALUES (?, ?)
            """, ("last_closed", datetime.now().isoformat()))
            self.conn.commit()
            self.conn.close()
            logger.info("Base de datos cerrada")


# ============================================================================
# CLASE: ChessBoardWidget
# ============================================================================
class ChessBoardWidget(QWidget):
    move_made = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumSize(350, 350)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)

        self.board = chess.Board()
        self.selected_square = None
        self.pixmap = None
        self.edit_mode = False
        self.selected_piece = None
        self.move_history = []
        self.board_history = []
        self.current_index = 0

        self.renderer = QSvgRenderer()
        self.setMouseTracking(True)
        self.update_board()

    def update_board(self):
        try:
            size = min(self.width(), self.height())
            if size < 10:
                size = 350

            squares = [self.selected_square] if self.selected_square is not None else []

            svg_data = chess.svg.board(
                board=self.board,
                size=size,
                squares=squares,
                coordinates=True
            )

            self.renderer.load(svg_data.encode('utf-8'))

            pixmap = QPixmap(size, size)
            pixmap.fill(Qt.transparent)

            painter = QPainter(pixmap)
            self.renderer.render(painter)
            painter.end()

            self.pixmap = pixmap
            self.update()

        except Exception as e:
            logger.error(f"Error updating board: {str(e)}")
            self.pixmap = None
            self.update()

    def paintEvent(self, event):
        if self.pixmap is not None:
            painter = QPainter(self)
            x = (self.width() - self.pixmap.width()) // 2
            y = (self.height() - self.pixmap.height()) // 2
            painter.drawPixmap(x, y, self.pixmap)
            painter.end()

    def mousePressEvent(self, event):
        if self.pixmap is None:
            return

        size = self.pixmap.width()
        x_offset = (self.width() - size) // 2
        y_offset = (self.height() - size) // 2

        x = event.pos().x() - x_offset
        y = event.pos().y() - y_offset

        if x < 0 or y < 0 or x >= size or y >= size:
            return

        square_size = size / 8
        col = int(x / square_size)
        row = 7 - int(y / square_size)

        if 0 <= col < 8 and 0 <= row < 8:
            square = chess.square(col, row)

            if self.edit_mode:
                self.handle_edit_click(square)
            else:
                self.handle_move_click(square)

    def handle_edit_click(self, square):
        if self.selected_piece:
            piece_symbol = self.selected_piece
            piece_color = chess.WHITE if piece_symbol.isupper() else chess.BLACK

            symbol_to_type = {
                'K': chess.KING, 'Q': chess.QUEEN, 'R': chess.ROOK,
                'B': chess.BISHOP, 'N': chess.KNIGHT, 'P': chess.PAWN,
                'k': chess.KING, 'q': chess.QUEEN, 'r': chess.ROOK,
                'b': chess.BISHOP, 'n': chess.KNIGHT, 'p': chess.PAWN
            }
            piece_type = symbol_to_type.get(piece_symbol)

            if piece_type is not None:
                self.board.set_piece_at(square, chess.Piece(piece_type, piece_color))
                self.selected_piece = None
                self.update_board()
        else:
            piece = self.board.piece_at(square)
            if piece:
                self.board.remove_piece_at(square)
                self.update_board()
            else:
                self.selected_square = square if self.selected_square != square else None
                self.update_board()

    def handle_move_click(self, square):
        if self.selected_square is None:
            piece = self.board.piece_at(square)
            if piece and piece.color == self.board.turn:
                self.selected_square = square
                self.update_board()
        else:
            from_square = self.selected_square
            to_square = square

            move = None
            for legal_move in self.board.legal_moves:
                if legal_move.from_square == from_square and legal_move.to_square == to_square:
                    move = legal_move
                    break

            if move:
                san = self.board.san(move)
                self.board.push(move)

                self.move_history.append(san)
                self.board_history.append(self.board.fen())
                self.current_index = len(self.move_history)

                self.selected_square = None
                self.update_board()
                self.move_made.emit(san)
            else:
                self.selected_square = None
                self.update_board()

    def undo_move(self):
        if self.current_index > 0 and self.move_history:
            self.current_index -= 1
            if self.current_index == 0:
                self.board = chess.Board()
                self.board_history = []
            else:
                self.board = chess.Board(self.board_history[self.current_index - 1])
            self.selected_square = None
            self.update_board()

    def clear_board(self):
        self.board.clear()
        self.selected_square = None
        self.update_board()

    def clear_moves(self):
        self.move_history = []
        self.board_history = []
        self.current_index = 0
        self.selected_square = None
        self.update_board()

    def reset_all(self):
        self.board = chess.Board()
        self.move_history = []
        self.board_history = []
        self.current_index = 0
        self.selected_square = None
        self.update_board()

    def go_to_move(self, index):
        if 0 <= index <= len(self.board_history):
            self.current_index = index
            if index == 0:
                self.board = chess.Board()
            else:
                self.board = chess.Board(self.board_history[index - 1])
            self.selected_square = None
            self.update_board()

    def get_pgn_string(self, headers=None):
        game = chess.pgn.Game()
        node = game

        if headers is None:
            headers = {}

        game.headers["Event"] = headers.get("Event", "Edited Position")
        game.headers["Site"] = headers.get("Site", "?")
        game.headers["Date"] = headers.get("Date", datetime.now().strftime("%Y.%m.%d"))
        game.headers["Round"] = headers.get("Round", "?")
        game.headers["White"] = headers.get("White", "?")
        game.headers["Black"] = headers.get("Black", "?")
        game.headers["Result"] = headers.get("Result", "*")

        if self.move_history:
            board = chess.Board()
            for san in self.move_history:
                try:
                    move = board.parse_san(san)
                    node = node.add_variation(move)
                    board.push(move)
                except Exception:
                    continue

        exporter = chess.pgn.StringExporter(headers=True, variations=True, comments=False)
        return game.accept(exporter)

    def get_fen(self):
        return self.board.fen()

    def set_board(self, board):
        self.board = board.copy()
        self.selected_square = None
        self.update_board()

    def set_edit_mode(self, enabled):
        self.edit_mode = enabled
        if enabled:
            self.selected_square = None
        self.update_board()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.update_board()


# ============================================================================
# DICCIONARIOS DE TRADUCCION
# ============================================================================
EDITOR_DIALOG_TEXTS = {
    'en': {
        'editor_title': 'Position Editor - Move pieces to build variation',
        'editor_mode': 'Mode:',
        'editor_play_moves': 'Play Moves',
        'editor_edit_pieces': 'Edit Pieces',
        'editor_called_from': 'Called from:',
        'editor_undo': 'Undo Move',
        'editor_clear_board': 'Clear Board',
        'editor_initial_pos': 'Initial Pos',
        'editor_reset_all': 'Reset All',
        'editor_movements': 'Movements',
        'editor_pieces': 'Pieces (Edit Mode)',
        'editor_white': 'White',
        'editor_black': 'Black',
        'editor_delete': 'Delete',
        'editor_pgn_headers': 'PGN Headers',
        'editor_event': 'Event:',
        'editor_site': 'Site:',
        'editor_date': 'Date:',
        'editor_round': 'Round:',
        'editor_white_player': 'White:',
        'editor_black_player': 'Black:',
        'editor_result': 'Result:',
        'editor_today': 'Today',
        'editor_pgn_preview': 'PGN Preview',
        'editor_update_preview': 'Update Preview',
        'editor_position_info': 'Position Info',
        'editor_fen_label': 'FEN:',
        'editor_ok': 'OK',
        'editor_cancel': 'Cancel',
        'editor_editor_tab': 'Editor',
        'editor_headers_tab': 'PGN Headers',
        'editor_moves_placeholder': 'Movements will appear here...',
    },
    'es': {
        'editor_title': 'Editor de Posiciones - Mueve piezas para construir variantes',
        'editor_mode': 'Modo:',
        'editor_play_moves': 'Jugar Movimientos',
        'editor_edit_pieces': 'Editar Piezas',
        'editor_called_from': 'Llamado desde:',
        'editor_undo': 'Deshacer Movimiento',
        'editor_clear_board': 'Limpiar Tablero',
        'editor_initial_pos': 'Posicion Inicial',
        'editor_reset_all': 'Reiniciar Todo',
        'editor_movements': 'Movimientos',
        'editor_pieces': 'Piezas (Modo Edicion)',
        'editor_white': 'Blancas',
        'editor_black': 'Negras',
        'editor_delete': 'Eliminar',
        'editor_pgn_headers': 'Cabeceras PGN',
        'editor_event': 'Evento:',
        'editor_site': 'Lugar:',
        'editor_date': 'Fecha:',
        'editor_round': 'Ronda:',
        'editor_white_player': 'Blancas:',
        'editor_black_player': 'Negras:',
        'editor_result': 'Resultado:',
        'editor_today': 'Hoy',
        'editor_pgn_preview': 'Vista Previa PGN',
        'editor_update_preview': 'Actualizar Vista',
        'editor_position_info': 'Informacion de Posicion',
        'editor_fen_label': 'FEN:',
        'editor_ok': 'Aceptar',
        'editor_cancel': 'Cancelar',
        'editor_editor_tab': 'Editor',
        'editor_headers_tab': 'Cabeceras PGN',
        'editor_moves_placeholder': 'Los movimientos apareceran aqui...',
    },
    'de': {
        'editor_title': 'Positionseditor - Figuren bewegen fur Varianten',
        'editor_mode': 'Modus:',
        'editor_play_moves': 'Zuge spielen',
        'editor_edit_pieces': 'Figuren bearbeiten',
        'editor_called_from': 'Aufgerufen von:',
        'editor_undo': 'Zug ruckgangig',
        'editor_clear_board': 'Brett leeren',
        'editor_initial_pos': 'Ausgangsposition',
        'editor_reset_all': 'Alles zurucksetzen',
        'editor_movements': 'Zuge',
        'editor_pieces': 'Figuren (Bearbeitungsmodus)',
        'editor_white': 'Weiß',
        'editor_black': 'Schwarz',
        'editor_delete': 'Loschen',
        'editor_pgn_headers': 'PGN-Kopfzeilen',
        'editor_event': 'Ereignis:',
        'editor_site': 'Ort:',
        'editor_date': 'Datum:',
        'editor_round': 'Runde:',
        'editor_white_player': 'Weiß:',
        'editor_black_player': 'Schwarz:',
        'editor_result': 'Ergebnis:',
        'editor_today': 'Heute',
        'editor_pgn_preview': 'PGN-Vorschau',
        'editor_update_preview': 'Vorschau aktualisieren',
        'editor_position_info': 'Positionsinformation',
        'editor_fen_label': 'FEN:',
        'editor_ok': 'OK',
        'editor_cancel': 'Abbrechen',
        'editor_editor_tab': 'Editor',
        'editor_headers_tab': 'PGN-Kopfzeilen',
        'editor_moves_placeholder': 'Zuge werden hier angezeigt...',
    }
}

SEARCH_DIALOG_TEXTS = {
    'en': {
        'search_title': 'Search Positions',
        'search_tab_search': 'Search',
        'search_tab_stats': 'Statistics',
        'search_board_group': 'Interactive Board',
        'search_board_clear': 'Clear Board',
        'search_board_initial': 'Initial Position',
        'search_fen_group': 'FEN Search',
        'search_fen_placeholder': 'Enter FEN string...',
        'search_btn_search': 'Search (Open Editor)',
        'search_btn_clear': 'Clear All',
        'search_btn_example': 'Load Example',
        'search_results_group': 'Search Results',
        'search_moves_label': 'Most Common Moves from this Position:',
        'search_move_uci': 'Move (UCI)',
        'search_move_san': 'Move (SAN)',
        'search_frequency': 'Frequency',
        'search_winrate': 'Winrate',
        'search_stats_label': 'Database Statistics',
        'search_top_positions': 'Most Frequent Positions (FEN and S Value):',
        'search_rank': 'Rank',
        'search_fen_header': 'FEN (complete)',
        'search_s_value_header': 'S Value',
        'search_freq_header': 'Frequency',
        'search_wr_header': 'Winrate',
        'search_btn_close': 'Close',
        'search_position_found': 'Position found in database!',
        'search_position_not_found': 'Position not found in database.',
        'search_btn_refresh': 'Refresh Statistics',
        'search_fen_label': 'FEN Input',
        'search_position_info': 'Position Info',
        'search_no_results': 'No results found',
        'search_loading': 'Loading...',
        'search_stockfish_best': 'Stockfish Best Move:',
        'search_stockfish_score': 'Score:',
        'search_stockfish_depth': 'Depth:',
        'search_stockfish_top': 'Top Moves:',
        'search_stockfish_group': 'Stockfish Analysis',
        'search_btn_analyze_sf': 'Analyze with Stockfish',
        'search_analyzing': 'Analyzing...',
        'search_sf_not_available': 'Stockfish engine is not available.',
        'search_sf_saved': 'Analysis saved to database!',
        'search_sf_not_saved': 'Position not in database.',
        'search_sf_failed': 'Stockfish analysis failed',
        'search_col_sf': 'Stockfish',
        'search_col_sf_best': 'SF Best',
        'search_col_sf_score': 'SF Score',
        'search_sf_select_engine': 'Select Stockfish Engine',
        'search_sf_engine_files': 'Stockfish Engine (*.exe);;All Files (*)',
        'search_sf_btn_select': 'Select Engine...',
    },
    'es': {
        'search_title': 'Buscar Posiciones',
        'search_tab_search': 'Buscar',
        'search_tab_stats': 'Estadisticas',
        'search_board_group': 'Tablero Interactivo',
        'search_board_clear': 'Limpiar Tablero',
        'search_board_initial': 'Posicion Inicial',
        'search_fen_group': 'Busqueda por FEN',
        'search_fen_placeholder': 'Ingrese FEN...',
        'search_btn_search': 'Buscar (Abrir Editor)',
        'search_btn_clear': 'Limpiar Todo',
        'search_btn_example': 'Cargar Ejemplo',
        'search_results_group': 'Resultados de Busqueda',
        'search_moves_label': 'Movimientos mas comunes desde esta posicion:',
        'search_move_uci': 'Movimiento (UCI)',
        'search_move_san': 'Movimiento (SAN)',
        'search_frequency': 'Frecuencia',
        'search_winrate': 'Tasa de Victoria',
        'search_stats_label': 'Estadisticas de la Base de Datos',
        'search_top_positions': 'Posiciones mas frecuentes (FEN y Valor S):',
        'search_rank': 'Posicion',
        'search_fen_header': 'FEN (completo)',
        'search_s_value_header': 'Valor S',
        'search_freq_header': 'Frecuencia',
        'search_wr_header': 'Tasa de Victoria',
        'search_btn_close': 'Cerrar',
        'search_position_found': '¡Posicion encontrada en la base de datos!',
        'search_position_not_found': 'Posicion no encontrada en la base de datos.',
        'search_btn_refresh': 'Actualizar Estadisticas',
        'search_fen_label': 'Entrada FEN',
        'search_position_info': 'Informacion de la Posicion',
        'search_no_results': 'No se encontraron resultados',
        'search_loading': 'Cargando...',
        'search_stockfish_best': 'Mejor Movimiento Stockfish:',
        'search_stockfish_score': 'Puntuacion:',
        'search_stockfish_depth': 'Profundidad:',
        'search_stockfish_top': 'Mejores Movimientos:',
        'search_stockfish_group': 'Analisis Stockfish',
        'search_btn_analyze_sf': 'Analizar con Stockfish',
        'search_analyzing': 'Analizando...',
        'search_sf_not_available': 'El motor Stockfish no esta disponible.',
        'search_sf_saved': '¡Analisis guardado en la base de datos!',
        'search_sf_not_saved': 'Posicion no esta en la base de datos.',
        'search_sf_failed': 'Fallo el analisis de Stockfish',
        'search_col_sf': 'Stockfish',
        'search_col_sf_best': 'SF Mejor',
        'search_col_sf_score': 'SF Puntuacion',
        'search_sf_select_engine': 'Seleccionar Motor Stockfish',
        'search_sf_engine_files': 'Motor Stockfish (*.exe);;Todos los Archivos (*)',
        'search_sf_btn_select': 'Seleccionar Motor...',
    },
    'de': {
        'search_title': 'Positionen suchen',
        'search_tab_search': 'Suchen',
        'search_tab_stats': 'Statistiken',
        'search_board_group': 'Interaktives Brett',
        'search_board_clear': 'Brett leeren',
        'search_board_initial': 'Ausgangsposition',
        'search_fen_group': 'FEN-Suche',
        'search_fen_placeholder': 'FEN eingeben...',
        'search_btn_search': 'Suchen (Editor offnen)',
        'search_btn_clear': 'Alles loschen',
        'search_btn_example': 'Beispiel laden',
        'search_results_group': 'Suchergebnisse',
        'search_moves_label': 'Haufigste Zuge von dieser Position:',
        'search_move_uci': 'Zug (UCI)',
        'search_move_san': 'Zug (SAN)',
        'search_frequency': 'Haufigkeit',
        'search_winrate': 'Gewinnrate',
        'search_stats_label': 'Datenbankstatistiken',
        'search_top_positions': 'Haufigste Positionen (FEN und S-Wert):',
        'search_rank': 'Rang',
        'search_fen_header': 'FEN (vollstandig)',
        'search_s_value_header': 'S-Wert',
        'search_freq_header': 'Haufigkeit',
        'search_wr_header': 'Gewinnrate',
        'search_btn_close': 'Schließen',
        'search_position_found': 'Position in Datenbank gefunden!',
        'search_position_not_found': 'Position nicht in Datenbank gefunden.',
        'search_btn_refresh': 'Statistiken aktualisieren',
        'search_fen_label': 'FEN-Eingabe',
        'search_position_info': 'Positionsinformation',
        'search_no_results': 'Keine Ergebnisse gefunden',
        'search_loading': 'Laden...',
        'search_stockfish_best': 'Stockfish bester Zug:',
        'search_stockfish_score': 'Bewertung:',
        'search_stockfish_depth': 'Tiefe:',
        'search_stockfish_top': 'Beste Zuge:',
        'search_stockfish_group': 'Stockfish Analyse',
        'search_btn_analyze_sf': 'Mit Stockfish analysieren',
        'search_analyzing': 'Analysiere...',
        'search_sf_not_available': 'Stockfish Engine nicht verfugbar.',
        'search_sf_saved': 'Analyse in Datenbank gespeichert!',
        'search_sf_not_saved': 'Position nicht in Datenbank.',
        'search_sf_failed': 'Stockfish Analyse fehlgeschlagen',
        'search_col_sf': 'Stockfish',
        'search_col_sf_best': 'SF Bester',
        'search_col_sf_score': 'SF Bewertung',
        'search_sf_select_engine': 'Stockfish Engine auswahlen',
        'search_sf_engine_files': 'Stockfish Engine (*.exe);;Alle Dateien (*)',
        'search_sf_btn_select': 'Engine auswahlen...',
    }
}

MULTIPLE_PGN_TEXTS = {
    'en': {
        'tab_title': 'Multiple PGN Analysis',
        'btn_load_pgn': 'Load PGN (Multiple Games)',
        'btn_analyze_all': 'Analyze All Games',
        'btn_clear_data': 'Clear Data',
        'btn_send_to_analysis': 'Send to PGN Analysis',
        'games_label': 'Games in PGN File:',
        'log_label': 'Analysis Log:',
        'games_count': 'Games: {0}',
        'status_pending': 'Pending',
        'status_analyzed': 'Analyzed',
        'status_error': 'Error',
        'col_number': '#',
        'col_event': 'Event',
        'col_white': 'White',
        'col_black': 'Black',
        'col_result': 'Result',
        'col_moves': 'Moves',
        'col_status': 'Status',
        'loading_games': 'Loaded {0} games from: {1}',
        'load_error': 'Error loading: {0}',
        'start_analysis': 'Starting analysis of {0} games...',
        'analyzing_game': 'Analyzing game {0}/{1}: {2}',
        'positions_processed': '  Processed {0} positions',
        'game_error': '  Error at position {0}: {1}',
        'analysis_complete': 'Analysis complete! Processed {0} games.',
        'db_stats': 'Database: {0} positions, {1} occurrences',
        'clear_confirm': 'This will clear all loaded games. Continue?',
        'data_cleared': 'Data cleared.',
        'game_info_title': 'Game {0}',
        'game_info': 'Game {0}:\nEvent: {1}\nSite: {2}\nDate: {3}\nRound: {4}\nWhite: {5}\nBlack: {6}\nResult: {7}\nMoves: {8}',
        'analysis_complete_title': 'Analysis Complete',
        'analysis_complete_msg': 'Analysis completed!\n\nGames analyzed: {0}\nTotal positions in DB: {1}\nTotal occurrences: {2}',
        'no_games_warning': 'No valid games found in the file.',
        'load_pgn_title': 'Load PGN with Multiple Games',
        'pgn_files': 'PGN Files (*.pgn);;All Files (*)',
        'clear_question': 'Clear Data',
        'cancel_analysis': 'Cancel Analysis',
    },
    'es': {
        'tab_title': 'Analisis Multiple PGN',
        'btn_load_pgn': 'Cargar PGN (Multiples Partidas)',
        'btn_analyze_all': 'Analizar Todas las Partidas',
        'btn_clear_data': 'Limpiar Datos',
        'btn_send_to_analysis': 'Enviar a Analisis PGN',
        'games_label': 'Partidas en el Archivo PGN:',
        'log_label': 'Registro de Analisis:',
        'games_count': 'Partidas: {0}',
        'status_pending': 'Pendiente',
        'status_analyzed': 'Analizada',
        'status_error': 'Error',
        'col_number': '#',
        'col_event': 'Evento',
        'col_white': 'Blancas',
        'col_black': 'Negras',
        'col_result': 'Resultado',
        'col_moves': 'Movimientos',
        'col_status': 'Estado',
        'loading_games': 'Cargadas {0} partidas de: {1}',
        'load_error': 'Error al cargar: {0}',
        'start_analysis': 'Iniciando analisis de {0} partidas...',
        'analyzing_game': 'Analizando partida {0}/{1}: {2}',
        'positions_processed': '  Procesadas {0} posiciones',
        'game_error': '  Error en posicion {0}: {1}',
        'analysis_complete': '¡Analisis completo! Procesadas {0} partidas.',
        'db_stats': 'Base de datos: {0} posiciones, {1} ocurrencias',
        'clear_confirm': 'Esto eliminara todas las partidas cargadas. ¿Continuar?',
        'data_cleared': 'Datos eliminados.',
        'game_info_title': 'Partida {0}',
        'game_info': 'Partida {0}:\nEvento: {1}\nLugar: {2}\nFecha: {3}\nRonda: {4}\nBlancas: {5}\nNegras: {6}\nResultado: {7}\nMovimientos: {8}',
        'analysis_complete_title': 'Analisis Completado',
        'analysis_complete_msg': '¡Analisis completado!\n\nPartidas analizadas: {0}\nPosiciones totales en BD: {1}\nOcurrencias totales: {2}',
        'no_games_warning': 'No se encontraron partidas validas en el archivo.',
        'load_pgn_title': 'Cargar PGN con Multiples Partidas',
        'pgn_files': 'Archivos PGN (*.pgn);;Todos los Archivos (*)',
        'clear_question': 'Limpiar Datos',
        'cancel_analysis': 'Cancelar Analisis',
    },
    'de': {
        'tab_title': 'Mehrfache PGN-Analyse',
        'btn_load_pgn': 'PGN laden (Mehrere Spiele)',
        'btn_analyze_all': 'Alle Spiele analysieren',
        'btn_clear_data': 'Daten loschen',
        'btn_send_to_analysis': 'Zur PGN-Analyse senden',
        'games_label': 'Spiele in der PGN-Datei:',
        'log_label': 'Analyseprotokoll:',
        'games_count': 'Spiele: {0}',
        'status_pending': 'Ausstehend',
        'status_analyzed': 'Analysiert',
        'status_error': 'Fehler',
        'col_number': '#',
        'col_event': 'Ereignis',
        'col_white': 'Weiß',
        'col_black': 'Schwarz',
        'col_result': 'Ergebnis',
        'col_moves': 'Zuge',
        'col_status': 'Status',
        'loading_games': '{0} Spiele geladen von: {1}',
        'load_error': 'Fehler beim Laden: {0}',
        'start_analysis': 'Starte Analyse von {0} Spielen...',
        'analyzing_game': 'Analysiere Spiel {0}/{1}: {2}',
        'positions_processed': '  {0} Positionen verarbeitet',
        'game_error': '  Fehler bei Position {0}: {1}',
        'analysis_complete': 'Analyse abgeschlossen! {0} Spiele verarbeitet.',
        'db_stats': 'Datenbank: {0} Positionen, {1} Vorkommen',
        'clear_confirm': 'Dies loscht alle geladenen Spiele. Fortfahren?',
        'data_cleared': 'Daten geloscht.',
        'game_info_title': 'Spiel {0}',
        'game_info': 'Spiel {0}:\nEreignis: {1}\nOrt: {2}\nDatum: {3}\nRunde: {4}\nWeiß: {5}\nSchwarz: {6}\nErgebnis: {7}\nZuge: {8}',
        'analysis_complete_title': 'Analyse abgeschlossen',
        'analysis_complete_msg': 'Analyse abgeschlossen!\n\nAnalysierte Spiele: {0}\nPositionen in DB: {1}\nGesamtvorkommen: {2}',
        'no_games_warning': 'Keine gultigen Spiele in der Datei gefunden.',
        'load_pgn_title': 'PGN mit mehreren Spielen laden',
        'pgn_files': 'PGN-Dateien (*.pgn);;Alle Dateien (*)',
        'clear_question': 'Daten loschen',
        'cancel_analysis': 'Analyse abbrechen',
    }
}


# ============================================================================
# CLASE: PositionEditorDialog
# ============================================================================
class PositionEditorDialog(QDialog):
    position_accepted = pyqtSignal(str, str, dict)

    def __init__(self, parent=None, caller="main", lang='en', initial_board=None):
        super().__init__(parent)
        self.caller = caller
        self.current_lang = lang
        self.selected_piece = None
        self.initial_board = initial_board
        self.setup_ui()
        self.apply_translations()
        
        if self.initial_board is not None:
            try:
                self.board_widget.board = self.initial_board.copy()
                self.board_widget.selected_square = None
                self.board_widget.update_board()
                self.update_board_display()
                self.update_pgn_preview()
            except Exception as e:
                logger.error(f"Error cargando tablero inicial: {str(e)}")
        
        self.update_board_display()

    def setup_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(5, 5, 5, 5)
        main_layout.setSpacing(5)

        mode_layout = QHBoxLayout()
        mode_layout.setSpacing(10)
        self.btn_mode_move = QRadioButton("Play Moves")
        self.btn_mode_edit = QRadioButton("Edit Pieces")
        self.btn_mode_move.setChecked(True)

        self.mode_label = QLabel("Mode:")
        mode_layout.addWidget(self.mode_label)
        mode_layout.addWidget(self.btn_mode_move)
        mode_layout.addWidget(self.btn_mode_edit)
        mode_layout.addStretch()
        
        self.caller_label = QLabel(f" Called from: {self.caller.upper()}")
        self.caller_label.setStyleSheet("color: #666; font-weight: bold;")
        mode_layout.addWidget(self.caller_label)
        
        main_layout.addLayout(mode_layout)

        splitter = QSplitter(Qt.Horizontal)

        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        left_layout.setContentsMargins(0, 0, 0, 0)

        self.board_widget = ChessBoardWidget()
        self.board_widget.set_edit_mode(False)
        self.board_widget.move_made.connect(self.on_move_made)
        left_layout.addWidget(self.board_widget)

        board_controls = QHBoxLayout()
        board_controls.setSpacing(5)
        self.btn_undo = QPushButton("Undo Move")
        self.btn_clear = QPushButton("Clear Board")
        self.btn_initial = QPushButton("Initial Pos")
        self.btn_reset = QPushButton("Reset All")

        self.btn_undo.clicked.connect(self.undo_move)
        self.btn_clear.clicked.connect(self.clear_board)
        self.btn_initial.clicked.connect(self.set_initial_position)
        self.btn_reset.clicked.connect(self.reset_all)

        board_controls.addWidget(self.btn_undo)
        board_controls.addWidget(self.btn_clear)
        board_controls.addWidget(self.btn_initial)
        board_controls.addWidget(self.btn_reset)
        board_controls.addStretch()
        left_layout.addLayout(board_controls)

        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(5)

        self.tabs = QTabWidget()
        self.tabs.setTabPosition(QTabWidget.North)

        tab1 = QWidget()
        tab1_layout = QVBoxLayout(tab1)
        tab1_layout.setContentsMargins(0, 0, 0, 0)

        self.moves_group = QGroupBox("Movements")
        moves_layout = QVBoxLayout(self.moves_group)
        self.moves_text = QTextEdit()
        self.moves_text.setReadOnly(True)
        self.moves_text.setMaximumHeight(80)
        self.moves_text.setPlaceholderText("Movements will appear here...")
        moves_layout.addWidget(self.moves_text)
        tab1_layout.addWidget(self.moves_group)

        self.piece_group = QGroupBox("Pieces (Edit Mode)")
        piece_layout = QGridLayout(self.piece_group)
        piece_layout.setSpacing(2)

        self.white_label = QLabel("White:")
        piece_layout.addWidget(self.white_label, 0, 0)
        white_buttons = ['K', 'Q', 'R', 'B', 'N', 'P']
        for i, label in enumerate(white_buttons):
            btn = QPushButton(label)
            btn.setFont(QFont("Arial", 12, QFont.Bold))
            btn.setFixedSize(32, 32)
            btn.setStyleSheet("background-color: white; color: black; border: 1px solid gray;")
            btn.clicked.connect(lambda checked, b=label: self.select_piece(b))
            piece_layout.addWidget(btn, 0, i + 1)

        self.black_label = QLabel("Black:")
        piece_layout.addWidget(self.black_label, 1, 0)
        black_buttons = ['k', 'q', 'r', 'b', 'n', 'p']
        for i, label in enumerate(black_buttons):
            btn = QPushButton(label)
            btn.setFont(QFont("Arial", 12, QFont.Bold))
            btn.setFixedSize(32, 32)
            btn.setStyleSheet("background-color: #333; color: white; border: 1px solid gray;")
            btn.clicked.connect(lambda checked, b=label: self.select_piece(b))
            piece_layout.addWidget(btn, 1, i + 1)

        self.btn_delete = QPushButton("X")
        self.btn_delete.setFont(QFont("Arial", 12, QFont.Bold))
        self.btn_delete.setFixedSize(32, 32)
        self.btn_delete.setStyleSheet("background-color: #f44336; color: white; border: 1px solid gray;")
        self.btn_delete.clicked.connect(lambda: self.select_piece(None))
        piece_layout.addWidget(self.btn_delete, 0, 7, 2, 1)

        self.piece_group.setEnabled(False)
        tab1_layout.addWidget(self.piece_group)

        self.tabs.addTab(tab1, "Editor")

        tab2 = QWidget()
        tab2_layout = QVBoxLayout(tab2)
        tab2_layout.setContentsMargins(5, 5, 5, 5)

        self.headers_group = QGroupBox("PGN Headers")
        headers_layout = QFormLayout(self.headers_group)

        self.header_event = QLineEdit("Edited Position")
        self.header_site = QLineEdit("?")
        self.header_date = QLineEdit(datetime.now().strftime("%Y.%m.%d"))
        self.header_round = QLineEdit("?")
        self.header_white = QLineEdit("?")
        self.header_black = QLineEdit("?")
        self.header_result = QLineEdit("*")

        self.event_label = QLabel("Event:")
        self.site_label = QLabel("Site:")
        self.date_label = QLabel("Date:")
        self.round_label = QLabel("Round:")
        self.white_player_label = QLabel("White:")
        self.black_player_label = QLabel("Black:")
        self.result_label = QLabel("Result:")

        headers_layout.addRow(self.event_label, self.header_event)
        headers_layout.addRow(self.site_label, self.header_site)
        headers_layout.addRow(self.date_label, self.header_date)
        headers_layout.addRow(self.round_label, self.header_round)
        headers_layout.addRow(self.white_player_label, self.header_white)
        headers_layout.addRow(self.black_player_label, self.header_black)
        headers_layout.addRow(self.result_label, self.header_result)

        self.btn_today = QPushButton("Today")
        self.btn_today.clicked.connect(lambda: self.header_date.setText(datetime.now().strftime("%Y.%m.%d")))
        headers_layout.addRow("", self.btn_today)

        tab2_layout.addWidget(self.headers_group)

        self.preview_group = QGroupBox("PGN Preview")
        preview_layout = QVBoxLayout(self.preview_group)
        self.pgn_preview = QTextEdit()
        self.pgn_preview.setReadOnly(True)
        self.pgn_preview.setMaximumHeight(150)
        self.pgn_preview.setFont(QFont("Courier New", 9))
        preview_layout.addWidget(self.pgn_preview)
        tab2_layout.addWidget(self.preview_group)

        self.btn_preview = QPushButton("Update Preview")
        self.btn_preview.clicked.connect(self.update_pgn_preview)
        tab2_layout.addWidget(self.btn_preview)

        self.tabs.addTab(tab2, "PGN Headers")

        right_layout.addWidget(self.tabs)

        self.status_group = QGroupBox("Position Info")
        status_layout = QVBoxLayout(self.status_group)
        self.fen_label = QLabel("FEN: ")
        self.fen_label.setWordWrap(True)
        self.fen_label.setStyleSheet("font-family: monospace; font-size: 8pt; background-color: #f5f5f5; padding: 4px;")
        status_layout.addWidget(self.fen_label)
        self.pieces_count = QLabel("White: 0 | Black: 0")
        status_layout.addWidget(self.pieces_count)
        right_layout.addWidget(self.status_group)

        self.button_box = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        self.button_box.accepted.connect(self.accept_position)
        self.button_box.rejected.connect(self.reject)
        right_layout.addWidget(self.button_box)

        splitter.addWidget(left_panel)
        splitter.addWidget(right_panel)
        splitter.setSizes([500, 350])

        main_layout.addWidget(splitter)

        self.btn_mode_move.toggled.connect(self.on_mode_changed)
        self.update_pgn_preview()

    def apply_translations(self):
        texts = EDITOR_DIALOG_TEXTS.get(self.current_lang, EDITOR_DIALOG_TEXTS['en'])
        
        self.setWindowTitle(texts['editor_title'])
        self.mode_label.setText(texts['editor_mode'])
        self.btn_mode_move.setText(texts['editor_play_moves'])
        self.btn_mode_edit.setText(texts['editor_edit_pieces'])
        self.caller_label.setText(f" {texts['editor_called_from']} {self.caller.upper()}")
        self.btn_undo.setText(texts['editor_undo'])
        self.btn_clear.setText(texts['editor_clear_board'])
        self.btn_initial.setText(texts['editor_initial_pos'])
        self.btn_reset.setText(texts['editor_reset_all'])
        self.moves_group.setTitle(texts['editor_movements'])
        self.piece_group.setTitle(texts['editor_pieces'])
        self.white_label.setText(texts['editor_white'])
        self.black_label.setText(texts['editor_black'])
        self.btn_delete.setText(texts['editor_delete'])
        self.headers_group.setTitle(texts['editor_pgn_headers'])
        self.event_label.setText(texts['editor_event'])
        self.site_label.setText(texts['editor_site'])
        self.date_label.setText(texts['editor_date'])
        self.round_label.setText(texts['editor_round'])
        self.white_player_label.setText(texts['editor_white_player'])
        self.black_player_label.setText(texts['editor_black_player'])
        self.result_label.setText(texts['editor_result'])
        self.btn_today.setText(texts['editor_today'])
        self.preview_group.setTitle(texts['editor_pgn_preview'])
        self.btn_preview.setText(texts['editor_update_preview'])
        self.status_group.setTitle(texts['editor_position_info'])
        self.fen_label.setText(f"{texts['editor_fen_label']} ")
        self.tabs.setTabText(0, texts['editor_editor_tab'])
        self.tabs.setTabText(1, texts['editor_headers_tab'])
        self.moves_text.setPlaceholderText(texts['editor_moves_placeholder'])
        self.button_box.button(QDialogButtonBox.Ok).setText(texts['editor_ok'])
        self.button_box.button(QDialogButtonBox.Cancel).setText(texts['editor_cancel'])

    def set_language(self, lang_code):
        if lang_code in EDITOR_DIALOG_TEXTS:
            self.current_lang = lang_code
            self.apply_translations()

    def on_move_made(self, san):
        self.update_moves_display()
        self.update_board_display()
        self.update_pgn_preview()

    def on_mode_changed(self):
        is_edit = self.btn_mode_edit.isChecked()
        self.piece_group.setEnabled(is_edit)
        self.board_widget.set_edit_mode(is_edit)

    def select_piece(self, symbol):
        self.selected_piece = symbol
        self.board_widget.selected_piece = symbol

    def undo_move(self):
        self.board_widget.undo_move()
        self.update_moves_display()
        self.update_board_display()
        self.update_pgn_preview()

    def clear_board(self):
        self.board_widget.clear_board()
        self.update_board_display()
        self.update_pgn_preview()

    def reset_all(self):
        self.board_widget.reset_all()
        self.update_board_display()
        self.update_moves_display()
        self.update_pgn_preview()

    def set_initial_position(self):
        self.board_widget.board = chess.Board()
        self.board_widget.move_history = []
        self.board_widget.board_history = []
        self.board_widget.current_index = 0
        self.board_widget.selected_square = None
        self.board_widget.update_board()
        self.update_board_display()
        self.update_moves_display()
        self.update_pgn_preview()

    def update_board_display(self):
        self.board_widget.set_board(self.board_widget.board)
        texts = EDITOR_DIALOG_TEXTS.get(self.current_lang, EDITOR_DIALOG_TEXTS['en'])
        self.fen_label.setText(f"{texts['editor_fen_label']} {self.board_widget.board.fen()}")

        white = 0
        black = 0
        for square in chess.SQUARES:
            piece = self.board_widget.board.piece_at(square)
            if piece:
                if piece.color == chess.WHITE:
                    white += 1
                else:
                    black += 1
        self.pieces_count.setText(f"{texts['editor_white']}: {white} | {texts['editor_black']}: {black}")

    def update_moves_display(self):
        moves_text = ""
        for i, move in enumerate(self.board_widget.move_history):
            if i % 2 == 0:
                moves_text += f"{i//2 + 1}. {move} "
            else:
                moves_text += f"{move} "
        self.moves_text.setPlainText(moves_text.strip())

    def get_headers(self):
        return {
            "Event": self.header_event.text().strip() or "Edited Position",
            "Site": self.header_site.text().strip() or "?",
            "Date": self.header_date.text().strip() or datetime.now().strftime("%Y.%m.%d"),
            "Round": self.header_round.text().strip() or "?",
            "White": self.header_white.text().strip() or "?",
            "Black": self.header_black.text().strip() or "?",
            "Result": self.header_result.text().strip() or "*"
        }

    def update_pgn_preview(self):
        headers = self.get_headers()
        pgn = self.board_widget.get_pgn_string(headers)
        if pgn:
            self.pgn_preview.setPlainText(pgn)
        else:
            self.pgn_preview.setPlainText("No position data available")

    def is_position_valid(self):
        board = self.board_widget.board
        if len(list(board.pieces(chess.KING, chess.WHITE))) != 1:
            return False
        if len(list(board.pieces(chess.KING, chess.BLACK))) != 1:
            return False
        return True

    def get_fen(self):
        return self.board_widget.board.fen()

    def get_pgn(self):
        headers = self.get_headers()
        return self.board_widget.get_pgn_string(headers)

    def accept_position(self):
        if not self.is_position_valid():
            QMessageBox.warning(self, "Invalid Position", "Both kings must be present.")
            return

        fen = self.get_fen()
        pgn = self.get_pgn()
        headers = self.get_headers()

        self.position_accepted.emit(fen, pgn, headers)
        
        QMessageBox.information(self, "Success", f"Position sent to {self.caller.upper()}")
        
        self.accept()


# ============================================================================
# CLASE: GraphViewer
# ============================================================================
class GraphViewer(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Graph Viewer")
        self.setMinimumSize(900, 700)
        
        self.analysis_data = None
        self.graph_settings = {
            'position': {'type': 'line', 'safe_mode': True},
            'diff': {'type': 'line', 'safe_mode': True},
            'ratio': {'type': 'line', 'safe_mode': True}
        }
        self.current_graph_type = 'position'
        self.parent = parent
        
        self.setup_ui()
        
    def setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(5)
        
        button_panel = QWidget()
        button_layout = QHBoxLayout(button_panel)
        button_layout.setSpacing(5)
        
        self.btn_position = QPushButton("VPo(k)")
        self.btn_position.setStyleSheet("background-color: #2196F3; color: white; font-weight: bold; padding: 6px 12px; border-radius: 4px;")
        
        self.btn_diff = QPushButton("D(k)")
        self.btn_diff.setStyleSheet("background-color: #FF9800; color: white; font-weight: bold; padding: 6px 12px; border-radius: 4px;")
        
        self.btn_ratio = QPushButton("R(k)")
        self.btn_ratio.setStyleSheet("background-color: #4CAF50; color: white; font-weight: bold; padding: 6px 12px; border-radius: 4px;")
        
        self.btn_position.clicked.connect(lambda: self.show_graph('position'))
        self.btn_diff.clicked.connect(lambda: self.show_graph('diff'))
        self.btn_ratio.clicked.connect(lambda: self.show_graph('ratio'))
        
        button_layout.addWidget(self.btn_position)
        button_layout.addWidget(self.btn_diff)
        button_layout.addWidget(self.btn_ratio)
        button_layout.addStretch()
        
        layout.addWidget(button_panel)
        
        controls_panel = QGroupBox("Graph Options")
        controls_layout = QHBoxLayout(controls_panel)
        controls_layout.setSpacing(10)
        
        self.graph_type_combo = QComboBox()
        self.graph_type_combo.addItem("Line", "line")
        self.graph_type_combo.addItem("Scatter", "scatter")
        self.graph_type_combo.addItem("Bar", "bar")
        self.graph_type_combo.setFixedWidth(120)
        
        self.safe_mode_check = QCheckBox("Safe Mode (log10)")
        self.safe_mode_check.setChecked(True)
        
        self.btn_apply_settings = QPushButton("Apply Settings")
        self.btn_apply_settings.setStyleSheet("background-color: #9E9E9E; color: white; padding: 4px 12px; border-radius: 4px;")
        
        controls_layout.addWidget(QLabel("Graph type:"))
        controls_layout.addWidget(self.graph_type_combo)
        controls_layout.addWidget(self.safe_mode_check)
        controls_layout.addWidget(self.btn_apply_settings)
        controls_layout.addStretch()
        
        layout.addWidget(controls_panel)
        
        self.figure = plt.figure(figsize=(10, 6))
        self.canvas = FigureCanvas(self.figure)
        self.toolbar = NavigationToolbar(self.canvas, self)
        
        layout.addWidget(self.toolbar)
        layout.addWidget(self.canvas)
        
        self.h_scroll_bar = None
        self.v_scroll_bar = None
        
        self.btn_apply_settings.clicked.connect(self.apply_graph_settings)
        
    def set_analysis_data(self, analysis_data):
        self.analysis_data = analysis_data
        self.show_graph('position')
        
    def apply_graph_settings(self):
        graph_type = self.current_graph_type
        if graph_type not in self.graph_settings:
            return
            
        self.graph_settings[graph_type]['type'] = self.graph_type_combo.currentData()
        self.graph_settings[graph_type]['safe_mode'] = self.safe_mode_check.isChecked()
        self.show_graph(graph_type)
        
    def show_graph(self, graph_type):
        if not self.analysis_data:
            return
            
        self.current_graph_type = graph_type
        self.figure.clear()
        
        moves = [data['move'] for data in self.analysis_data]
        total_moves = len(moves)
        
        ax = self.figure.add_subplot(111)
        
        if graph_type == 'position':
            values = [data['value'] for data in self.analysis_data]
            title = "VPo(k) = ∏(Vc^Vp)"
            ylabel = "VPo(k)"
            point_labels = [f"Po({k})" for k in moves]
        elif graph_type == 'diff':
            values = [data['diff'] if data['diff'] is not None else 0 for data in self.analysis_data]
            title = "D(k) = VPo(k) - VPo(k-1)"
            ylabel = "D(k)"
            point_labels = [f"D({k})" if k > 0 else "N/A" for k in moves]
        elif graph_type == 'ratio':
            values = [data['ratio'] if data['ratio'] is not None else 1 for data in self.analysis_data]
            title = "R(k) = VPo(k) / VPo(k-1)"
            ylabel = "R(k)"
            point_labels = [f"R({k})" if k > 0 else "N/A" for k in moves]
        else:
            return
        
        safe_mode = self.graph_settings[graph_type].get('safe_mode', True)
        if safe_mode:
            values = [log10(abs(v)) if v != 0 and isfinite(v) else 0 for v in values]
            ylabel = f"log10({ylabel})" if graph_type != 'ratio' else f"log10({ylabel})"
        
        graph_type_style = self.graph_settings[graph_type].get('type', 'line')
        
        valid_values = [v for v in values if isfinite(v)]
        min_y = min(valid_values) if valid_values else 0
        max_y = max(valid_values) if valid_values else 1
        
        y_range = max_y - min_y
        padding = y_range * 0.1 if y_range > 0 else 1
        min_y -= padding
        max_y += padding
        
        if graph_type_style == 'line':
            if len(moves) > 3:
                try:
                    x_new = np.linspace(min(moves), max(moves), 300)
                    spl = make_interp_spline(moves, values, k=3)
                    y_smooth = spl(x_new)
                    ax.plot(x_new, y_smooth, '-', linewidth=2, color='blue', alpha=0.7)
                except:
                    pass
            
            ax.plot(moves, values, 'o', markersize=6, alpha=0.7, color='red', label='Data points')
            
            for x, y, label in zip(moves, values, point_labels):
                if isfinite(y):
                    ax.text(x, y, label, 
                           fontsize=7, ha='center', va='bottom', 
                           bbox=dict(facecolor='white', alpha=0.7, edgecolor='none'),
                           rotation=45)
            
        elif graph_type_style == 'scatter':
            ax.scatter(moves, values, s=50, alpha=0.7, color='red', label='Data points')
            
            for x, y, label in zip(moves, values, point_labels):
                if isfinite(y):
                    ax.text(x, y, label, 
                           fontsize=7, ha='center', va='bottom', 
                           bbox=dict(facecolor='white', alpha=0.7, edgecolor='none'),
                           rotation=45)
            
        elif graph_type_style == 'bar':
            bars = ax.bar(moves, values, width=0.6, alpha=0.7, color='red')
            
            for i, bar in enumerate(bars):
                height = bar.get_height()
                if isfinite(height):
                    ax.text(bar.get_x() + bar.get_width()/2., height,
                            point_labels[i] if i < len(point_labels) else '',
                            ha='center', va='bottom', fontsize=7,
                            bbox=dict(facecolor='white', alpha=0.7, edgecolor='none'),
                            rotation=45)
        
        ax.set_title(title, fontsize=12, pad=10)
        ax.set_xlabel("Move (k)", fontsize=10)
        ax.set_ylabel(ylabel, fontsize=10)
        ax.set_xticks(moves)
        ax.tick_params(axis='y', labelrotation=30)
        ax.tick_params(axis='x', rotation=45)
        ax.grid(True, linestyle='--', alpha=0.4)
        
        ax.set_ylim(min_y, max_y)
        
        visible_moves = min(20, total_moves)
        ax.set_xlim(-0.5, visible_moves - 0.5)
        
        if not safe_mode:
            formatter = ScalarFormatter(useMathText=True)
            formatter.set_powerlimits((-3, 4))
            ax.yaxis.set_major_formatter(formatter)
        
        self.figure.tight_layout()
        self.canvas.draw()
        
        self._update_scrollbars(total_moves, visible_moves, ax, min_y, max_y)
    
    def _update_scrollbars(self, total_moves, visible_moves, ax, min_y, max_y):
        if self.h_scroll_bar is not None:
            try:
                self.h_scroll_bar.setParent(None)
                self.h_scroll_bar.deleteLater()
            except:
                pass
            self.h_scroll_bar = None
            
        if self.v_scroll_bar is not None:
            try:
                self.v_scroll_bar.setParent(None)
                self.v_scroll_bar.deleteLater()
            except:
                pass
            self.v_scroll_bar = None
        
        if total_moves > visible_moves:
            self.h_scroll_bar = QScrollBar(Qt.Horizontal)
            self.h_scroll_bar.setMinimum(0)
            self.h_scroll_bar.setMaximum(total_moves - visible_moves)
            self.h_scroll_bar.setPageStep(visible_moves)
            self.h_scroll_bar.valueChanged.connect(
                lambda value: self.scroll_graph_horizontal(value, visible_moves, ax))
            self.layout().addWidget(self.h_scroll_bar)
        
        self.v_scroll_bar = QScrollBar(Qt.Vertical)
        scroll_range = 1000
        self.v_scroll_bar.setMinimum(0)
        self.v_scroll_bar.setMaximum(scroll_range)
        self.v_scroll_bar.setValue(int(scroll_range / 2))
        self.v_scroll_bar.valueChanged.connect(
            lambda value: self.scroll_graph_vertical(value, scroll_range, min_y, max_y, ax))
        self.layout().addWidget(self.v_scroll_bar)
    
    def scroll_graph_horizontal(self, value, visible_moves, ax):
        ax.set_xlim(value - 0.5, value + visible_moves - 0.5)
        self.canvas.draw()
    
    def scroll_graph_vertical(self, value, scroll_range, min_y, max_y, ax):
        normalized_value = value / scroll_range
        total_y_range = max_y - min_y
        margin = total_y_range * 0.5
        min_possible_y = min_y - margin
        max_possible_y = max_y + margin
        possible_range = max_possible_y - min_possible_y
        new_center_y = min_possible_y + (normalized_value * possible_range)
        current_ylim = ax.get_ylim()
        current_range = current_ylim[1] - current_ylim[0]
        new_min_y = new_center_y - (current_range / 2)
        new_max_y = new_center_y + (current_range / 2)
        ax.set_ylim(new_min_y, new_max_y)
        self.canvas.draw()


# ============================================================================
# CLASE: SearchDialog
# ============================================================================
class SearchDialog(QDialog):
    def __init__(self, parent=None, db: PositionDatabase = None, lang='en', stockfish=None):
        super().__init__(parent)
        self.parent = parent
        self.db = db if db else PositionDatabase()
        self.stockfish = stockfish
        self.search_board = None
        self.editor_instance = None
        self.current_lang = lang
        self.setup_ui()
        self.apply_translations()
        self.load_statistics()

    def setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(3)

        self.tabs = QTabWidget()
        layout.addWidget(self.tabs)

        tab1 = QWidget()
        tab1_layout = QVBoxLayout(tab1)
        tab1_layout.setContentsMargins(5, 5, 5, 5)
        tab1_layout.setSpacing(3)

        top_panel = QWidget()
        top_layout = QHBoxLayout(top_panel)
        top_layout.setContentsMargins(0, 0, 0, 0)
        top_layout.setSpacing(5)

        self.board_group = QGroupBox("Board Search - Click to remove pieces")
        self.board_group.setMaximumHeight(450)
        board_layout = QVBoxLayout(self.board_group)
        board_layout.setContentsMargins(5, 5, 5, 5)

        class SearchBoardWidget(QWidget):
            def __init__(self, parent=None):
                super().__init__(parent)
                self.setMinimumSize(300, 300)
                self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
                self.board = chess.Board()
                self.selected_square = None
                self.pixmap = None
                self.parent_dialog = parent
                self.renderer = QSvgRenderer()
                self.setMouseTracking(True)
                self.update_board()

            def update_board(self):
                try:
                    size = min(self.width(), self.height())
                    if size < 10:
                        size = 300

                    squares = [self.selected_square] if self.selected_square is not None else []

                    svg_data = chess.svg.board(
                        board=self.board,
                        size=size,
                        squares=squares,
                        coordinates=True
                    )

                    self.renderer.load(svg_data.encode('utf-8'))

                    pixmap = QPixmap(size, size)
                    pixmap.fill(Qt.transparent)

                    painter = QPainter(pixmap)
                    self.renderer.render(painter)
                    painter.end()

                    self.pixmap = pixmap
                    self.update()

                except Exception as e:
                    logger.error(f"Error updating board: {str(e)}")
                    self.pixmap = None
                    self.update()

            def paintEvent(self, event):
                if self.pixmap is not None:
                    painter = QPainter(self)
                    x = (self.width() - self.pixmap.width()) // 2
                    y = (self.height() - self.pixmap.height()) // 2
                    painter.drawPixmap(x, y, self.pixmap)
                    painter.end()

            def mousePressEvent(self, event):
                if self.pixmap is None:
                    return

                size = self.pixmap.width()
                x_offset = (self.width() - size) // 2
                y_offset = (self.height() - size) // 2

                x = event.pos().x() - x_offset
                y = event.pos().y() - y_offset

                if x < 0 or y < 0 or x >= size or y >= size:
                    return

                square_size = size / 8
                col = int(x / square_size)
                row = 7 - int(y / square_size)

                if 0 <= col < 8 and 0 <= row < 8:
                    square = chess.square(col, row)

                    piece = self.board.piece_at(square)
                    if piece:
                        self.board.remove_piece_at(square)
                        self.selected_square = square
                        self.update_board()
                        if hasattr(self.parent_dialog, 'on_board_changed'):
                            self.parent_dialog.on_board_changed()

            def resizeEvent(self, event):
                super().resizeEvent(event)
                self.update_board()

            def set_fen(self, fen):
                try:
                    self.board = chess.Board(fen)
                    self.selected_square = None
                    self.update_board()
                    return True
                except:
                    return False

        self.search_board = SearchBoardWidget(self)
        board_layout.addWidget(self.search_board, 1)

        board_controls = QHBoxLayout()
        board_controls.setSpacing(3)
        self.btn_clear_search_board = QPushButton("Clear Board")
        self.btn_clear_search_board.clicked.connect(self.clear_search_board)
        self.btn_initial_search_board = QPushButton("Initial Position")
        self.btn_initial_search_board.clicked.connect(self.initial_search_board)

        board_controls.addWidget(self.btn_clear_search_board)
        board_controls.addWidget(self.btn_initial_search_board)
        board_controls.addStretch()
        board_layout.addLayout(board_controls)

        top_layout.addWidget(self.board_group, 2)

        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(3)

        self.fen_group = QGroupBox("FEN Input")
        fen_layout = QVBoxLayout(self.fen_group)
        fen_layout.setContentsMargins(5, 5, 5, 5)

        self.fen_input = QTextEdit()
        self.fen_input.setPlaceholderText("Enter FEN string...\nExample: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        self.fen_input.setMaximumHeight(60)
        self.fen_input.textChanged.connect(self.on_fen_input_changed)

        fen_buttons = QHBoxLayout()
        fen_buttons.setSpacing(3)
        
        self.btn_search_fen = QPushButton(" Search (Open Editor)")
        self.btn_search_fen.setStyleSheet("background-color: #4CAF50; color: white; padding: 5px;")
        self.btn_search_fen.clicked.connect(self.open_editor_from_search)
        
        self.btn_clear_all = QPushButton(" Clear All")
        self.btn_clear_all.setStyleSheet("background-color: #f44336; color: white; padding: 5px;")
        self.btn_clear_all.clicked.connect(self.clear_all)
        
        self.btn_load_example = QPushButton(" Load Example")
        self.btn_load_example.setStyleSheet("padding: 5px;")
        self.btn_load_example.clicked.connect(self.load_example_fen)

        fen_buttons.addWidget(self.btn_search_fen)
        fen_buttons.addWidget(self.btn_clear_all)
        fen_buttons.addWidget(self.btn_load_example)

        fen_layout.addWidget(self.fen_input)
        fen_layout.addLayout(fen_buttons)

        right_layout.addWidget(self.fen_group)

        top_layout.addWidget(right_panel, 1)

        tab1_layout.addWidget(top_panel)

        self.results_group = QGroupBox("Search Results")
        results_layout = QVBoxLayout(self.results_group)
        results_layout.setContentsMargins(5, 5, 5, 5)
        results_layout.setSpacing(3)

        self.position_info = QTextEdit()
        self.position_info.setReadOnly(True)
        self.position_info.setMaximumHeight(120)
        results_layout.addWidget(self.position_info)

        self.moves_label = QLabel("Most Common Moves from this Position:")
        results_layout.addWidget(self.moves_label)
        
        self.moves_table = QTableWidget()
        self.moves_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.moves_table.setColumnCount(5)
        self.moves_table.setHorizontalHeaderLabels(["Move (UCI)", "Move (SAN)", "Frequency", "Winrate", "Stockfish"])
        self.moves_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.moves_table.setMaximumHeight(150)
        results_layout.addWidget(self.moves_table)

        self.sf_group = QGroupBox("Stockfish Analysis")
        sf_layout = QVBoxLayout(self.sf_group)
        
        self.sf_info = QTextEdit()
        self.sf_info.setReadOnly(True)
        self.sf_info.setMaximumHeight(100)
        self.sf_info.setStyleSheet("font-family: monospace; font-size: 9pt;")
        sf_layout.addWidget(self.sf_info)
        
        self.btn_analyze_sf = QPushButton(" Analyze with Stockfish")
        self.btn_analyze_sf.setStyleSheet("background-color: #795548; color: white; padding: 5px;")
        self.btn_analyze_sf.clicked.connect(self.analyze_with_stockfish)
        self.btn_analyze_sf.setEnabled(False)
        sf_layout.addWidget(self.btn_analyze_sf)

        results_layout.addWidget(self.sf_group)

        tab1_layout.addWidget(self.results_group)
        self.tabs.addTab(tab1, "Search")

        tab2 = QWidget()
        tab2_layout = QVBoxLayout(tab2)
        tab2_layout.setContentsMargins(5, 5, 5, 5)
        tab2_layout.setSpacing(3)

        self.stats_label = QLabel("Database Statistics")
        tab2_layout.addWidget(self.stats_label)
        
        self.stats_text = QTextEdit()
        self.stats_text.setReadOnly(True)
        self.stats_text.setFont(QFont("monospace", 9))
        self.stats_text.setMaximumHeight(120)
        tab2_layout.addWidget(self.stats_text)

        self.btn_refresh_stats = QPushButton(" Refresh Statistics")
        self.btn_refresh_stats.clicked.connect(self.load_statistics)
        tab2_layout.addWidget(self.btn_refresh_stats)

        self.top_positions_label = QLabel("Most Frequent Positions (FEN and S Value):")
        tab2_layout.addWidget(self.top_positions_label)
        
        self.top_table = QTableWidget()
        self.top_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.top_table.setColumnCount(7)
        self.top_table.setHorizontalHeaderLabels(["Rank", "FEN (complete)", "S Value", "Frequency", "Winrate", "SF Best", "SF Score"])
        self.top_table.itemDoubleClicked.connect(self.on_top_double_click)
        self.top_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.top_table.setMaximumHeight(200)
        tab2_layout.addWidget(self.top_table)

        self.tabs.addTab(tab2, "Statistics")

        btn_close = QPushButton(" Close")
        btn_close.clicked.connect(self.accept)
        btn_close.setStyleSheet("background-color: #F44336; color: white; padding: 5px;")

        button_layout = QHBoxLayout()
        button_layout.addStretch()
        button_layout.addWidget(btn_close)
        layout.addLayout(button_layout)

        self.btn_close = btn_close

    def apply_translations(self):
        texts = SEARCH_DIALOG_TEXTS.get(self.current_lang, SEARCH_DIALOG_TEXTS['en'])
        
        self.setWindowTitle(texts['search_title'])
        self.tabs.setTabText(0, texts['search_tab_search'])
        self.tabs.setTabText(1, texts['search_tab_stats'])
        self.board_group.setTitle(texts['search_board_group'])
        self.btn_clear_search_board.setText(texts['search_board_clear'])
        self.btn_initial_search_board.setText(texts['search_board_initial'])
        self.fen_group.setTitle(texts['search_fen_label'])
        self.fen_input.setPlaceholderText(texts['search_fen_placeholder'])
        self.btn_search_fen.setText(texts['search_btn_search'])
        self.btn_clear_all.setText(texts['search_btn_clear'])
        self.btn_load_example.setText(texts['search_btn_example'])
        self.results_group.setTitle(texts['search_results_group'])
        self.moves_label.setText(texts['search_moves_label'])
        
        headers = [texts['search_move_uci'], texts['search_move_san'], 
                   texts['search_frequency'], texts['search_winrate'], texts['search_col_sf']]
        self.moves_table.setHorizontalHeaderLabels(headers)
        
        self.stats_label.setText(texts['search_stats_label'])
        self.top_positions_label.setText(texts['search_top_positions'])
        self.btn_refresh_stats.setText(texts['search_btn_refresh'])
        
        top_headers = [texts['search_rank'], texts['search_fen_header'], 
                       texts['search_s_value_header'], texts['search_freq_header'],
                       texts['search_wr_header'], texts['search_col_sf_best'], texts['search_col_sf_score']]
        self.top_table.setHorizontalHeaderLabels(top_headers)
        self.btn_close.setText(texts['search_btn_close'])
        
        self.sf_group.setTitle(texts['search_stockfish_group'])
        self.btn_analyze_sf.setText(texts['search_btn_analyze_sf'])

    def set_language(self, lang_code):
        if lang_code in SEARCH_DIALOG_TEXTS:
            self.current_lang = lang_code
            self.apply_translations()
            self.load_statistics()

    def open_editor_from_search(self):
        try:
            current_board = None
            if self.search_board:
                current_board = self.search_board.board.copy()
            
            self.editor_instance = PositionEditorDialog(
                parent=self, 
                caller="search", 
                lang=self.current_lang,
                initial_board=current_board
            )
            self.editor_instance.position_accepted.connect(self.on_editor_accepted)
            self.editor_instance.finished.connect(self.on_editor_closed)
            
            self.editor_instance.setWindowFlags(
                Qt.Window | Qt.WindowCloseButtonHint | Qt.WindowTitleHint
            )
            self.editor_instance.show()
            self.editor_instance.raise_()
            self.editor_instance.activateWindow()
            
        except Exception as e:
            logger.error("Error opening position editor from search: " + str(e))
            import traceback
            traceback.print_exc()
            QMessageBox.critical(self, "Error", "Error opening position editor:\n" + str(e))

    def on_editor_closed(self, result):
        self.editor_instance = None

    def on_editor_accepted(self, fen: str, pgn: str, headers: dict):
        try:
            if self.search_board:
                board = chess.Board(fen)
                self.search_board.board = board
                self.search_board.selected_square = None
                self.search_board.update_board()
                
                self.fen_input.blockSignals(True)
                self.fen_input.setPlainText(fen)
                self.fen_input.blockSignals(False)
                
                self.search_by_fen()
                
                QMessageBox.information(self, "Success", "Position loaded from editor and searched.")
                
        except Exception as e:
            logger.error("Error loading editor position in search: " + str(e))
            QMessageBox.critical(self, "Error", "Error loading position:\n" + str(e))

    def on_board_changed(self):
        if self.search_board:
            fen = self.search_board.board.fen()
            self.fen_input.blockSignals(True)
            self.fen_input.setPlainText(fen)
            self.fen_input.blockSignals(False)

    def on_fen_input_changed(self):
        if not self.search_board:
            return
        fen = self.fen_input.toPlainText().strip()
        if fen:
            try:
                board = chess.Board(fen)
                self.search_board.board = board
                self.search_board.selected_square = None
                self.search_board.update_board()
            except:
                pass

    def clear_search_board(self):
        if self.search_board:
            self.search_board.board.clear()
            self.search_board.selected_square = None
            self.search_board.update_board()
            self.on_board_changed()

    def initial_search_board(self):
        if self.search_board:
            self.search_board.board = chess.Board()
            self.search_board.selected_square = None
            self.search_board.update_board()
            self.on_board_changed()

    def clear_all(self):
        self.fen_input.clear()
        if self.search_board:
            self.search_board.board = chess.Board()
            self.search_board.selected_square = None
            self.search_board.update_board()
        self.position_info.clear()
        self.moves_table.setRowCount(0)
        self.sf_info.clear()
        self.btn_analyze_sf.setEnabled(False)

    def load_example_fen(self):
        example = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        self.fen_input.setPlainText(example)
        self.on_fen_input_changed()

    def load_statistics(self):
        try:
            texts = SEARCH_DIALOG_TEXTS.get(self.current_lang, SEARCH_DIALOG_TEXTS['en'])
            stats = self.db.get_statistics()
            stats_html = f"""
            <h3>{texts['search_stats_label']}</h3>
            <table border="0" cellpadding="3">
            <tr><td><b>Total unique positions:</b></td><td>{stats['total_positions']:,}</td></tr>
            <tr><td><b>Total occurrences:</b></td><td>{stats['total_occurrences']:,}</td></tr>
            <tr><td><b>Total transitions:</b></td><td>{stats['total_transitions']:,}</td></tr>
            <tr><td><b>Average frequency:</b></td><td>{stats['avg_frequency']}</td></tr>
            <tr><td><b>Positions with Stockfish:</b></td><td>{stats['positions_with_sf']:,}</td></tr>
            <tr><td><b>Database size:</b></td><td>{stats['db_size_mb']} MB</td></tr>
            <tr><td><b>Database path:</b></td><td>{stats['db_path']}</td></tr>
            </table>
            """
            self.stats_text.setHtml(stats_html)

            top = self.db.get_positions_summary(50)
            self.top_table.setRowCount(len(top))
            for i, pos in enumerate(top):
                rank_item = QTableWidgetItem(str(i+1))
                rank_item.setTextAlignment(Qt.AlignCenter)
                self.top_table.setItem(i, 0, rank_item)

                fen_item = QTableWidgetItem(pos['fen'])
                fen_item.setData(Qt.UserRole, pos['fen'])
                fen_item.setToolTip(pos['fen'])
                self.top_table.setItem(i, 1, fen_item)

                s_value = pos.get('s_value', 'N/A')
                s_item = QTableWidgetItem(s_value[:20] + "..." if len(s_value) > 20 else s_value)
                s_item.setTextAlignment(Qt.AlignLeft)
                s_item.setToolTip(s_value)
                self.top_table.setItem(i, 2, s_item)

                freq_item = QTableWidgetItem(str(pos['frecuencia']))
                freq_item.setTextAlignment(Qt.AlignRight)
                self.top_table.setItem(i, 3, freq_item)

                wr_item = QTableWidgetItem(f"{pos.get('winrate_white', 0.5):.3f}")
                wr_item.setTextAlignment(Qt.AlignRight)
                self.top_table.setItem(i, 4, wr_item)

                sf_best = pos.get('sf_best_move', '')
                sf_item = QTableWidgetItem(sf_best if sf_best else '—')
                sf_item.setTextAlignment(Qt.AlignCenter)
                self.top_table.setItem(i, 5, sf_item)

                sf_score = pos.get('sf_score')
                score_item = QTableWidgetItem(str(sf_score) if sf_score is not None else '—')
                score_item.setTextAlignment(Qt.AlignRight)
                self.top_table.setItem(i, 6, score_item)

            self.top_table.resizeColumnsToContents()
            self.top_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
            self.top_table.horizontalHeader().setSectionResizeMode(2, QHeaderView.Stretch)

        except Exception as e:
            self.stats_text.setPlainText(f"Error loading statistics: {str(e)}")

    def search_by_fen(self):
        texts = SEARCH_DIALOG_TEXTS.get(self.current_lang, SEARCH_DIALOG_TEXTS['en'])
        fen = self.fen_input.toPlainText().strip()
        if not fen:
            QMessageBox.warning(self, "Warning", "Please enter a FEN position")
            return

        try:
            position = self.db.get_position_by_fen(fen)

            if not position:
                self.position_info.setPlainText(f" {texts['search_position_not_found']}\n\nFEN: {fen}")
                self.moves_table.setRowCount(0)
                self.sf_info.clear()
                self.btn_analyze_sf.setEnabled(True)
                return

            best_move = self.db.get_best_move_from_hash(position['s_hash'])
            s_value = position.get('s_value', 'N/A')
            sf_best = position.get('sf_best_move', 'N/A')
            sf_score = position.get('sf_score', 'N/A')
            sf_depth = position.get('sf_depth', 'N/A')

            info = f"""
 {texts['search_position_found']}

 FEN: {fen}
 {texts['search_s_value_header']}: {s_value}
 {texts['search_frequency']}: {position['frecuencia']:,} times
 Winrate (White): {position.get('winrate_white', 0.5):.3f}
 Winrate (Turn): {position.get('winrate_turn', 0.5):.3f}
 Best Move (DB): {best_move if best_move else 'N/A'}
 Stockfish Best: {sf_best if sf_best != 'N/A' else 'Not analyzed'}
 Stockfish Score: {sf_score if sf_score != 'N/A' else 'N/A'}
 First seen: {position.get('created_at', 'N/A')}
"""
            self.position_info.setPlainText(info)

            moves = self.db.get_transitions_from_hash(position['s_hash'])
            self.moves_table.setRowCount(len(moves))

            for i, move in enumerate(moves):
                uci_item = QTableWidgetItem(move['move_uci'])
                self.moves_table.setItem(i, 0, uci_item)

                try:
                    board = chess.Board()
                    move_obj = chess.Move.from_uci(move['move_uci'])
                    san = board.san(move_obj) if board.is_legal(move_obj) else move['move_uci']
                except:
                    san = move['move_uci']
                san_item = QTableWidgetItem(san)
                self.moves_table.setItem(i, 1, san_item)

                freq_item = QTableWidgetItem(str(move['frecuencia']))
                freq_item.setTextAlignment(Qt.AlignRight)
                self.moves_table.setItem(i, 2, freq_item)

                wr_item = QTableWidgetItem(f"{move['winrate_from_move']:.3f}")
                wr_item.setTextAlignment(Qt.AlignRight)
                self.moves_table.setItem(i, 3, wr_item)

                sf_match = ""
                if sf_best != 'N/A' and move['move_uci'] == sf_best:
                    sf_match = " SF"
                sf_item = QTableWidgetItem(sf_match)
                sf_item.setTextAlignment(Qt.AlignCenter)
                self.moves_table.setItem(i, 4, sf_item)

            self.moves_table.resizeColumnsToContents()
            self.btn_analyze_sf.setEnabled(True)
            
            if sf_best != 'N/A':
                sf_info_text = f"""
STOCKFISH ANALYSIS:
  Best Move: {sf_best}
  Score: {sf_score} centipawns
  Depth: {sf_depth}
"""
                self.sf_info.setText(sf_info_text)

        except Exception as e:
            self.position_info.setPlainText(f"Error searching: {str(e)}")
            self.btn_analyze_sf.setEnabled(True)

    def analyze_with_stockfish(self):
        texts = SEARCH_DIALOG_TEXTS.get(self.current_lang, SEARCH_DIALOG_TEXTS['en'])
        fen = self.fen_input.toPlainText().strip()
        if not fen:
            QMessageBox.warning(self, "Warning", "Please enter a FEN position first")
            return

        if self.stockfish is None or not self.stockfish.is_available():
            error_msg = texts['search_sf_not_available']
            if self.stockfish and self.stockfish.get_error():
                error_msg += f"\n\nError: {self.stockfish.get_error()}"
            
            reply = QMessageBox.question(
                self, 
                "Stockfish Not Available", 
                error_msg + "\n\n¿Deseas seleccionar el archivo del motor manualmente?",
                QMessageBox.Yes | QMessageBox.No
            )
            
            if reply == QMessageBox.Yes:
                file_path, _ = QFileDialog.getOpenFileName(
                    self,
                    texts.get('search_sf_select_engine', 'Select Stockfish Engine'),
                    "",
                    texts.get('search_sf_engine_files', 'Stockfish Engine (*.exe);;All Files (*)')
                )
                if file_path:
                    if self.stockfish.set_engine_path(file_path):
                        QMessageBox.information(self, "Success", "Stockfish engine loaded successfully!")
                    else:
                        QMessageBox.warning(self, "Error", f"Failed to load engine: {self.stockfish.get_error()}")
                        return
                else:
                    return
            else:
                return

        self.btn_analyze_sf.setEnabled(False)
        self.btn_analyze_sf.setText(texts['search_analyzing'])
        QApplication.processEvents()

        try:
            analysis = self.stockfish.analyze_position(fen, depth=18)
            
            if analysis:
                sf_info_text = f"""
STOCKFISH ANALYSIS (Depth: {analysis['depth']}):
  Best Move: {analysis['best_move']} ({analysis['best_move_san']})
  Score: {analysis['score']} centipawns
"""
                if analysis['mate']:
                    sf_info_text += f"  Mate in: {analysis['mate']} moves\n"
                
                if analysis.get('top_moves'):
                    sf_info_text += "\nTop Moves:\n"
                    for i, move in enumerate(analysis['top_moves'][:5], 1):
                        sf_info_text += f"  {i}. {move['Move']} (Score: {move.get('Centipawn', 'N/A')}cp)\n"
                
                self.sf_info.setText(sf_info_text)
                
                position = self.db.get_position_by_fen(fen)
                if position:
                    self.db.update_position_with_sf(fen, analysis)
                    QMessageBox.information(self, "Stockfish Analysis", texts['search_sf_saved'])
                    self.search_by_fen()
                else:
                    QMessageBox.information(self, "Stockfish Analysis", texts['search_sf_not_saved'])
            else:
                error = self.stockfish.get_error() if self.stockfish else "Unknown error"
                self.sf_info.setText(f"{texts['search_sf_failed']}\nError: {error}")
                
        except Exception as e:
            self.sf_info.setText(f"Error: {str(e)}")
            logger.error(f"Stockfish analysis error: {str(e)}")
        
        self.btn_analyze_sf.setEnabled(True)
        self.btn_analyze_sf.setText(texts['search_btn_analyze_sf'])

    def on_top_double_click(self, item):
        row = item.row()
        fen = self.top_table.item(row, 1).data(Qt.UserRole)
        if fen:
            self.tabs.setCurrentIndex(0)
            self.fen_input.setPlainText(fen)
            self.on_fen_input_changed()
            self.search_by_fen()


# ============================================================================
# CLASE: MultiplePGNAnalysisWidget - SIN STOCKFISH (SOLO GUARDA POSICIONES)
# ============================================================================
class MultiplePGNAnalysisWidget(QWidget):
    send_game_to_analysis = pyqtSignal(str)
    
    def __init__(self, parent=None, position_db=None, mapeo_casillas=None, valores_piezas=None):
        super().__init__(parent)
        self.parent = parent
        self.position_db = position_db
        self.mapeo_casillas = mapeo_casillas
        self.valores_piezas = valores_piezas
        self.current_lang = "en"
        
        self.games_data = []
        self.analysis_results = []
        self.is_analyzing = False
        self.cancel_analysis_flag = False
        
        self.setup_ui()
        
    def get_text(self, key):
        texts = MULTIPLE_PGN_TEXTS.get(self.current_lang, MULTIPLE_PGN_TEXTS['en'])
        return texts.get(key, key)
        
    def setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(5)
        
        top_panel = QWidget()
        top_layout = QHBoxLayout(top_panel)
        top_layout.setContentsMargins(0, 0, 0, 0)
        top_layout.setSpacing(5)
        
        self.btn_load_pgn = QPushButton(" Load PGN (Multiple Games)")
        self.btn_load_pgn.setStyleSheet("background-color: #4CAF50; color: white; padding: 8px;")
        self.btn_load_pgn.clicked.connect(self.load_multiple_pgn)
        
        self.btn_analyze_all = QPushButton(" Analyze All Games")
        self.btn_analyze_all.setStyleSheet("background-color: #2196F3; color: white; padding: 8px;")
        self.btn_analyze_all.clicked.connect(self.analyze_all_games)
        self.btn_analyze_all.setEnabled(False)
        
        self.btn_cancel_analysis = QPushButton(" ⛔ Cancel Analysis")
        self.btn_cancel_analysis.setStyleSheet("background-color: #f44336; color: white; padding: 8px;")
        self.btn_cancel_analysis.clicked.connect(self.cancel_analysis)
        self.btn_cancel_analysis.setEnabled(False)
        
        self.btn_send_to_analysis = QPushButton(" 📤 Send to PGN Analysis")
        self.btn_send_to_analysis.setStyleSheet("background-color: #FF9800; color: white; padding: 8px; font-weight: bold;")
        self.btn_send_to_analysis.clicked.connect(self.send_selected_to_analysis)
        self.btn_send_to_analysis.setEnabled(False)
        self.btn_send_to_analysis.setToolTip("Send the selected game to the PGN Analysis tab")
        
        self.btn_clear_data = QPushButton(" Clear Data")
        self.btn_clear_data.setStyleSheet("background-color: #f44336; color: white; padding: 8px;")
        self.btn_clear_data.clicked.connect(self.clear_data)
        self.btn_clear_data.setEnabled(False)
        
        self.lbl_games_count = QLabel("Games: 0")
        self.lbl_games_count.setStyleSheet("font-weight: bold; padding: 8px;")
        
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        self.progress_bar.setMaximum(100)
        
        top_layout.addWidget(self.btn_load_pgn)
        top_layout.addWidget(self.btn_analyze_all)
        top_layout.addWidget(self.btn_cancel_analysis)
        top_layout.addWidget(self.btn_send_to_analysis)
        top_layout.addWidget(self.btn_clear_data)
        top_layout.addWidget(self.lbl_games_count)
        top_layout.addStretch()
        
        layout.addWidget(top_panel)
        layout.addWidget(self.progress_bar)
        
        splitter = QSplitter(Qt.Vertical)
        
        games_panel = QWidget()
        games_layout = QVBoxLayout(games_panel)
        games_layout.setContentsMargins(0, 0, 0, 0)
        
        self.lbl_games = QLabel("Games in PGN File:")
        games_layout.addWidget(self.lbl_games)
        
        self.games_table = QTableWidget()
        self.games_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.games_table.setSelectionBehavior(QTableWidget.SelectRows)
        self.games_table.setSelectionMode(QTableWidget.SingleSelection)
        self.games_table.setColumnCount(7)
        self.games_table.setHorizontalHeaderLabels([
            "#", "Event", "White", "Black", "Result", "Moves", "Status"
        ])
        self.games_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.games_table.setMinimumHeight(200)
        self.games_table.itemDoubleClicked.connect(self.on_game_double_click)
        self.games_table.itemSelectionChanged.connect(self.on_selection_changed)
        games_layout.addWidget(self.games_table)
        
        splitter.addWidget(games_panel)
        
        details_panel = QWidget()
        details_layout = QVBoxLayout(details_panel)
        details_layout.setContentsMargins(0, 0, 0, 0)
        
        self.lbl_log = QLabel("Analysis Log:")
        details_layout.addWidget(self.lbl_log)
        
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)
        self.log_text.setFont(QFont("Courier New", 9))
        self.log_text.setMaximumHeight(150)
        details_layout.addWidget(self.log_text)
        
        splitter.addWidget(details_panel)
        
        splitter.setSizes([400, 150])
        layout.addWidget(splitter)
        
        self.apply_translations()
    
    def on_selection_changed(self):
        selected = self.games_table.selectedItems()
        if selected and len(self.games_data) > 0:
            self.btn_send_to_analysis.setEnabled(True)
        else:
            self.btn_send_to_analysis.setEnabled(False)
    
    def send_selected_to_analysis(self):
        selected_rows = set()
        for item in self.games_table.selectedItems():
            selected_rows.add(item.row())
        
        if not selected_rows:
            QMessageBox.warning(self, "Warning", "Please select a game first.")
            return
        
        row = list(selected_rows)[0]
        
        if row >= len(self.games_data):
            QMessageBox.warning(self, "Error", "Invalid game selected.")
            return
        
        game = self.games_data[row]
        
        try:
            exporter = chess.pgn.StringExporter(headers=True, variations=True, comments=False)
            pgn_string = game.accept(exporter)
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Error generating PGN: {str(e)}")
            return
        
        self.send_game_to_analysis.emit(pgn_string)
        
        game_info = f"{game.headers.get('White', '?')} vs {game.headers.get('Black', '?')}"
        moves_count = len(list(game.mainline_moves()))
        QMessageBox.information(
            self, 
            "Game Sent", 
            f"Game sent to PGN Analysis tab!\n\n"
            f"{game_info}\n"
            f"Event: {game.headers.get('Event', '?')}\n"
            f"Moves: {moves_count}"
        )
    
    def apply_translations(self):
        self.btn_load_pgn.setText(self.get_text('btn_load_pgn'))
        self.btn_analyze_all.setText(self.get_text('btn_analyze_all'))
        self.btn_cancel_analysis.setText("⛔ " + self.get_text('cancel_analysis'))
        self.btn_send_to_analysis.setText(" 📤 " + self.get_text('btn_send_to_analysis'))
        self.btn_clear_data.setText(self.get_text('btn_clear_data'))
        self.lbl_games.setText(self.get_text('games_label'))
        self.lbl_log.setText(self.get_text('log_label'))
        
        headers = [
            self.get_text('col_number'),
            self.get_text('col_event'),
            self.get_text('col_white'),
            self.get_text('col_black'),
            self.get_text('col_result'),
            self.get_text('col_moves'),
            self.get_text('col_status')
        ]
        self.games_table.setHorizontalHeaderLabels(headers)
        self.lbl_games_count.setText(self.get_text('games_count').format(len(self.games_data)))
    
    def set_language(self, lang_code):
        if lang_code in MULTIPLE_PGN_TEXTS:
            self.current_lang = lang_code
            self.apply_translations()
    
    def load_multiple_pgn(self):
        try:
            options = QFileDialog.Options()
            file_name, _ = QFileDialog.getOpenFileName(
                self, self.get_text('load_pgn_title'), "", 
                self.get_text('pgn_files'), options=options)
            
            if not file_name:
                return
                
            self.games_data = []
            self.analysis_results = []
            self.log_text.clear()
            self.btn_send_to_analysis.setEnabled(False)
            
            with open(file_name, 'r', encoding='utf-8', errors='replace') as f:
                pgn_text = f.read()
            
            games = []
            
            try:
                pgn_io = StringIO(pgn_text)
                temp_games = []
                while True:
                    game = chess.pgn.read_game(pgn_io)
                    if game is None:
                        break
                    temp_games.append(game)
                
                if temp_games:
                    games = temp_games
                    self.log_text.append(f"✅ StringIO: {len(games)} games found")
            except Exception as e:
                self.log_text.append(f"⚠️ StringIO method failed: {str(e)}")
            
            if len(games) < 2:
                self.log_text.append("🔄 Using regex fallback method...")
                game_pattern = r'\[Event\s+"[^"]*"\](?:[\s\n]*\[[^\]]+\])+[\s\n]*1\.'
                matches = re.finditer(game_pattern, pgn_text, re.MULTILINE | re.DOTALL)
                positions = [m.start() for m in matches]
                
                if not positions:
                    header_pattern = r'(\[Event\s+"[^"]*"\][\s\n]*)+'
                    header_matches = list(re.finditer(header_pattern, pgn_text, re.MULTILINE | re.DOTALL))
                    positions = [m.start() for m in header_matches]
                
                for i, pos in enumerate(positions):
                    start = pos
                    end = positions[i+1] if i+1 < len(positions) else len(pgn_text)
                    game_text = pgn_text[start:end].strip()
                    if game_text:
                        try:
                            game_io = StringIO(game_text)
                            game = chess.pgn.read_game(game_io)
                            if game:
                                games.append(game)
                        except:
                            pass
            
            if len(games) < 2:
                self.log_text.append("🔄 Using blank line split method...")
                game_texts = pgn_text.split("\n\n\n")
                for game_text in game_texts:
                    if game_text.strip():
                        try:
                            game_io = StringIO(game_text)
                            game = chess.pgn.read_game(game_io)
                            if game:
                                games.append(game)
                        except:
                            pass
            
            if not games:
                self.log_text.append("🔄 Using '1.' split method...")
                parts = pgn_text.split("1.")
                for i, part in enumerate(parts):
                    if part.strip():
                        try:
                            game_text = ("[Event \"Unknown\"]\n[Site \"?\"]\n[Date \"????.??.??\"]\n" +
                                        f"[Round \"{i+1}\"]\n[White \"?\"][Black \"?\"]\n[Result \"*\"]\n1." + part)
                            game_io = StringIO(game_text)
                            game = chess.pgn.read_game(game_io)
                            if game:
                                games.append(game)
                        except:
                            pass
            
            if not games:
                QMessageBox.warning(self, "Warning", self.get_text('no_games_warning'))
                return
                
            self.games_data = games
            self.lbl_games_count.setText(self.get_text('games_count').format(len(games)))
            self.btn_analyze_all.setEnabled(True)
            self.btn_clear_data.setEnabled(True)
            
            self.update_games_table()
            self.log_text.append(self.get_text('loading_games').format(len(games), os.path.basename(file_name)))
            
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Error loading PGN: {str(e)}")
            self.log_text.append(self.get_text('load_error').format(str(e)))
    
    def update_games_table(self):
        self.games_table.setRowCount(len(self.games_data))
        status_pending = self.get_text('status_pending')
        self.btn_send_to_analysis.setEnabled(False)
        
        for i, game in enumerate(self.games_data):
            headers = game.headers
            moves_count = len(list(game.mainline_moves()))
            
            self.games_table.setItem(i, 0, QTableWidgetItem(str(i+1)))
            self.games_table.setItem(i, 1, QTableWidgetItem(headers.get("Event", "?")))
            self.games_table.setItem(i, 2, QTableWidgetItem(headers.get("White", "?")))
            self.games_table.setItem(i, 3, QTableWidgetItem(headers.get("Black", "?")))
            self.games_table.setItem(i, 4, QTableWidgetItem(headers.get("Result", "*")))
            self.games_table.setItem(i, 5, QTableWidgetItem(str(moves_count)))
            self.games_table.setItem(i, 6, QTableWidgetItem(status_pending))
            
        self.games_table.resizeColumnsToContents()
    
    def analyze_all_games(self):
        if not self.games_data:
            return
            
        if self.is_analyzing:
            return
            
        self.is_analyzing = True
        self.cancel_analysis_flag = False
        self.btn_analyze_all.setEnabled(False)
        self.btn_load_pgn.setEnabled(False)
        self.btn_clear_data.setEnabled(False)
        self.btn_cancel_analysis.setEnabled(True)
        self.progress_bar.setVisible(True)
        self.progress_bar.setValue(0)
        
        self.analysis_results = []
        total_games = len(self.games_data)
        
        self.log_text.clear()
        self.log_text.append(self.get_text('start_analysis').format(total_games))
        self.log_text.append("-" * 50)
        self.log_text.append("")
        
        for idx, game in enumerate(self.games_data):
            if self.cancel_analysis_flag:
                self.log_text.append("\n⛔ Analysis cancelled by user.")
                break
                
            if self.parent and hasattr(self.parent, 'is_analyzing') and not self.parent.is_analyzing:
                break
                
            progress = (idx + 1) / total_games * 100
            self.progress_bar.setValue(int(progress))
            QApplication.processEvents()
            
            result = game.headers.get("Result", "*")
            result_map = {"1-0": 1.0, "0-1": 0.0, "1/2-1/2": 0.5}
            game_result = result_map.get(result, None)
            
            board = game.board()
            board_states = [board.fen()]
            move_list = []
            
            for move in game.mainline_moves():
                try:
                    if board.is_legal(move):
                        san = board.san(move)
                        board.push(move)
                        board_states.append(board.fen())
                        move_list.append(san)
                except:
                    continue
                    
            event_name = game.headers.get('Event', 'Unknown')
            self.log_text.append(self.get_text('analyzing_game').format(idx+1, total_games, event_name))
            QApplication.processEvents()
            
            positions_processed = 0
            
            for i, fen in enumerate(board_states):
                if self.cancel_analysis_flag:
                    self.log_text.append("\n⛔ Analysis cancelled by user.")
                    break
                    
                try:
                    board_pos = chess.Board(fen)
                    exact_value = self.calculate_exact_value(board_pos)
                    
                    if not isfinite(exact_value):
                        continue
                    
                    metadata = {
                        'game_index': idx,
                        'move_index': i,
                        'game_result': game_result,
                        'game_headers': dict(game.headers)
                    }
                    
                    s_hash, is_new = self.position_db.save_position(exact_value, fen, metadata, None)
                    positions_processed += 1
                    
                    if i > 0:
                        prev_board = chess.Board(board_states[i-1])
                        for move in prev_board.legal_moves:
                            prev_board_copy = prev_board.copy()
                            prev_board_copy.push(move)
                            if prev_board_copy.fen() == board_pos.fen():
                                prev_value = self.calculate_exact_value(prev_board)
                                if isfinite(prev_value) and isfinite(exact_value):
                                    self.position_db.save_transition(
                                        prev_value,
                                        exact_value,
                                        move.uci(),
                                        game_result
                                    )
                                break
                                
                except Exception as e:
                    self.log_text.append(self.get_text('game_error').format(i, str(e)))
                    continue
                    
                if i % 10 == 0:
                    QApplication.processEvents()
            
            if self.cancel_analysis_flag:
                break
            
            status_item = QTableWidgetItem(self.get_text('status_analyzed'))
            status_item.setForeground(Qt.green)
            self.games_table.setItem(idx, 6, status_item)
            
            self.log_text.append(self.get_text('positions_processed').format(positions_processed))
            self.log_text.append("")
            QApplication.processEvents()
        
        self.is_analyzing = False
        self.progress_bar.setVisible(False)
        self.btn_analyze_all.setEnabled(True)
        self.btn_load_pgn.setEnabled(True)
        self.btn_clear_data.setEnabled(True)
        self.btn_cancel_analysis.setEnabled(False)
        
        if not self.cancel_analysis_flag:
            self.log_text.append("-" * 50)
            self.log_text.append(self.get_text('analysis_complete').format(total_games))
            
            stats = self.position_db.get_statistics()
            self.log_text.append(self.get_text('db_stats').format(stats['total_positions'], stats['total_occurrences']))
            
            QMessageBox.information(self, self.get_text('analysis_complete_title'), 
                                   self.get_text('analysis_complete_msg').format(
                                       total_games, 
                                       stats['total_positions'], 
                                       stats['total_occurrences']
                                   ))
        else:
            self.log_text.append("\n⛔ Analysis cancelled.")
    
    def cancel_analysis(self):
        if not self.is_analyzing:
            return
        
        reply = QMessageBox.question(
            self, 
            "Cancel Analysis", 
            "¿Estás seguro de que deseas cancelar el análisis en curso?",
            QMessageBox.Yes | QMessageBox.No
        )
        
        if reply == QMessageBox.Yes:
            self.cancel_analysis_flag = True
            self.log_text.append("\n⛔ Cancelling analysis... (will stop after current position)")
            self.btn_cancel_analysis.setEnabled(False)
    
    def calculate_exact_value(self, board):
        try:
            exact_value = 1
            for square in chess.SQUARES:
                piece = board.piece_at(square)
                if piece is not None:
                    square_name = chess.square_name(square)
                    casilla_valor = self.mapeo_casillas.get(square_name, 1)
                    pieza_valor = self.valores_piezas.get(piece.symbol(), 1)
                    exact_value *= (casilla_valor ** pieza_valor)
            return exact_value
        except:
            return float('inf')
        
    def on_game_double_click(self, item):
        row = item.row()
        if row < len(self.games_data):
            game = self.games_data[row]
            headers = game.headers
            info = self.get_text('game_info').format(
                row+1,
                headers.get('Event', '?'),
                headers.get('Site', '?'),
                headers.get('Date', '?'),
                headers.get('Round', '?'),
                headers.get('White', '?'),
                headers.get('Black', '?'),
                headers.get('Result', '*'),
                len(list(game.mainline_moves()))
            )
            QMessageBox.information(self, self.get_text('game_info_title').format(row+1), info)
        
    def clear_data(self):
        reply = QMessageBox.question(self, self.get_text('clear_question'), 
                                     self.get_text('clear_confirm'),
                                     QMessageBox.Yes | QMessageBox.No)
        if reply == QMessageBox.Yes:
            self.games_data = []
            self.analysis_results = []
            self.cancel_analysis_flag = False
            self.games_table.setRowCount(0)
            self.lbl_games_count.setText(self.get_text('games_count').format(0))
            self.btn_analyze_all.setEnabled(False)
            self.btn_clear_data.setEnabled(False)
            self.btn_cancel_analysis.setEnabled(False)
            self.btn_send_to_analysis.setEnabled(False)
            self.log_text.clear()
            self.log_text.append(self.get_text('data_cleared'))


# ============================================================================
# CLASE PRINCIPAL: ChessAnalyzer
# ============================================================================
class ChessAnalyzer(QMainWindow):
    def __init__(self):
        super().__init__()
        
        self.logger = logging.getLogger(f"{__name__}.ChessAnalyzer")
        
        self.mapeo_casillas = {
            'a1': 2, 'b1': 3, 'c1': 5, 'd1': 7, 'e1': 11, 'f1': 13, 'g1': 17, 'h1': 19,
            'a2': 23, 'b2': 29, 'c2': 31, 'd2': 37, 'e2': 41, 'f2': 43, 'g2': 47, 'h2': 53,
            'a3': 59, 'b3': 61, 'c3': 67, 'd3': 71, 'e3': 73, 'f3': 79, 'g3': 83, 'h3': 89,
            'a4': 97, 'b4': 101, 'c4': 103, 'd4': 107, 'e4': 109, 'f4': 113, 'g4': 127, 'h4': 131,
            'a5': 137, 'b5': 139, 'c5': 149, 'd5': 151, 'e5': 157, 'f5': 163, 'g5': 167, 'h5': 173,
            'a6': 179, 'b6': 181, 'c6': 191, 'd6': 193, 'e6': 197, 'f6': 199, 'g6': 211, 'h6': 223,
            'a7': 227, 'b7': 229, 'c7': 233, 'd7': 239, 'e7': 241, 'f7': 251, 'g7': 257, 'h7': 263,
            'a8': 269, 'b8': 271, 'c8': 277, 'd8': 281, 'e8': 283, 'f8': 293, 'g8': 307, 'h8': 311
        }
        
        self.valores_piezas = {
            'P': 1, 'p': 2, 'N': 5, 'n': 6, 'B': 7, 'b': 8,
            'R': 3, 'r': 4, 'Q': 9, 'q': 10, 'K': 11, 'k': 12
        }
        
        self.translations = {
            "en": self.english_translations(),
            "es": self.spanish_translations(),
            "de": self.german_translations()
        }
        self.current_lang = "en"
        self.translator = QTranslator()
        
        self.setWindowTitle(self.translate("window_title"))
        
        self.current_pgn_path = ""
        self.current_move_index = 0
        self.board_states = []
        self.move_list = []
        self.pgn_text = ""
        self.analysis_data = None
        self.generated_graphs = {}
        self.graph_settings = {
            'position': {'type': 'line', 'safe_mode': True},
            'diff': {'type': 'line', 'safe_mode': True},
            'ratio': {'type': 'line', 'safe_mode': True}
        }
        self.current_graph_type = 'position'
        self.table_view_mode = 'all_data'
        
        self.MAX_SAFE_VALUE = 1e300
        
        self.figure = plt.figure(figsize=(10, 6))
        self.canvas = FigureCanvas(self.figure)
        
        self.position_db = PositionDatabase()
        self.editor_instance = None
        
        # ============================================================
        # STOCKFISH INICIALIZADO CORRECTAMENTE - VERSIÓN ORIGINAL
        # ============================================================
        try:
            from stockfish import Stockfish
            self.stockfish_engine = StockfishEngine()
            if self.stockfish_engine.is_available():
                logger.info("✅ Stockfish Engine inicializado correctamente")
            else:
                logger.warning(f"⚠️ Stockfish Engine no disponible: {self.stockfish_engine.get_error()}")
        except Exception as e:
            logger.error(f"❌ Error inicializando Stockfish: {str(e)}")
            self.stockfish_engine = None
        
        # ============================================================
        # INICIALIZAR RED NEURONAL
        # ============================================================
        self.neural_network = None
        self.neural_available = NEURAL_AVAILABLE

        if self.neural_available:
            try:
                from neural_network import NeuralNetworkDialog
                logger.info("✅ Red neuronal disponible correctamente")
            except Exception as e:
                logger.error(f"❌ Error inicializando red neuronal: {str(e)}")
                self.neural_available = False
        
        self.setup_ui()
        self.showMaximized()
    
    def setup_ui(self):
        try:
            central_widget = QWidget()
            self.setCentralWidget(central_widget)
            
            main_layout = QVBoxLayout(central_widget)
            main_layout.setContentsMargins(5, 5, 5, 5)
            main_layout.setSpacing(5)
            
            self.tab_widget = QTabWidget()
            main_layout.addWidget(self.tab_widget)
            
            self.setup_pgn_tab()
            self.setup_multiple_pgn_tab()
            
        except Exception as e:
            self.logger.error(f"Error setting up UI: {str(e)}")
            QMessageBox.critical(self, self.translate("critical_error"), 
                               f"{self.translate('app_failed')}:\n{str(e)}")
    
    def setup_multiple_pgn_tab(self):
        self.multiple_analysis_widget = MultiplePGNAnalysisWidget(
            parent=self,
            position_db=self.position_db,
            mapeo_casillas=self.mapeo_casillas,
            valores_piezas=self.valores_piezas
        )
        self.multiple_analysis_widget.current_lang = self.current_lang
        self.multiple_analysis_widget.apply_translations()
        
        self.multiple_analysis_widget.send_game_to_analysis.connect(self.load_game_from_multiple)
        
        self.tab_widget.addTab(self.multiple_analysis_widget, MULTIPLE_PGN_TEXTS[self.current_lang]['tab_title'])
    
    def load_game_from_multiple(self, pgn_string: str):
        try:
            self.tab_widget.setCurrentIndex(0)
            self.clear_previous_data()
            
            self.pgn_text = pgn_string
            self.pgn_textedit.setPlainText(pgn_string)
            self.current_pgn_path = "from_multiple_analysis.pgn"
            
            game = chess.pgn.read_game(StringIO(pgn_string))
            if game:
                self.board_states = []
                self.move_list = []
                board = game.board()
                self.board_states.append(board.fen())
                
                for move in game.mainline_moves():
                    if board.is_legal(move):
                        san = board.san(move)
                        board.push(move)
                        self.board_states.append(board.fen())
                        self.move_list.append(san)
                
                self.current_move_index = 0
                self.show_current_board()
                
                self.btn_analyze.setEnabled(True)
                self.btn_formula.setEnabled(True)
                self.btn_open_graph_viewer.setEnabled(False)
                
                game_info = f"{game.headers.get('White', '?')} vs {game.headers.get('Black', '?')}"
                moves_count = len(self.move_list)
                self.statusBar().showMessage(f"✅ Game loaded from Multiple PGN: {game_info} ({moves_count} moves)")
                
                logger.info(f"Game loaded from Multiple PGN: {moves_count} moves")
            else:
                QMessageBox.warning(self, "Error", "Could not parse the selected game.")
                
        except Exception as e:
            self.logger.error(f"Error loading game from multiple PGN: {str(e)}")
            QMessageBox.critical(self, "Error", f"Error loading game:\n{str(e)}")
    
    def setup_pgn_tab(self):
        pgn_tab = QWidget()
        pgn_layout = QVBoxLayout(pgn_tab)
        pgn_layout.setContentsMargins(5, 5, 5, 5)
        
        self.main_splitter = QSplitter(Qt.Vertical)
        pgn_layout.addWidget(self.main_splitter)
        
        top_widget = QWidget()
        top_layout = QHBoxLayout(top_widget)
        top_layout.setContentsMargins(0, 0, 0, 0)
        
        self.top_splitter = QSplitter(Qt.Horizontal)
        top_layout.addWidget(self.top_splitter)
        
        pgn_panel = QWidget()
        pgn_panel_layout = QVBoxLayout(pgn_panel)
        pgn_panel_layout.setContentsMargins(0, 0, 0, 0)
        
        self.button_panel = QWidget()
        button_layout = QHBoxLayout(self.button_panel)
        button_layout.setSpacing(5)
        
        self.btn_load = QPushButton(self.translate("load_pgn"))
        self.btn_load.setStyleSheet("background-color: #4CAF50; color: white;")
        
        self.btn_analyze = QPushButton(self.translate("analyze_game"))
        self.btn_analyze.setStyleSheet("background-color: #2196F3; color: white;")
        self.btn_analyze.setEnabled(False)
        
        self.btn_values = QPushButton(self.translate("detailed_values"))
        self.btn_values.setStyleSheet("background-color: #607D8B; color: white;")
        self.btn_values.setEnabled(False)
        
        self.btn_export = QPushButton(self.translate("export_docx"))
        self.btn_export.setStyleSheet("background-color: #795548; color: white;")
        self.btn_export.setEnabled(False)
        
        self.btn_formula = QPushButton(self.translate("next_plays"))
        self.btn_formula.setStyleSheet("background-color: #E91E63; color: white;")
        self.btn_formula.setEnabled(False)
        
        self.btn_search = QPushButton(self.translate("search_positions"))
        self.btn_search.setStyleSheet("background-color: #FF9800; color: white;")
        self.btn_search.clicked.connect(self.open_search_dialog)
        
        self.btn_db_stats = QPushButton(self.translate("db_stats"))
        self.btn_db_stats.setStyleSheet("background-color: #3F51B5; color: white;")
        self.btn_db_stats.clicked.connect(self.show_db_stats)
        
        self.btn_neural = QPushButton(self.translate("neural_network"))
        self.btn_neural.setStyleSheet("background-color: #9C27B0; color: white;")
        self.btn_neural.clicked.connect(self.open_neural_network)
        self.btn_neural.setEnabled(True)
        
        self.btn_open_editor = QPushButton(self.translate("open_position_editor"))
        self.btn_open_editor.setStyleSheet("background-color: #673AB7; color: white;")
        self.btn_open_editor.clicked.connect(self.open_position_editor)
        
        self.btn_help = QPushButton(self.translate("help"))
        self.btn_help.setStyleSheet("background-color: #009688; color: white;")
        
        self.lang_combo = QComboBox()
        self.lang_combo.addItem("English", "en")
        self.lang_combo.addItem("Espanol", "es")
        self.lang_combo.addItem("Deutsch", "de")
        self.lang_combo.setCurrentIndex(0)
        
        button_layout.addWidget(self.btn_load)
        button_layout.addWidget(self.btn_analyze)
        button_layout.addWidget(self.btn_values)
        button_layout.addWidget(self.btn_export)
        button_layout.addWidget(self.btn_formula)
        button_layout.addWidget(self.btn_search)
        button_layout.addWidget(self.btn_db_stats)
        button_layout.addWidget(self.btn_neural)
        button_layout.addWidget(self.btn_open_editor)
        button_layout.addWidget(self.btn_help)
        button_layout.addStretch()
        button_layout.addWidget(QLabel(self.translate("language") + ":"))
        button_layout.addWidget(self.lang_combo)
        
        self.pgn_textedit = QTextEdit()
        self.pgn_textedit.setPlaceholderText(self.translate("pgn_placeholder"))
        
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setWidget(self.pgn_textedit)
        
        pgn_panel_layout.addWidget(self.button_panel)
        pgn_panel_layout.addWidget(scroll_area)
        
        board_panel = QWidget()
        board_layout = QVBoxLayout(board_panel)
        board_layout.setContentsMargins(0, 0, 0, 0)
        
        self.board_widget = QSvgWidget()
        self.board_widget.setMinimumSize(200, 200)
        self.board_widget.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        
        nav_panel = QWidget()
        nav_layout = QHBoxLayout(nav_panel)
        
        self.btn_first = QPushButton("<<")
        self.btn_prev = QPushButton("<")
        self.btn_next = QPushButton(">")
        self.btn_last = QPushButton(">>")
        
        nav_layout.addWidget(self.btn_first)
        nav_layout.addWidget(self.btn_prev)
        nav_layout.addWidget(self.btn_next)
        nav_layout.addWidget(self.btn_last)
        
        board_layout.addWidget(self.board_widget, 0, Qt.AlignCenter)
        board_layout.addWidget(nav_panel)
        
        self.top_splitter.addWidget(pgn_panel)
        self.top_splitter.addWidget(board_panel)
        
        bottom_panel = QWidget()
        bottom_layout = QVBoxLayout(bottom_panel)
        bottom_layout.setContentsMargins(0, 0, 0, 0)
        
        self.btn_open_graph_viewer = QPushButton(self.translate("open_graph_viewer"))
        self.btn_open_graph_viewer.setStyleSheet("background-color: #3F51B5; color: white;")
        self.btn_open_graph_viewer.setEnabled(False)
        self.btn_open_graph_viewer.clicked.connect(self.open_graph_viewer)
        
        bottom_layout.addWidget(self.btn_open_graph_viewer)
        
        self.main_splitter.addWidget(top_widget)
        self.main_splitter.addWidget(bottom_panel)
        
        self.btn_load.clicked.connect(self.load_pgn)
        self.btn_analyze.clicked.connect(self.analyze_game)
        self.btn_values.clicked.connect(self.show_values_table)
        self.btn_export.clicked.connect(self.export_to_docx)
        self.btn_help.clicked.connect(self.show_help)
        self.btn_first.clicked.connect(self.first_move)
        self.btn_prev.clicked.connect(self.prev_move)
        self.btn_next.clicked.connect(self.next_move)
        self.btn_last.clicked.connect(self.last_move)
        self.lang_combo.currentIndexChanged.connect(self.change_language)
        self.btn_formula.clicked.connect(self.show_formula_analysis)
        
        self.show_empty_board()
        self.tab_widget.addTab(pgn_tab, self.translate("pgn_analysis"))
    
    def open_neural_network(self):
        if not self.neural_available:
            QMessageBox.warning(self, "Advertencia", 
                "La red neuronal no está disponible.\n\n"
                "Para instalarla ejecuta:\n"
                "pip install tensorflow scikit-learn")
            return
        
        try:
            if NEURAL_AVAILABLE:
                from neural_network import NeuralNetworkDialog
                
                # Verificar Stockfish - SOLO mostrar advertencia si NO está disponible
                if self.stockfish_engine:
                    if not self.stockfish_engine.is_available():
                        logger.warning("Stockfish no está disponible")
                        QMessageBox.warning(self, "Advertencia", 
                            "Stockfish no está disponible. La red neuronal funcionará sin análisis de Stockfish.\n\n"
                            f"Error: {self.stockfish_engine.get_error() if self.stockfish_engine else 'Desconocido'}")
                
                current_board = None
                if hasattr(self, 'board_widget') and hasattr(self, 'current_move_index'):
                    try:
                        if self.board_states and self.current_move_index < len(self.board_states):
                            current_fen = self.board_states[self.current_move_index]
                            current_board = chess.Board(current_fen)
                    except Exception as e:
                        self.logger.warning(f"No se pudo obtener el tablero actual: {e}")
                        current_board = None
                
                if current_board is None:
                    current_board = chess.Board()
                
                try:
                    dialog = NeuralNetworkDialog(
                        parent=self,
                        db=self.position_db,
                        stockfish=self.stockfish_engine,
                        lang=self.current_lang,
                        initial_board=current_board,
                        move_history=self.move_list if hasattr(self, 'move_list') else [],
                        board_history=self.board_states if hasattr(self, 'board_states') else []
                    )
                except TypeError as e:
                    self.logger.warning(f"Error con parámetros de NeuralNetworkDialog: {e}")
                    try:
                        dialog = NeuralNetworkDialog(
                            parent=self,
                            db=self.position_db,
                            stockfish=self.stockfish_engine,
                            lang=self.current_lang
                        )
                    except Exception as e2:
                        self.logger.error(f"Error creando NeuralNetworkDialog: {e2}")
                        QMessageBox.critical(self, "Error", f"Error creando la red neuronal:\n{str(e2)}")
                        return
                
                dialog.exec_()
            else:
                QMessageBox.warning(self, "Advertencia", 
                    "El módulo neural_network.py no se encuentra.\n"
                    "Asegúrate de que el archivo existe en el directorio.")
        except Exception as e:
            self.logger.error(f"Error abriendo red neuronal: {str(e)}")
            import traceback
            traceback.print_exc()
            QMessageBox.critical(self, "Error", 
                f"Error abriendo la red neuronal:\n{str(e)}")
    
    def open_position_editor(self):
        try:
            current_board = None
            if hasattr(self, 'board_widget') and hasattr(self, 'current_move_index'):
                try:
                    if self.board_states and self.current_move_index < len(self.board_states):
                        current_fen = self.board_states[self.current_move_index]
                        current_board = chess.Board(current_fen)
                except Exception as e:
                    self.logger.warning(f"No se pudo obtener el tablero actual: {e}")
                    current_board = None
            
            if current_board is None:
                current_board = chess.Board()
            
            self.editor_instance = PositionEditorDialog(
                parent=self, 
                caller="main", 
                lang=self.current_lang,
                initial_board=current_board
            )
            self.editor_instance.position_accepted.connect(self.on_position_edited)
            self.editor_instance.finished.connect(self.on_editor_closed)
            self.editor_instance.show()
        except Exception as e:
            self.logger.error("Error opening position editor: " + str(e))
            import traceback
            traceback.print_exc()
            QMessageBox.critical(self, self.translate("error"), 
                               "Error opening position editor:\n" + str(e))

    def on_editor_closed(self, result):
        self.editor_instance = None

    def on_position_edited(self, fen: str, pgn: str, headers: dict):
        try:
            if not pgn or pgn.strip() == "":
                QMessageBox.warning(self, "Advertencia", 
                                  "El PGN está vacío. La posición se cargará solo con el FEN.")
                board = chess.Board(fen)
                self.board_states = [fen]
                self.move_list = []
                self.current_move_index = 0
                self.show_current_board()
                self.btn_analyze.setEnabled(True)
                self.btn_formula.setEnabled(True)
                return
            
            self.clear_previous_data()
            self.pgn_text = pgn
            self.pgn_textedit.setPlainText(pgn)
            self.current_pgn_path = "edited_position.pgn"
            
            try:
                game = chess.pgn.read_game(StringIO(pgn))
                if game:
                    self.board_states = []
                    self.move_list = []
                    board = game.board()
                    self.board_states.append(board.fen())
                    
                    for move in game.mainline_moves():
                        if board.is_legal(move):
                            san = board.san(move)
                            board.push(move)
                            self.board_states.append(board.fen())
                            self.move_list.append(san)
                    
                    self.current_move_index = 0
                    self.show_current_board()
                    self.logger.info(f"PGN cargado correctamente con {len(self.move_list)} jugadas")
                else:
                    board = chess.Board(fen)
                    self.board_states = [fen]
                    self.move_list = []
                    self.current_move_index = 0
                    self.show_current_board()
                    self.logger.warning("No se pudo leer el PGN, usando solo FEN")
                    
            except Exception as e:
                self.logger.warning(f"Error procesando PGN: {str(e)}")
                try:
                    board = chess.Board(fen)
                    self.board_states = [fen]
                    self.move_list = []
                    self.current_move_index = 0
                    self.show_current_board()
                except Exception as e2:
                    self.logger.error(f"Error con FEN: {str(e2)}")
                    self.parse_pgn()
            
            self.btn_analyze.setEnabled(True)
            self.btn_formula.setEnabled(True)
            self.btn_open_graph_viewer.setEnabled(False)
            self.tab_widget.setCurrentIndex(0)
            
            QMessageBox.information(self, self.translate("information"), 
                                  self.translate("position_loaded_successfully") + 
                                  f"\n\nJugadas cargadas: {len(self.move_list)}")
            
        except Exception as e:
            self.logger.error("Error loading edited position: " + str(e))
            import traceback
            traceback.print_exc()
            QMessageBox.critical(self, self.translate("error"), 
                               "Error loading position:\n" + str(e))
    
    def open_search_dialog(self):
        try:
            dialog = SearchDialog(self, self.position_db, self.current_lang, self.stockfish_engine)
            dialog.exec_()
        except Exception as e:
            self.logger.error(f"Error opening search dialog: {str(e)}")
            QMessageBox.critical(self, "Error", f"Could not open search dialog: {str(e)}")
    
    def show_db_stats(self):
        try:
            stats = self.position_db.get_statistics()
            sf_status = "Available" if self.stockfish_engine and self.stockfish_engine.is_available() else "Not available"
            
            nn_status = "Available ✅" if self.neural_available else "Not available ❌"
            if self.neural_available and self.neural_network and hasattr(self.neural_network, 'is_trained') and self.neural_network.is_trained:
                nn_status = f"Trained ✅ ({self.neural_network.output_dim} classes)"
            
            stats_text = f"""
            <h3>Database Statistics</h3>
            <b>Total unique positions:</b> {stats['total_positions']:,}<br>
            <b>Total occurrences:</b> {stats['total_occurrences']:,}<br>
            <b>Total transitions:</b> {stats['total_transitions']:,}<br>
            <b>Average frequency:</b> {stats['avg_frequency']}<br>
            <b>Positions with Stockfish:</b> {stats['positions_with_sf']:,}<br>
            <b>Database size:</b> {stats['db_size_mb']} MB<br>
            <b>Database path:</b> {stats['db_path']}<br>
            <br>
            <b>Stockfish Engine:</b> {sf_status}<br>
            <b>Neural Network:</b> {nn_status}
            """
            QMessageBox.information(self, "Database Statistics", stats_text)
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Could not get stats: {str(e)}")
    
    def open_graph_viewer(self):
        if not self.analysis_data:
            QMessageBox.warning(self, self.translate("warning"), 
                              self.translate("load_pgn_first"))
            return
        try:
            self.graph_viewer = GraphViewer(self)
            self.graph_viewer.set_analysis_data(self.analysis_data)
            self.graph_viewer.exec_()
        except Exception as e:
            QMessageBox.critical(self, self.translate("error"),
                               f"{self.translate('error_opening_graph_viewer')}:\n{str(e)}")
    
    def show_empty_board(self):
        try:
            board = chess.Board()
            svg_data = chess.svg.board(board=board, size=300)
            self.board_widget.load(svg_data.encode('utf-8'))
        except Exception as e:
            self.logger.error(f"Error showing empty board: {str(e)}")
    
    def load_pgn(self):
        try:
            options = QFileDialog.Options()
            file_name, _ = QFileDialog.getOpenFileName(
                self, self.translate("load_pgn"), "", 
                "PGN Files (*.pgn);;All Files (*)", options=options)
            
            if file_name:
                self.clear_previous_data()
                try:
                    with open(file_name, 'r', encoding='utf-8', errors='replace') as f:
                        self.pgn_text = f.read()
                        self.pgn_textedit.setPlainText(self.pgn_text)
                        self.current_pgn_path = os.path.basename(file_name)
                        self.parse_pgn()
                        self.btn_analyze.setEnabled(True)
                        self.btn_formula.setEnabled(True)
                        self.logger.info(f"Loaded PGN file: {file_name}")
                except UnicodeDecodeError:
                    encodings = ['latin-1', 'iso-8859-1', 'cp1252']
                    for encoding in encodings:
                        try:
                            with open(file_name, 'r', encoding=encoding, errors='replace') as f:
                                self.pgn_text = f.read()
                                self.pgn_textedit.setPlainText(self.pgn_text)
                                self.current_pgn_path = os.path.basename(file_name)
                                self.parse_pgn()
                                self.btn_analyze.setEnabled(True)
                                self.btn_formula.setEnabled(True)
                                self.logger.info(f"Loaded PGN file with {encoding} encoding: {file_name}")
                                break
                        except Exception:
                            continue
                    else:
                        raise ValueError("Could not decode file with any supported encoding")
        except Exception as e:
            self.logger.error(f"Error loading PGN file: {str(e)}")
            QMessageBox.critical(self, self.translate("error"), 
                               f"{self.translate('file_load_error')}:\n{str(e)}")
    
    def clear_previous_data(self):
        self.current_move_index = 0
        self.board_states = []
        self.move_list = []
        self.pgn_text = ""
        self.analysis_data = None
        self.generated_graphs = {}
        
        if hasattr(self, 'figure'):
            self.figure.clear()
        if hasattr(self, 'canvas'):
            self.canvas.draw()
        
        self.pgn_textedit.clear()
        
        self.btn_analyze.setEnabled(False)
        self.btn_values.setEnabled(False)
        self.btn_export.setEnabled(False)
        self.btn_formula.setEnabled(False)
        self.btn_open_graph_viewer.setEnabled(False)
        
        self.show_empty_board()
    
    def parse_pgn(self):
        try:
            game = chess.pgn.read_game(StringIO(self.pgn_text))
            if game is None:
                raise ValueError(self.translate("invalid_pgn"))
            
            self.board_states = []
            self.move_list = []
            
            board = game.board()
            self.board_states.append(board.fen())
            
            progress = QProgressDialog(self.translate("moves_processed"), 
                                     self.translate("cancel"), 
                                     0, len(list(game.mainline_moves())), 
                                     self)
            progress.setWindowModality(Qt.WindowModal)
            progress.setAutoClose(True)
            progress.setAutoReset(True)
            
            move_count = 0
            for move in game.mainline_moves():
                try:
                    if board.is_legal(move):
                        san_move = board.san(move)
                        board.push(move)
                        self.board_states.append(board.fen())
                        self.move_list.append(san_move)
                        move_count += 1
                        progress.setValue(move_count)
                        progress.setLabelText(f"Processing move {move_count}/{len(list(game.mainline_moves()))}")
                        QApplication.processEvents()
                    else:
                        self.logger.warning(f"Illegal move skipped: {move.uci()} in {board.fen()}")
                except Exception as move_error:
                    self.logger.warning(f"Error processing move {move.uci()}: {str(move_error)}")
                    continue
            
            progress.close()
            self.current_move_index = 0
            self.show_current_board()
        except Exception as e:
            self.logger.error(f"Error parsing PGN: {str(e)}")
            QMessageBox.critical(self, self.translate("error"), 
                               f"{self.translate('pgn_parsing_error')}:\n{str(e)}")
    
    def show_current_board(self):
        if not self.board_states:
            return
        try:
            size = min(self.board_widget.width(), self.board_widget.height())
            board = chess.Board(self.board_states[self.current_move_index])
            svg_data = chess.svg.board(board=board, size=size)
            self.board_widget.load(svg_data.encode('utf-8'))
            
            self.btn_first.setEnabled(self.current_move_index > 0)
            self.btn_prev.setEnabled(self.current_move_index > 0)
            self.btn_next.setEnabled(self.current_move_index < len(self.board_states) - 1)
            self.btn_last.setEnabled(self.current_move_index < len(self.board_states) - 1)
        except Exception as e:
            self.logger.error(f"Error showing current board: {str(e)}")
            QMessageBox.critical(self, self.translate("error"), 
                               f"{self.translate('unexpected_error')}:\n{str(e)}")
    
    def first_move(self):
        if self.board_states:
            self.current_move_index = 0
            self.show_current_board()
    
    def prev_move(self):
        if self.current_move_index > 0:
            self.current_move_index -= 1
            self.show_current_board()
    
    def next_move(self):
        if self.current_move_index < len(self.board_states) - 1:
            self.current_move_index += 1
            self.show_current_board()
    
    def last_move(self):
        if self.board_states:
            self.current_move_index = len(self.board_states) - 1
            self.show_current_board()

    def analyze_game(self):
        if not self.board_states:
            QMessageBox.warning(self, self.translate("warning"), 
                              self.translate("load_pgn_first"))
            return

        try:
            self.analysis_data = []
            overflow_occurred = False
            overflow_move = 0

            game = chess.pgn.read_game(StringIO(self.pgn_text))
            result_str = game.headers.get("Result", "*") if game else "*"
            result_map = {"1-0": 1.0, "0-1": 0.0, "1/2-1/2": 0.5}
            game_result = result_map.get(result_str, None)

            progress = QProgressDialog(self.translate("status_processing"), 
                                     self.translate("cancel"), 
                                     0, len(self.board_states), 
                                     self)
            progress.setWindowModality(Qt.WindowModal)
            progress.setAutoClose(True)
            progress.setAutoReset(True)
            
            for i, fen in enumerate(self.board_states):
                if progress.wasCanceled():
                    break
                
                progress.setValue(i)
                progress.setLabelText(f"Analyzing position {i+1}/{len(self.board_states)}")
                QApplication.processEvents()
                
                try:
                    board = chess.Board(fen)
                    position_value = self.calculate_position_value(board)
                    exact_value = self.calculate_exact_value(board)
                    
                    if not isfinite(position_value):
                        overflow_occurred = True
                        overflow_move = i
                        break
                    
                    sf_analysis = None
                    
                    metadata = {
                        'move_index': i, 
                        'game_result': game_result,
                        'value_s': str(exact_value)
                    }
                    s_hash, is_new = self.position_db.save_position(exact_value, fen, metadata, sf_analysis)
                    
                    if i > 0:
                        prev_board = chess.Board(self.board_states[i-1])
                        for move in prev_board.legal_moves:
                            prev_board_copy = prev_board.copy()
                            prev_board_copy.push(move)
                            if prev_board_copy.fen() == board.fen():
                                self.position_db.save_transition(
                                    self.calculate_exact_value(prev_board), 
                                    exact_value, 
                                    move.uci(), 
                                    game_result
                                )
                                break
                    
                    prev_value = self.analysis_data[i-1]['value'] if i > 0 else None
                    diff = position_value - prev_value if prev_value is not None else None
                    ratio = position_value / prev_value if prev_value is not None and prev_value != 0 else None
                    
                    vc_vp_products = []
                    for square in chess.SQUARES:
                        piece = board.piece_at(square)
                        if piece is not None:
                            square_name = chess.square_name(square)
                            casilla_valor = self.mapeo_casillas.get(square_name, 1)
                            pieza_valor = self.valores_piezas.get(piece.symbol(), 1)
                            vc_vp_products.append(f"{casilla_valor}^{pieza_valor}")
                    
                    self.analysis_data.append({
                        'move': i,
                        'fen': fen,
                        'value': position_value,
                        'exact_value': exact_value,
                        'diff': diff,
                        'ratio': ratio,
                        'vc_vp_products': vc_vp_products,
                        'move_text': self.get_move_text(i),
                        'sf_best': None,
                        'sf_score': None,
                    })
                    
                except Exception as e:
                    self.logger.error(f"Error analyzing move {i}: {str(e)}")
                    continue

            progress.close()
            
            if overflow_occurred:
                QMessageBox.warning(self, self.translate("warning"),
                                  f"{self.translate('overflow_warning')} {overflow_move}")
                self.analysis_data = self.analysis_data[:overflow_move]

            self.btn_values.setEnabled(True)
            self.btn_export.setEnabled(True)
            self.btn_open_graph_viewer.setEnabled(True)
            
            self.add_g_values_to_pgn()
            
            stats = self.position_db.get_statistics()
            QMessageBox.information(self, self.translate("information"),
                                  f"{self.translate('game_analyzed')}\n\n"
                                  f"Database: {stats['total_positions']} unique positions, "
                                  f"{stats['total_occurrences']} total occurrences")

        except Exception as e:
            self.logger.error(f"Error analyzing game: {str(e)}")
            QMessageBox.critical(self, self.translate("error"),
                               f"{self.translate('analysis_error')}:\n{str(e)}")
    
    def add_g_values_to_pgn(self):
        if not self.analysis_data:
            return
        try:
            g_text = "\n\nGodel Values:\n"
            for data in self.analysis_data:
                value_sci = f"{data['value']:.4e}" if isfinite(data['value']) else "Overflow"
                g_text += f"G({data['move']}) = {value_sci}"
                if data.get('sf_best'):
                    g_text += f" | SF: {data['sf_best']}"
                g_text += "\n"
            self.pgn_textedit.setPlainText(self.pgn_text + g_text)
        except Exception as e:
            self.logger.error(f"Error adding G values to PGN: {str(e)}")

    def calculate_exact_value(self, board):
        try:
            exact_value = 1
            for square in chess.SQUARES:
                piece = board.piece_at(square)
                if piece is not None:
                    square_name = chess.square_name(square)
                    casilla_valor = self.mapeo_casillas.get(square_name, 1)
                    pieza_valor = self.valores_piezas.get(piece.symbol(), 1)
                    exact_value *= (casilla_valor ** pieza_valor)
            return exact_value
        except Exception as e:
            self.logger.error(f"Error calculating exact value: {str(e)}")
            return float('inf')

    def get_move_text(self, move_index):
        if move_index == 0:
            return self.translate("initial_position")
        elif move_index <= len(self.move_list):
            return self.move_list[move_index-1]
        return "N/A"

    def calculate_position_value(self, board):
        try:
            log_total = 0.0
            MAX_LOG_VALUE = 300
            
            for square in chess.SQUARES:
                piece = board.piece_at(square)
                if piece is not None:
                    square_name = chess.square_name(square)
                    casilla_valor = self.mapeo_casillas.get(square_name, 1)
                    pieza_valor = self.valores_piezas.get(piece.symbol(), 1)
                    term = pieza_valor * log10(casilla_valor)
                    if abs(log_total + term) > MAX_LOG_VALUE:
                        return float('inf')
                    log_total += term
                    if not isfinite(log_total):
                        return float('inf')
            
            return 10 ** log_total if isfinite(log_total) else float('inf')
        except Exception as e:
            self.logger.error(f"Error calculating position value: {str(e)}")
            return float('inf')

    def show_values_table(self):
        if not self.analysis_data:
            QMessageBox.warning(self, self.translate("warning"), 
                              self.translate("load_pgn_first"))
            return
            
        try:
            dialog = QDialog(self)
            dialog.setWindowTitle(self.translate("values_title"))
            dialog.setWindowState(Qt.WindowMaximized)
            
            layout = QVBoxLayout(dialog)
            layout.setContentsMargins(5, 5, 5, 5)
            
            view_mode_group = QGroupBox(self.translate("show"))
            view_mode_layout = QVBoxLayout()
            
            self.view_mode_combo = QComboBox()
            self.view_mode_combo.addItem(self.translate("all_data"), "all_data")
            self.view_mode_combo.addItem(self.translate("value_only"), "value_only")
            self.view_mode_combo.addItem(self.translate("value_and_full"), "value_and_full")
            self.view_mode_combo.addItem(self.translate("fen_only"), "fen_only")
            self.view_mode_combo.addItem(self.translate("ratio_only"), "ratio_only")
            self.view_mode_combo.addItem(self.translate("diff_only"), "diff_only")
            
            view_mode_layout.addWidget(self.view_mode_combo)
            view_mode_group.setLayout(view_mode_layout)
            layout.addWidget(view_mode_group)
            
            self.values_table = QTableWidget()
            self.values_table.setEditTriggers(QTableWidget.NoEditTriggers)
            self.values_table.setSelectionBehavior(QTableWidget.SelectRows)
            self.values_table.setSelectionMode(QTableWidget.SingleSelection)
            self.values_table.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOn)
            self.values_table.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOn)
            self.values_table.setSizeAdjustPolicy(QTableWidget.AdjustToContents)
            
            self.view_mode_combo.currentTextChanged.connect(self.update_table_view)
            
            scroll_area = QScrollArea()
            scroll_area.setWidgetResizable(True)
            scroll_area.setWidget(self.values_table)
            
            layout.addWidget(scroll_area)
            
            close_button = QPushButton(self.translate("close"))
            close_button.clicked.connect(dialog.accept)
            layout.addWidget(close_button, 0, Qt.AlignLeft)
            
            self.update_table_view()
            dialog.exec_()
            
        except Exception as e:
            self.logger.error(f"Error showing values table: {str(e)}")
            QMessageBox.critical(self, self.translate("error_showing_values"),
                               f"{self.translate('error_creating_table')}:\n{str(e)}")

    def update_table_view(self):
        if not self.analysis_data:
            return
            
        try:
            view_mode = self.view_mode_combo.currentData()
            
            if view_mode == "all_data":
                headers = [
                    self.translate("move_number"),
                    self.translate("move"),
                    "VPo(k)",
                    self.translate("exact_value"),
                    self.translate("factors"),
                    "D(k)",
                    "R(k)",
                    "FEN",
                    "SF Best",
                    "SF Score"
                ]
                column_count = 10
            elif view_mode == "value_only":
                headers = [
                    self.translate("move_number"),
                    self.translate("move"),
                    "VPo(k)",
                    self.translate("factors")
                ]
                column_count = 4
            elif view_mode == "value_and_full":
                headers = [
                    self.translate("move_number"),
                    self.translate("move"),
                    "VPo(k)",
                    self.translate("exact_value")
                ]
                column_count = 4
            elif view_mode == "fen_only":
                headers = [
                    self.translate("move_number"),
                    self.translate("move"),
                    "FEN"
                ]
                column_count = 3
            elif view_mode == "ratio_only":
                headers = [
                    self.translate("move_number"),
                    self.translate("move"),
                    "R(k)"
                ]
                column_count = 3
            elif view_mode == "diff_only":
                headers = [
                    self.translate("move_number"),
                    self.translate("move"),
                    "D(k)"
                ]
                column_count = 3
            else:
                return
                
            self.values_table.clear()
            self.values_table.setColumnCount(column_count)
            self.values_table.setHorizontalHeaderLabels(headers)
            self.values_table.setRowCount(len(self.analysis_data))
            
            for i, data in enumerate(self.analysis_data):
                move_num_item = QTableWidgetItem(str(data['move']))
                move_num_item.setTextAlignment(Qt.AlignCenter)
                self.values_table.setItem(i, 0, move_num_item)
                
                move_item = QTableWidgetItem(data['move_text'])
                self.values_table.setItem(i, 1, move_item)
                
                if view_mode in ["all_data", "value_only", "value_and_full"]:
                    value_sci = f"{data['value']:.4e}" if isfinite(data['value']) else "Overflow"
                    value_sci_item = QTableWidgetItem(value_sci)
                    value_sci_item.setTextAlignment(Qt.AlignLeft)
                    self.values_table.setItem(i, 2, value_sci_item)
                
                if view_mode == "all_data":
                    exact_value = str(data['exact_value']) if isfinite(data['value']) else "Overflow"
                    exact_item = QTableWidgetItem(exact_value)
                    exact_item.setTextAlignment(Qt.AlignLeft)
                    self.values_table.setItem(i, 3, exact_item)
                    
                    vc_vp_text = " x ".join(data['vc_vp_products']) if data['vc_vp_products'] else "N/A"
                    vc_vp_item = QTableWidgetItem(vc_vp_text)
                    vc_vp_item.setTextAlignment(Qt.AlignLeft)
                    self.values_table.setItem(i, 4, vc_vp_item)
                    
                    if i > 0:
                        diff_text = f"{data['diff']:.4g}" if data['diff'] is not None else "N/A"
                    else:
                        diff_text = "N/A"
                    diff_item = QTableWidgetItem(diff_text)
                    diff_item.setTextAlignment(Qt.AlignLeft)
                    self.values_table.setItem(i, 5, diff_item)
                    
                    if i > 0:
                        ratio_text = f"{data['ratio']:.4g}" if data['ratio'] is not None else "N/A"
                    else:
                        ratio_text = "N/A"
                    ratio_item = QTableWidgetItem(ratio_text)
                    ratio_item.setTextAlignment(Qt.AlignLeft)
                    self.values_table.setItem(i, 6, ratio_item)
                    
                    fen_item = QTableWidgetItem(data['fen'])
                    fen_item.setTextAlignment(Qt.AlignLeft)
                    self.values_table.setItem(i, 7, fen_item)
                    
                    sf_best = data.get('sf_best', '—')
                    sf_item = QTableWidgetItem(sf_best if sf_best else '—')
                    sf_item.setTextAlignment(Qt.AlignCenter)
                    self.values_table.setItem(i, 8, sf_item)
                    
                    sf_score = data.get('sf_score', '')
                    score_item = QTableWidgetItem(str(sf_score) if sf_score is not None else '—')
                    score_item.setTextAlignment(Qt.AlignRight)
                    self.values_table.setItem(i, 9, score_item)
                
                elif view_mode == "value_only":
                    vc_vp_text = " x ".join(data['vc_vp_products']) if data['vc_vp_products'] else "N/A"
                    vc_vp_item = QTableWidgetItem(vc_vp_text)
                    vc_vp_item.setTextAlignment(Qt.AlignLeft)
                    self.values_table.setItem(i, 3, vc_vp_item)
                
                elif view_mode == "value_and_full":
                    exact_value = str(data['exact_value']) if isfinite(data['value']) else "Overflow"
                    exact_item = QTableWidgetItem(exact_value)
                    exact_item.setTextAlignment(Qt.AlignLeft)
                    self.values_table.setItem(i, 3, exact_item)
                
                elif view_mode == "fen_only":
                    fen_item = QTableWidgetItem(data['fen'])
                    fen_item.setTextAlignment(Qt.AlignLeft)
                    self.values_table.setItem(i, 2, fen_item)
                
                elif view_mode == "ratio_only":
                    if i > 0:
                        ratio_text = f"{data['ratio']:.4g}" if data['ratio'] is not None else "N/A"
                    else:
                        ratio_text = "N/A"
                    ratio_item = QTableWidgetItem(ratio_text)
                    ratio_item.setTextAlignment(Qt.AlignLeft)
                    self.values_table.setItem(i, 2, ratio_item)
                
                elif view_mode == "diff_only":
                    if i > 0:
                        diff_text = f"{data['diff']:.4g}" if data['diff'] is not None else "N/A"
                    else:
                        diff_text = "N/A"
                    diff_item = QTableWidgetItem(diff_text)
                    diff_item.setTextAlignment(Qt.AlignLeft)
                    self.values_table.setItem(i, 2, diff_item)
            
            self.values_table.resizeColumnsToContents()
            header = self.values_table.horizontalHeader()
            header.setSectionResizeMode(QHeaderView.Interactive)
            header.setStretchLastSection(True)
            self.values_table.resizeRowsToContents()
            
        except Exception as e:
            self.logger.error(f"Error updating table view: {str(e)}")
            QMessageBox.critical(self, self.translate("error_updating_view"),
                               f"{self.translate('error_updating_view')}:\n{str(e)}")

    def show_help(self):
        help_dialog = QMessageBox(self)
        help_dialog.setWindowTitle(self.translate("help_title"))
        help_dialog.setTextFormat(Qt.RichText)
        help_dialog.setText(self.translate("help_text"))
        help_dialog.setStandardButtons(QMessageBox.Ok)
        help_dialog.exec_()

    def export_to_docx(self):
        if not self.analysis_data or not self.current_pgn_path:
            QMessageBox.warning(self, self.translate("warning"), 
                              self.translate("load_pgn_first"))
            return
            
        try:
            progress = QProgressDialog(self.translate("exporting_document"), 
                                     self.translate("cancel"), 
                                     0, 100, self)
            progress.setWindowModality(Qt.WindowModal)
            progress.setAutoClose(True)
            progress.setAutoReset(True)
            progress.show()
            
            progress.setLabelText(self.translate("adding_title_info"))
            progress.setValue(10)
            QApplication.processEvents()
            
            base_dir = get_base_dir()
            data_dir = os.path.join(base_dir, "data")
            os.makedirs(data_dir, exist_ok=True)
            
            pgn_name = os.path.splitext(os.path.basename(self.current_pgn_path))[0]
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            file_name = os.path.join(data_dir, f"{pgn_name}_{timestamp}.docx")
            
            doc = Document()
            style = doc.styles['Normal']
            font = style.font
            font.name = 'Arial'
            font.size = Pt(10)
            
            title = doc.add_heading(self.translate("position_value"), level=1)
            title.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
            
            game = chess.pgn.read_game(StringIO(self.pgn_text))
            if game:
                p = doc.add_paragraph()
                p.add_run(f"{self.translate('event')}: ").bold = True
                p.add_run(game.headers.get("Event", "?"))
                
                p = doc.add_paragraph()
                p.add_run(f"{self.translate('white')}: ").bold = True
                p.add_run(game.headers.get("White", "?"))
                
                p = doc.add_paragraph()
                p.add_run(f"{self.translate('black')}: ").bold = True
                p.add_run(game.headers.get("Black", "?"))
                
                p = doc.add_paragraph()
                p.add_run(f"{self.translate('date')}: ").bold = True
                p.add_run(game.headers.get("Date", "?"))
                
                p = doc.add_paragraph()
                p.add_run(f"{self.translate('result')}: ").bold = True
                p.add_run(game.headers.get("Result", "?"))
            
            doc.add_paragraph()
            doc.add_heading(self.translate("pgn_original"), level=2)
            doc.add_paragraph(self.pgn_text)
            
            progress.setLabelText(self.translate("adding_analysis_data"))
            progress.setValue(30)
            QApplication.processEvents()
            
            doc.add_page_break()
            doc.add_heading("Godel Values", level=2)
            
            for data in self.analysis_data:
                value_sci = f"{data['value']:.4e}" if isfinite(data['value']) else "Overflow"
                doc.add_paragraph(f"G({data['move']}) = {value_sci}")
            
            progress.setLabelText(self.translate("generating_graphs"))
            progress.setValue(40)
            QApplication.processEvents()
            
            doc.add_page_break()
            doc.add_heading(self.translate("visualization_label"), level=2)
            
            for i, graph_type in enumerate(['position', 'diff', 'ratio']):
                progress.setLabelText(f"{self.translate('generating_graphs')} ({graph_type})")
                progress.setValue(50 + i*15)
                QApplication.processEvents()
                
                segments = self.create_segmented_graph_images(graph_type, moves_per_segment=20)
                
                doc.add_heading(f"{self.translate('graphs_of')} {graph_type}", level=3)
                
                for j, buf in enumerate(segments):
                    doc.add_heading(f"{self.translate('segment')} {j+1}", level=4)
                    doc.add_picture(buf, width=Inches(6))
                    doc.add_paragraph()
            
            progress.setLabelText(self.translate("saving_document"))
            progress.setValue(100)
            QApplication.processEvents()
            
            doc.save(file_name)
            
            if not progress.wasCanceled():
                QMessageBox.information(self, self.translate("information"),
                                      f"{self.translate('export_success')}\n{file_name}")
            
        except Exception as e:
            self.logger.error(f"Error exporting to DOCX: {str(e)}")
            QMessageBox.critical(self, self.translate("error"),
                               f"{self.translate('document_export_failed')}:\n{str(e)}")

    def create_segmented_graph_images(self, graph_type, moves_per_segment=20):
        if not self.analysis_data:
            return []
        
        try:
            moves = [data['move'] for data in self.analysis_data]
            total_moves = len(moves)
            segments = []
        
            if graph_type == 'position':
                all_values = [data['value'] for data in self.analysis_data]
            elif graph_type == 'diff':
                all_values = [data['diff'] if data['diff'] is not None else 0 for data in self.analysis_data]
            elif graph_type == 'ratio':
                all_values = [data['ratio'] if data['ratio'] is not None else 1 for data in self.analysis_data]
            else:
                 return []
            
            safe_mode = self.graph_settings[graph_type].get('safe_mode', True)
            if safe_mode:
                all_values = [log10(abs(v)) if v != 0 and isfinite(v) else 0 for v in all_values]
            
            valid_values = [v for v in all_values if isfinite(v)]
            global_min_y = min(valid_values) if valid_values else 0
            global_max_y = max(valid_values) if valid_values else 1
        
            y_range = global_max_y - global_min_y
            padding = y_range * 0.1 if y_range > 0 else 1
            global_min_y -= padding
            global_max_y += padding
        
            for start in range(0, total_moves, moves_per_segment):
                end = min(start + moves_per_segment, total_moves)
                segment_moves = moves[start:end]
            
                fig = plt.figure(figsize=(10, 6))
                ax = fig.add_subplot(111)
            
                if graph_type == 'position':
                    values = [data['value'] for data in self.analysis_data[start:end]]
                    title = f"VPo(k) = ∏(Vc^Vp) ({self.translate('moves')} {start}-{end-1})"
                    ylabel = "VPo(k)"
                    point_labels = [f"Po({k})" for k in segment_moves]
                elif graph_type == 'diff':
                    values = [data['diff'] if data['diff'] is not None else 0 for data in self.analysis_data[start:end]]
                    title = f"D(k) = VPo(k) - VPo(k-1) ({self.translate('moves')} {start}-{end-1})"
                    ylabel = "D(k)"
                    point_labels = [f"D({k})" if k > 0 else "N/A" for k in segment_moves]
                elif graph_type == 'ratio':
                    values = [data['ratio'] if data['ratio'] is not None else 1 for data in self.analysis_data[start:end]]
                    title = f"R(k) = VPo(k) / VPo(k-1) ({self.translate('moves')} {start}-{end-1})"
                    ylabel = "R(k)"
                    point_labels = [f"R({k})" if k > 0 else "N/A" for k in segment_moves]
                else:
                    plt.close(fig)
                    continue
            
                if safe_mode:
                    values = [log10(abs(v)) if v != 0 and isfinite(v) else 0 for v in values]
                    ylabel = f"log10({ylabel})" if graph_type != 'ratio' else f"log10({ylabel})"
            
                graph_type_style = self.graph_settings[graph_type].get('type', 'line')
            
                if graph_type_style == 'line':
                    if len(segment_moves) > 3:
                        x_new = np.linspace(min(segment_moves), max(segment_moves), 300)
                        spl = make_interp_spline(segment_moves, values, k=3)
                        y_smooth = spl(x_new)
                        ax.plot(x_new, y_smooth, '-', linewidth=2, color='blue')
                
                    ax.plot(segment_moves, values, 'o', markersize=6, alpha=0.7, color='red')
                
                    for x, y, label in zip(segment_moves, values, point_labels):
                        ax.text(x, y, label, fontsize=8, ha='center', va='bottom', 
                               bbox=dict(facecolor='white', alpha=0.7, edgecolor='none'),
                               rotation=45)
            
                elif graph_type_style == 'scatter':
                    ax.scatter(segment_moves, values, s=40, alpha=0.7, color='red')
                
                    for x, y, label in zip(segment_moves, values, point_labels):
                        ax.text(x, y, label, fontsize=8, ha='center', va='bottom', 
                               bbox=dict(facecolor='white', alpha=0.7, edgecolor='none'),
                               rotation=45)
            
                elif graph_type_style == 'bar':
                    bars = ax.bar(segment_moves, values, width=0.6, alpha=0.7, color='red')
                
                    for i, bar in enumerate(bars):
                        height = bar.get_height()
                        ax.text(bar.get_x() + bar.get_width()/2., height,
                                point_labels[i], ha='center', va='bottom', fontsize=8,
                                bbox=dict(facecolor='white', alpha=0.7, edgecolor='none'),
                                rotation=45)
            
                ax.set_title(title, fontsize=10, pad=10)
                ax.set_xlabel(self.translate("move_number"), fontsize=9)
                ax.set_ylabel(ylabel, fontsize=9)
                ax.set_xticks(segment_moves)
                ax.tick_params(axis='y', labelrotation=30)
                ax.tick_params(axis='x', rotation=45)
                ax.grid(True, linestyle='--', alpha=0.4)
            
                ax.set_ylim(global_min_y, global_max_y)
            
                if not safe_mode:
                    formatter = ScalarFormatter(useMathText=True)
                    formatter.set_powerlimits((-3, 4))
                    ax.yaxis.set_major_formatter(formatter)
            
                fig.tight_layout()
            
                buf = BytesIO()
                fig.savefig(buf, format='png', dpi=300, bbox_inches='tight')
                buf.seek(0)
                plt.close(fig)
            
                segments.append(buf)
        
            return segments
        
        except Exception as e:
            self.logger.error(f"Error creating segmented graph images: {str(e)}")
            return []

    def show_formula_analysis(self):
        if not self.board_states:
            QMessageBox.warning(self, self.translate("warning"), 
                              self.translate("load_pgn_first"))
            return
            
        try:
            current_fen = self.board_states[self.current_move_index]
            board = chess.Board(current_fen)
            
            dialog = QDialog(self)
            dialog.setWindowTitle(self.translate("jadidi_formula_title"))
            dialog.setWindowState(Qt.WindowMaximized)
            
            layout = QVBoxLayout(dialog)
            layout.setContentsMargins(5, 5, 5, 5)
            
            current_info = QGroupBox(self.translate("current_position"))
            current_layout = QFormLayout()
            
            current_move_label = QLabel(f"{self.translate('move_number')}: {self.current_move_index}")
            current_fen_label = QLabel(f"FEN: {current_fen}")
            current_value_label = QLabel()
            
            current_value = self.calculate_position_value(board)
            current_exact = self.calculate_exact_value(board)
            
            current_value_label.setText(f"{self.translate('current_value')}: {current_value:.4e} ({self.translate('exact_value')}: {current_exact})")
            
            current_layout.addRow(current_move_label)
            current_layout.addRow(current_fen_label)
            current_layout.addRow(current_value_label)
            current_info.setLayout(current_layout)
            layout.addWidget(current_info)
            
            moves_group = QGroupBox(self.translate("legal_moves_values"))
            moves_layout = QVBoxLayout()
            
            self.moves_table = QTableWidget()
            self.moves_table.setEditTriggers(QTableWidget.NoEditTriggers)
            self.moves_table.setSelectionBehavior(QTableWidget.SelectRows)
            self.moves_table.setSelectionMode(QTableWidget.SingleSelection)
            self.moves_table.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOn)
            self.moves_table.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOn)
            self.moves_table.setSizeAdjustPolicy(QTableWidget.AdjustToContents)
            
            headers = [
                self.translate("move"),
                self.translate("notation"),
                self.translate("value"),
                self.translate("exact_value"),
                self.translate("difference"),
                self.translate("ratio"),
                self.translate("resulting_fen")
            ]
            self.moves_table.setColumnCount(len(headers))
            self.moves_table.setHorizontalHeaderLabels(headers)
            
            legal_moves = list(board.legal_moves)
            move_data = []
            
            for move in legal_moves:
                board_copy = board.copy()
                board_copy.push(move)
                
                move_value = self.calculate_position_value(board_copy)
                exact_value = self.calculate_exact_value(board_copy)
                difference = move_value - current_value
                ratio = move_value / current_value if current_value != 0 else float('inf')
                move_notation = board.san(move)
                
                move_data.append({
                    'move': move,
                    'notation': move_notation,
                    'value': move_value,
                    'exact_value': exact_value,
                    'difference': difference,
                    'ratio': ratio,
                    'fen': board_copy.fen()
                })
            
            move_data.sort(key=lambda x: x['value'], reverse=True)
            
            self.moves_table.setRowCount(len(move_data))
            
            for row, data in enumerate(move_data):
                move_item = QTableWidgetItem(data['move'].uci())
                self.moves_table.setItem(row, 0, move_item)
                
                notation_item = QTableWidgetItem(data['notation'])
                self.moves_table.setItem(row, 1, notation_item)
                
                value_item = QTableWidgetItem(f"{data['value']:.4e}")
                value_item.setTextAlignment(Qt.AlignLeft)
                self.moves_table.setItem(row, 2, value_item)
                
                exact_value_item = QTableWidgetItem(str(data['exact_value']))
                exact_value_item.setTextAlignment(Qt.AlignLeft)
                self.moves_table.setItem(row, 3, exact_value_item)
                
                diff_item = QTableWidgetItem(f"{data['difference']:.4e}")
                diff_item.setTextAlignment(Qt.AlignLeft)
                self.moves_table.setItem(row, 4, diff_item)
                
                ratio_item = QTableWidgetItem(f"{data['ratio']:.4f}")
                ratio_item.setTextAlignment(Qt.AlignLeft)
                self.moves_table.setItem(row, 5, ratio_item)
                
                fen_item = QTableWidgetItem(data['fen'])
                self.moves_table.setItem(row, 6, fen_item)
            
            moves_layout.addWidget(self.moves_table)
            moves_group.setLayout(moves_layout)
            layout.addWidget(moves_group)
            
            button_panel = QWidget()
            button_layout = QHBoxLayout(button_panel)
            
            btn_show_move = QPushButton(self.translate("visualize_move"))
            btn_show_move.setStyleSheet("background-color: #4CAF50; color: white;")
            
            btn_export_data = QPushButton(self.translate("export_data"))
            btn_export_data.setStyleSheet("background-color: #2196F3; color: white;")
            
            btn_close = QPushButton(self.translate("close"))
            btn_close.setStyleSheet("background-color: #F44336; color: white;")
            
            btn_show_move.clicked.connect(lambda: self.visualize_selected_move(dialog))
            btn_export_data.clicked.connect(lambda: self.export_move_data(move_data))
            btn_close.clicked.connect(dialog.accept)
            
            button_layout.addWidget(btn_show_move)
            button_layout.addWidget(btn_export_data)
            button_layout.addWidget(btn_close)
            
            layout.addWidget(button_panel)
            
            self.moves_table.resizeColumnsToContents()
            dialog.exec_()
            
        except Exception as e:
            self.logger.error(f"Error showing formula analysis: {str(e)}")
            QMessageBox.critical(self, self.translate("error"),
                               f"{self.translate('error_showing_formula')}:\n{str(e)}")

    def visualize_selected_move(self, dialog):
        try:
            selected_row = self.moves_table.currentRow()
            if selected_row >= 0:
                fen = self.moves_table.item(selected_row, 6).text()
                board = chess.Board(fen)
                
                move_dialog = QDialog(dialog)
                move_dialog.setWindowTitle(self.translate("move_visualization"))
                move_dialog.setFixedSize(500, 500)
                
                layout = QVBoxLayout(move_dialog)
                
                board_widget = QSvgWidget()
                board_widget.setFixedSize(400, 400)
                
                svg_data = chess.svg.board(board=board, size=400)
                board_widget.load(svg_data.encode('utf-8'))
                
                move_info = QLabel(
                    f"{self.translate('move')}: {self.moves_table.item(selected_row, 1).text()}\n"
                    f"{self.translate('value')}: {self.moves_table.item(selected_row, 2).text()}\n"
                    f"{self.translate('exact_value')}: {self.moves_table.item(selected_row, 3).text()}\n"
                    f"FEN: {fen}"
                )
                
                btn_close = QPushButton(self.translate("close"))
                btn_close.clicked.connect(move_dialog.accept)
                
                layout.addWidget(board_widget, 0, Qt.AlignCenter)
                layout.addWidget(move_info)
                layout.addWidget(btn_close, 0, Qt.AlignLeft)
                
                move_dialog.exec_()
            else:
                QMessageBox.warning(dialog, self.translate("warning"), self.translate("select_move_to_visualize"))
        except Exception as e:
            self.logger.error(f"Error visualizing move: {str(e)}")
            QMessageBox.critical(dialog, self.translate("error"), f"{self.translate('error_visualizing_move')}:\n{str(e)}")

    def export_move_data(self, move_data):
        try:
            options = QFileDialog.Options()
            file_name, _ = QFileDialog.getSaveFileName(
                self, self.translate("export_move_data"), "", 
                "CSV Files (*.csv);;Text Files (*.txt);;All Files (*)", options=options)
            
            if file_name:
                with open(file_name, 'w', encoding='utf-8') as f:
                    f.write(f"{self.translate('move')},{self.translate('notation')},{self.translate('value')},"
                           f"{self.translate('exact_value')},{self.translate('difference')},"
                           f"{self.translate('ratio')},{self.translate('resulting_fen')}\n")
                    
                    for data in move_data:
                        f.write(f"{data['move'].uci()},{data['notation']},{data['value']:.4e},"
                               f"{data['exact_value']},{data['difference']:.4e},"
                               f"{data['ratio']:.4f},\"{data['fen']}\"\n")
                
                QMessageBox.information(self, self.translate("success"), 
                                      f"{self.translate('data_exported_successfully')}:\n{file_name}")
        except Exception as e:
            self.logger.error(f"Error exporting move data: {str(e)}")
            QMessageBox.critical(self, self.translate("error"), f"{self.translate('error_exporting_data')}:\n{str(e)}")

    # ============================================================
    # TRADUCCIONES
    # ============================================================
    def english_translations(self):
        return {
        "window_title": "Chess Godel Analyzer - Version 3.0",
        "load_pgn": "Load PGN",
        "analyze_game": "Analyze Game",
        "detailed_values": "Detailed Values",
        "export_docx": "Export to DOCX",
        "pgn_placeholder": "PGN Game will appear here...",
        "initial_position": "Initial position",
        "file_load_error": "Could not read file",
        "invalid_pgn": "Invalid PGN format",
        "analysis_error": "Analysis error",
        "export_error": "Export error",
        "export_success": "Document exported successfully",
        "load_pgn_first": "Please load a PGN file first",
        "position_value": "Position Value",
        "position_values": "Position Values",
        "move_number": "#Play",
        "value": "Value",
        "help_title": "Help",
        "help_text": """<h2>Chess Godel Analyzer Help</h2>
        <p>1. Load a PGN file using the 'Load PGN' button</p>
        <p>2. The chessboard will automatically show the game</p>
        <p>3. Use the navigation buttons to move through the game</p>
        <p>4. Click 'Analyze' to generate the position value graph</p>
        <p>5. The graph will be displayed in the graph viewer</p>
        <p>6. Use 'Search Positions' to query the database</p>
        <p>7. 'DB Stats' shows database statistics</p>
        <p>8. 'Next Plays' analyzes possible moves from current position</p>
        <p>9. 'Neural Network' for deep learning analysis</p>""",
        "close": "Close",
        "values_title": "Detailed Values",
        "move": "Half move",
        "fen": "FEN",
        "vpo": "Value",
        "language": "Language",
        "current_position": "Current Position",
        "previous_move": "Previous",
        "next_move": "Next",
        "graph_options": "Graph Options",
        "graph_type_label": "Graph type:",
        "line": "Line",
        "scatter": "Scatter",
        "bar": "Bar",
        "safe_mode": "Safe mode (prevents overflow)",
        "apply_settings": "Apply Settings",
        "exact_value": "Exact Value (Vc^Vp product)",
        "factors": "Factors (Vc^Vp)",
        "difference": "D(k)",
        "ratio": "R(k)",
        "show": "Show:",
        "all_data": "1. All data",
        "value_only": "2. Position value as prime factors product",
        "value_and_full": "3. Position value and full value",
        "fen_only": "4. FEN only",
        "ratio_only": "5. R(k)=VPo(k)/VPo(k-1) values",
        "diff_only": "6. D(k)=VPo(k)-VPo(k-1) values",
        "status_waiting": "Status: Waiting for PGN input",
        "status_ready": "Status: Ready to analyze",
        "status_completed": "Status: Analysis completed",
        "visualization_label": "Visualization",
        "pgn_label": "PGN Game:",
        "analysis_problems": "Analysis problems found in PGN",
        "document_export_failed": "Document export failed",
        "file_loaded": "File loaded:",
        "overflow_warning": "Value overflow at move",
        "game_analyzed": "Game analyzed",
        "event": "Event",
        "white": "White",
        "black": "Black",
        "date": "Date",
        "result": "Result",
        "moves_processed": "Plays processed",
        "pgn_parsing_error": "PGN parsing error",
        "unexpected_error": "Unexpected error",
        "error_showing_values": "Error showing values table",
        "error_creating_table": "Error creating table",
        "error_updating_view": "Error updating table view",
        "error_changing_language": "Error changing language",
        "error_updating_ui": "Error updating UI language",
        "critical_error": "Critical Error",
        "app_failed": "Application failed to start",
        "fatal_error": "Fatal error",
        "board_size": "Board size:",
        "small": "Small",
        "medium": "Medium",
        "large": "Large",
        "help": "Help",
        "close": "Close",
        "pgn_original": "Original PGN:",
        "moves": "Half move",
        "open_position_editor": "Open Position Editor",
        "fen_placeholder": "FEN of the position will appear here...",
        "load_position": "Load Position",
        "edit_position": "Edit Position",
        "error_opening_editor": "Error opening position editor",
        "invalid_fen": "Invalid FEN",
        "jadidi_formula_title": "Next Plays - Current Position Analysis",
        "current_value": "Current value",
        "legal_moves_values": "Legal Moves and Their Values",
        "notation": "Notation",
        "resulting_fen": "Resulting FEN",
        "visualize_move": "Visualize Move",
        "export_data": "Export Data",
        "move_visualization": "Move Visualization",
        "select_move_to_visualize": "Please select a move to visualize",
        "error_visualizing_move": "Error visualizing move",
        "error_showing_formula": "Error showing formula analysis",
        "export_move_data": "Export Move Data",
        "success": "Success",
        "data_exported_successfully": "Data exported successfully",
        "error_exporting_data": "Error exporting data",
        "graphs_of": "Graphs of",
        "segment": "Segment",
        "variation": "Variation",
        "undo_move": "Undo Move",
        "exporting_document": "Exporting document...",
        "adding_title_info": "Adding title and game info...",
        "generating_graphs": "Generating graphs...",
        "adding_analysis_data": "Adding analysis data...",
        "saving_document": "Saving document...",
        "error_opening_graph_viewer": "Error opening graph viewer",
        "pgn_analysis": "PGN Analysis",
        "graph_viewer_title": "Graph Viewer",
        "open_graph_viewer": "Open Graph Viewer",
        "position_loaded_successfully": "Position loaded successfully",
        "search_positions": "Search Positions",
        "db_stats": "DB Stats",
        "neural_network": "Neural Network",
        "next_plays": "Next Plays"
        }
    
    def spanish_translations(self):
        return {
        "window_title": "Analizador Godel de Ajedrez - Version 3.0",
        "load_pgn": "Cargar PGN",
        "analyze_game": "Analizar Partida",
        "detailed_values": "Valores Detallados",
        "export_docx": "Exportar a DOCX",
        "pgn_placeholder": "La partida PGN aparecera aqui...",
        "initial_position": "Posicion inicial",
        "file_load_error": "No se pudo leer el archivo",
        "invalid_pgn": "Formato PGN invalido",
        "analysis_error": "Error de analisis",
        "export_error": "Error de exportacion",
        "export_success": "Documento exportado con exito",
        "load_pgn_first": "Por favor cargue un archivo PGN primero",
        "position_value": "Valor de Posicion",
        "position_values": "Valores de Posicion",
        "move_number": "#Play",
        "value": "Valor",
        "help_title": "Ayuda",
        "help_text": """<h2>Ayuda del Analizador Godel de Ajedrez</h2>
        <p>1. Cargue un archivo PGN usando el boton 'Cargar PGN'</p>
        <p>2. El tablero mostrara automaticamente la partida</p>
        <p>3. Use los botones de navegacion para moverse por la partida</p>
        <p>4. Haga clic en 'Analizar' para generar el grafico de valores</p>
        <p>5. El grafico se mostrara en el visor de graficos</p>
        <p>6. Use 'Buscar Posiciones' para consultar la base de datos</p>
        <p>7. 'Estadisticas BD' muestra estadisticas de la base de datos</p>
        <p>8. 'Siguientes Jugadas' analiza movimientos desde la posicion actual</p>
        <p>9. 'Red Neuronal' para analisis de aprendizaje profundo</p>""",
        "close": "Cerrar",
        "values_title": "Valores Detallados",
        "move": "Play",
        "fen": "FEN",
        "vpo": "Valor",
        "language": "Idioma",
        "current_position": "Posicion Actual",
        "previous_move": "Anterior",
        "next_move": "Siguiente",
        "graph_options": "Opciones de Grafico",
        "graph_type_label": "Tipo de grafico:",
        "line": "Linea",
        "scatter": "Dispersion",
        "bar": "Barras",
        "safe_mode": "Modo seguro (evita overflow)",
        "apply_settings": "Aplicar Configuracion",
        "exact_value": "Valor Exacto (producto Vc^Vp)",
        "factors": "Factores (Vc^Vp)",
        "difference": "D(k)",
        "ratio": "R(k)",
        "show": "Mostrar:",
        "all_data": "1. Todos los datos",
        "value_only": "2. Solo valor de posicion como producto de factores primos",
        "value_and_full": "3. Valor de posicion y valor completo",
        "fen_only": "4. Solo FEN",
        "ratio_only": "5. Valores R(k)=VPo(k)/VPo(k-1)",
        "diff_only": "6. Valores D(k)=VPo(k)-VPo(k-1)",
        "status_waiting": "Estado: Esperando entrada de PGN",
        "status_ready": "Estado: Listo para analizar",
        "status_completed": "Estado: Analisis completado",
        "visualization_label": "Visualizacion",
        "pgn_label": "Partida PGN:",
        "analysis_problems": "Se encontraron problemas en el PGN",
        "document_export_failed": "Error al exportar documento",
        "file_loaded": "Archivo cargado:",
        "overflow_warning": "Overflow de valor en movimiento",
        "game_analyzed": "Partida analizada",
        "event": "Evento",
        "white": "Blancas",
        "black": "Negras",
        "date": "Fecha",
        "result": "Resultado",
        "moves_processed": "Jugadas procesadas",
        "pgn_parsing_error": "Error al analizar PGN",
        "unexpected_error": "Error inesperado",
        "error_showing_values": "Error al mostrar tabla de valores",
        "error_creating_table": "Error al crear tabla",
        "error_updating_view": "Error al actualizar vista",
        "error_changing_language": "Error al cambiar idioma",
        "error_updating_ui": "Error al actualizar interfaz",
        "critical_error": "Error Critico",
        "app_failed": "La aplicacion no pudo iniciarse",
        "fatal_error": "Error fatal",
        "board_size": "Tamaño del tablero:",
        "small": "Pequeño",
        "medium": "Mediano",
        "large": "Grande",
        "help": "Ayuda",
        "close": "Cerrar",
        "pgn_original": "PGN Original:",
        "moves": "Plays",
        "open_position_editor": "Abrir Editor de Posicion",
        "fen_placeholder": "FEN de la posicion aparecera aqui...",
        "load_position": "Cargar Posicion",
        "edit_position": "Editar Posicion",
        "error_opening_editor": "Error al abrir el editor de posicion",
        "invalid_fen": "FEN invalido",
        "jadidi_formula_title": "Siguientes Jugadas - Analisis de Posicion Actual",
        "current_value": "Valor actual",
        "legal_moves_values": "Movimientos Legales y sus Valores",
        "notation": "Notacion",
        "resulting_fen": "FEN Resultante",
        "visualize_move": "Visualizar Movimiento",
        "export_data": "Exportar Datos",
        "move_visualization": "Visualizacion de Movimiento",
        "select_move_to_visualize": "Por favor seleccione un movimiento para visualizar",
        "error_visualizing_move": "Error al visualizar el movimiento",
        "error_showing_formula": "Error al mostrar el analisis de formula",
        "export_move_data": "Exportar Datos de Movimientos",
        "success": "Exito",
        "data_exported_successfully": "Datos exportados correctamente",
        "error_exporting_data": "Error al exportar los datos",
        "graphs_of": "Graficos de",
        "segment": "Segmento",
        "variation": "Variacion",
        "undo_move": "Deshacer Movimiento",
        "exporting_document": "Exportando documento...",
        "adding_title_info": "Añadiendo titulo e informacion del juego...",
        "generating_graphs": "Generando graficos...",
        "adding_analysis_data": "Añadiendo datos de analisis...",
        "saving_document": "Guardando documento...",
        "error_opening_graph_viewer": "Error al abrir el visor de graficos",
        "pgn_analysis": "Analisis PGN",
        "graph_viewer_title": "Visor de Graficos",
        "open_graph_viewer": "Abrir Visor de Graficos",
        "position_loaded_successfully": "Posicion cargada exitosamente",
        "search_positions": "Buscar Posiciones",
        "db_stats": "Estadisticas BD",
        "neural_network": "Red Neuronal",
        "next_plays": "Siguientes Jugadas"
        }
    
    def german_translations(self):
        return {
        "window_title": "Schach Godel Analyzer - Version 3.0",
        "load_pgn": "PGN laden",
        "analyze_game": "Partie analysieren",
        "detailed_values": "Detaillierte Werte",
        "export_docx": "Als DOCX exportieren",
        "pgn_placeholder": "PGN-Spiel wird hier angezeigt...",
        "initial_position": "Anfangsposition",
        "file_load_error": "Datei konnte nicht gelesen werden",
        "invalid_pgn": "Ungultiges PGN-Format",
        "analysis_error": "Analysefehler",
        "export_error": "Exportfehler",
        "export_success": "Dokument erfolgreich exportiert",
        "load_pgn_first": "Bitte zuerst eine PGN-Datei laden",
        "position_value": "Positionswert",
        "position_values": "Positionswerte",
        "move_number": "#Play",
        "value": "Wert",
        "help_title": "Hilfe",
        "help_text": """<h2>Hilfe fur Schach Godel Analyzer</h2>
        <p>1. Laden Sie eine PGN-Datei mit dem 'PGN laden'-Button</p>
        <p>2. Das Schachbrett zeigt automatisch das Spiel an</p>
        <p>3. Verwenden Sie die Navigationsbuttons zum Blattern</p>
        <p>4. Klicken Sie auf 'Analyse' fur das Werte-Diagramm</p>
        <p>5. Das Diagramm wird im Diagramm-Viewer angezeigt</p>
        <p>6. Verwenden Sie 'Positionen Suchen' fur Datenbankabfragen</p>
        <p>7. 'DB Statistiken' zeigt Datenbankstatistiken</p>
        <p>8. 'Nachste Zuge' analysiert mogliche Zuge ab aktueller Position</p>
        <p>9. 'Neuronales Netz' fur Deep-Learning-Analysen</p>""",
        "close": "Schließen",
        "values_title": "Detaillierte Werte",
        "move": "Halb Zug",
        "fen": "FEN",
        "vpo": "Wert",
        "language": "Sprache",
        "current_position": "Aktuelle Position",
        "previous_move": "Zuruck",
        "next_move": "Weiter",
        "graph_options": "Diagrammoptionen",
        "graph_type_label": "Diagrammtyp:",
        "line": "Linie",
        "scatter": "Punktdiagramm",
        "bar": "Balkendiagramm",
        "safe_mode": "Sicherer Modus (verhindert Uberlauf)",
        "apply_settings": "Einstellungen anwenden",
        "exact_value": "Exakter Wert (Vc^Vp Produkt)",
        "factors": "Faktoren (Vc^Vp)",
        "difference": "D(k)",
        "ratio": "R(k)",
        "show": "Anzeigen:",
        "all_data": "1. Alle Daten",
        "value_only": "2. Positionswert als Produkt von Primfaktoren",
        "value_and_full": "3. Positionswert und vollstandiger Wert",
        "fen_only": "4. Nur FEN",
        "ratio_only": "5. Werte R(k)=VPo(k)/VPo(k-1)",
        "diff_only": "6. Werte D(k)=VPo(k)-VPo(k-1)",
        "status_waiting": "Status: Warte auf PGN-Eingabe",
        "status_ready": "Status: Bereit zur Analyse",
        "status_completed": "Status: Analyse abgeschlossen",
        "visualization_label": "Visualisierung",
        "pgn_label": "PGN-Spiel:",
        "analysis_problems": "Analyseprobleme in PGN gefunden",
        "document_export_failed": "Dokumentexport fehlgeschlagen",
        "file_loaded": "Datei geladen:",
        "overflow_warning": "Wertuberlauf bei Zug",
        "game_analyzed": "Partie analysiert",
        "event": "Ereignis",
        "white": "Weiß",
        "black": "Schwarz",
        "date": "Datum",
        "result": "Ergebnis",
        "moves_processed": "Halbbzuge verarbeitet",
        "pgn_parsing_error": "PGN-Analysefehler",
        "unexpected_error": "Unerwarteter Fehler",
        "error_showing_values": "Fehler beim Anzeigen der Wertetabelle",
        "error_creating_table": "Fehler beim Erstellen der Tabelle",
        "error_updating_view": "Fehler beim Aktualisieren der Ansicht",
        "error_changing_language": "Fehler beim Andern der Sprache",
        "error_updating_ui": "Fehler beim Aktualisieren der Benutzeroberflache",
        "critical_error": "Kritischer Fehler",
        "app_failed": "Anwendung konnte nicht gestartet werden",
        "fatal_error": "Fataler Fehler",
        "board_size": "Brettgroße:",
        "small": "Klein",
        "medium": "Mittel",
        "large": "Groß",
        "help": "Hilfe",
        "close": "Schließen",
        "pgn_original": "Originales PGN:",
        "moves": "Halbbzuge",
        "open_position_editor": "Positionseditor offnen",
        "fen_placeholder": "FEN der Position wird hier angezeigt...",
        "load_position": "Position laden",
        "edit_position": "Position bearbeiten",
        "error_opening_editor": "Fehler beim Offnen des Positionseditors",
        "invalid_fen": "Ungultiges FEN",
        "jadidi_formula_title": "Nachste Zuge - Aktuelle Positionsanalyse",
        "current_value": "Aktueller Wert",
        "legal_moves_values": "Legale Zuge und ihre Werte",
        "notation": "Notation",
        "resulting_fen": "Resultierendes FEN",
        "visualize_move": "Zug visualisieren",
        "export_data": "Daten exportieren",
        "move_visualization": "Zugvisualisierung",
        "select_move_to_visualize": "Bitte einen Zug zur Visualisierung auswahlen",
        "error_visualizing_move": "Fehler bei der Zugvisualisierung",
        "error_showing_formula": "Fehler beim Anzeigen der Formelanalyse",
        "export_move_data": "Zugdaten exportieren",
        "success": "Erfolg",
        "data_exported_successfully": "Daten erfolgreich exportiert",
        "error_exporting_data": "Fehler beim Exportieren der Daten",
        "graphs_of": "Diagramme von",
        "segment": "Segment",
        "variation": "Variation",
        "undo_move": "Zug ruckgangig machen",
        "exporting_document": "Dokument wird exportiert...",
        "adding_title_info": "Titel und Spielinformationen werden hinzugefugt...",
        "generating_graphs": "Diagramme werden generiert...",
        "adding_analysis_data": "Analysedaten werden hinzugefugt...",
        "saving_document": "Dokument wird gespeichert...",
        "error_opening_graph_viewer": "Fehler beim Offnen des Diagramm-Viewers",
        "pgn_analysis": "PGN Analyse",
        "graph_viewer_title": "Diagramm-Viewer",
        "open_graph_viewer": "Diagramm-Viewer offnen",
        "position_loaded_successfully": "Position erfolgreich geladen",
        "search_positions": "Positionen Suchen",
        "db_stats": "DB Statistiken",
        "neural_network": "Neuronales Netz",
        "next_plays": "Nachste Zuge"
        }
    
    def translate(self, key):
        return self.translations[self.current_lang].get(key, key)
    
    def change_language(self, index):
        try:
            new_lang = self.lang_combo.itemData(index)
            if new_lang != self.current_lang:
                self.current_lang = new_lang
                self.retranslate_ui()
                if hasattr(self, 'multiple_analysis_widget'):
                    self.multiple_analysis_widget.set_language(new_lang)
                    self.tab_widget.setTabText(1, MULTIPLE_PGN_TEXTS[new_lang]['tab_title'])
        except Exception as e:
            self.logger.error(f"Error changing language: {str(e)}")
            QMessageBox.critical(self, self.translate("error_changing_language"), 
                               f"{self.translate('error_updating_ui')}:\n{str(e)}")
    
    def retranslate_ui(self):
        try:
            self.setWindowTitle(self.translate("window_title"))
            self.btn_load.setText(self.translate("load_pgn"))
            self.btn_analyze.setText(self.translate("analyze_game"))
            self.btn_values.setText(self.translate("detailed_values"))
            self.btn_export.setText(self.translate("export_docx"))
            self.btn_help.setText(self.translate("help"))
            self.btn_formula.setText(self.translate("next_plays"))
            self.btn_search.setText(self.translate("search_positions"))
            self.btn_db_stats.setText(self.translate("db_stats"))
            self.btn_neural.setText(self.translate("neural_network"))
            self.btn_open_editor.setText(self.translate("open_position_editor"))
            
            self.tab_widget.setTabText(0, self.translate("pgn_analysis"))
            
            self.pgn_textedit.setPlaceholderText(self.translate("pgn_placeholder"))
            
            self.lang_combo.blockSignals(True)
            self.lang_combo.setItemText(0, "English")
            self.lang_combo.setItemText(1, "Espanol")
            self.lang_combo.setItemText(2, "Deutsch")
            self.lang_combo.blockSignals(False)
            
        except Exception as e:
            self.logger.error(f"Error retranslating UI: {str(e)}")
            QMessageBox.critical(self, self.translate("error_updating_ui"), 
                               f"{self.translate('error_updating_ui')}:\n{str(e)}")

    def adjust_splitter_sizes(self):
        try:
            if hasattr(self, 'main_splitter'):
                total_height = self.main_splitter.height()
                top_height = int(total_height * 0.3)
                bottom_height = total_height - top_height
                self.main_splitter.setSizes([top_height, bottom_height])
                
            if hasattr(self, 'top_splitter'):
                total_width = self.top_splitter.width()
                pgn_width = int(total_width * 0.7)
                board_width = total_width - pgn_width
                self.top_splitter.setSizes([pgn_width, board_width])
        except Exception as e:
            self.logger.warning(f"Error adjusting splitter sizes: {str(e)}")

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.adjust_splitter_sizes()

    def showEvent(self, event):
        super().showEvent(event)
        self.adjust_splitter_sizes()
    
    def closeEvent(self, event):
        if hasattr(self, 'position_db'):
            self.position_db.close()
        super().closeEvent(event)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    
    if hasattr(Qt, 'AA_EnableHighDpiScaling'):
        app.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    if hasattr(Qt, 'AA_UseHighDpiPixmaps'):
        app.setAttribute(Qt.AA_UseHighDpiPixmaps, True)
    
    ensure_directories()
    
    try:
        window = ChessAnalyzer()
        window.showMaximized()
        app.exec_()
    except Exception as e:
        import traceback
        traceback.print_exc()
        QMessageBox.critical(None, "Critical Error", f"Application failed to start:\n{str(e)}")