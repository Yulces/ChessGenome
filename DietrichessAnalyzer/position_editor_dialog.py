"""
CHESSANALYZER - Sistema de Análisis de Ajedrez con Representación Gödeliana
Versión: 3.0 COMPLETA - EDITOR FUNCIONANDO - Stockfish 18 Integrado
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
    ]
    for directory in directories:
        os.makedirs(directory, exist_ok=True)
    return base_dir

# ============================================================================
# CLASE: StockfishEngine
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
                self.engine.set_fen_position("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
                best_move = self.engine.get_best_move()
                if best_move:
                    self.is_ready = True
                    logger.info(f"Stockfish iniciado correctamente (profundidad: {self.depth})")
                    self.last_error = None
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
    
    def analyze_position(self, fen, depth=None):
        if not self.is_ready:
            logger.warning(f"Intento de análisis con motor no listo: {self.last_error}")
            return None
        
        try:
            self.engine.set_fen_position(fen)
            
            best_move = self.engine.get_best_move()
            evaluation = self.engine.get_evaluation()
            top_moves = self.engine.get_top_moves(5)
            
            return {
                'best_move': best_move,
                'best_move_san': self._uci_to_san(fen, best_move) if best_move else None,
                'score': evaluation.get('value', 0),
                'mate': evaluation.get('mate', None),
                'depth': self.depth,
                'top_moves': top_moves,
                'fen': fen,
            }
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error analizando posicion: {str(e)}")
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
# CLASE: ChessBoardWidget - CORREGIDA (funciona correctamente)
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

# ============================================================================
# CLASE: PositionEditorDialog - CORREGIDA (funciona correctamente)
# ============================================================================
class PositionEditorDialog(QDialog):
    position_accepted = pyqtSignal(str, str, dict)

    def __init__(self, parent=None, caller="main", lang='en'):
        super().__init__(parent)
        self.caller = caller
        self.current_lang = lang
        self.selected_piece = None
        self.setup_ui()
        self.apply_translations()
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

        # ? CORRECCIÓN: self.preview_group en lugar de preview_group
        self.preview_group = QGroupBox("PGN Preview")
        preview_layout = QVBoxLayout(self.preview_group)
        self.pgn_preview = QTextEdit()
        self.pgn_preview.setReadOnly(True)
        self.pgn_preview.setMaximumHeight(150)
        self.pgn_preview.setFont(QFont("Courier New", 9))
        preview_layout.addWidget(self.pgn_preview)
        tab2_layout.addWidget(self.preview_group)  # ? CORREGIDO

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
        # ? CORRECCIÓN: self.preview_group en lugar de preview_group
        self.preview_group.setTitle(texts['editor_pgn_preview'])  # ? CORREGIDO
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
# CONTINUACIÓN DEL RESTO DEL CÓDIGO (GraphViewer, SearchDialog, MultiplePGNAnalysisWidget, ChessAnalyzer)
# ============================================================================
# [El resto del código continúa igual que en el archivo principal...]