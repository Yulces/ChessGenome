"""
Search Dialog for Chess Gödel Analyzer
Interfaz para buscar posiciones en la base de datos
"""

import sys
import os
from PyQt5.QtCore import Qt, QSize, pyqtSignal
from PyQt5.QtGui import QFont, QPixmap, QPainter
from PyQt5.QtSvg import QSvgWidget
from PyQt5.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QGridLayout,
    QLabel, QLineEdit, QPushButton, QTableWidget,
    QTableWidgetItem, QGroupBox, QSplitter, QWidget,
    QMessageBox, QTabWidget, QTextEdit, QProgressDialog,
    QHeaderView, QComboBox, QCheckBox, QFrame,
    QScrollArea, QFileDialog
)

import chess
import chess.svg
from io import BytesIO

try:
    from position_database import PositionDatabase
except ImportError:
    # Para ejecutar standalone
    import sys
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from position_database import PositionDatabase


class ChessBoardWidget(QSvgWidget):
    """Widget interactivo para mostrar tablero de ajedrez"""
    
    def __init__(self, parent=None, size=300):
        super().__init__(parent)
        self.setFixedSize(size, size)
        self.board = chess.Board()
        self.selected_square = None
        self.update_board()
    
    def update_board(self):
        """Actualiza la visualización del tablero"""
        svg_data = chess.svg.board(
            board=self.board,
            size=self.width(),
            squares=self._get_highlight_squares()
        )
        self.load(svg_data.encode('utf-8'))
    
    def _get_highlight_squares(self):
        """Obtiene las casillas a resaltar"""
        if self.selected_square is not None:
            return [self.selected_square]
        return []
    
    def set_fen(self, fen: str):
        """Establece una posición por FEN"""
        try:
            self.board = chess.Board(fen)
            self.selected_square = None
            self.update_board()
            return True
        except Exception as e:
            print(f"Error setting FEN: {e}")
            return False
    
    def mousePressEvent(self, event):
        """Maneja clics en el tablero (para edición manual)"""
        # Calcular en qué casilla se hizo clic
        size = self.width()
        pos = event.pos()
        col = int(pos.x() * 8 / size)
        row = int(pos.y() * 8 / size)
        
        if 0 <= col < 8 and 0 <= row < 8:
            square = chess.square(col, 7 - row)
            if self.selected_square == square:
                self.selected_square = None
            else:
                self.selected_square = square
            self.update_board()
        
        super().mousePressEvent(event)
    
    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.update_board()


class SearchDialog(QDialog):
    """Diálogo de búsqueda de posiciones"""
    
    position_selected = pyqtSignal(str)  # Emite FEN cuando se selecciona
    
    def __init__(self, parent=None, db_path: str = None):
        super().__init__(parent)
        self.setWindowTitle("Search Positions - Chess Gödel Analyzer")
        self.setMinimumSize(900, 700)
        
        # Conectar a la base de datos
        self.db = PositionDatabase(db_path) if db_path else PositionDatabase()
        
        self.setup_ui()
        self.load_statistics()
    
    def setup_ui(self):
        """Configura la interfaz de usuario"""
        main_layout = QVBoxLayout(self)
        
        # Tabs para diferentes formas de búsqueda
        self.tabs = QTabWidget()
        
        # Tab 1: Búsqueda por FEN
        self.setup_fen_tab()
        
        # Tab 2: Búsqueda por tablero interactivo
        self.setup_board_tab()
        
        # Tab 3: Búsqueda avanzada (por frecuencia, winrate, etc.)
        self.setup_advanced_tab()
        
        # Tab 4: Estadísticas de la BD
        self.setup_stats_tab()
        
        main_layout.addWidget(self.tabs)
        
        # Botones inferiores
        button_layout = QHBoxLayout()
        
        self.btn_close = QPushButton("Close")
        self.btn_close.clicked.connect(self.accept)
        self.btn_close.setStyleSheet("background-color: #F44336; color: white; padding: 8px;")
        
        button_layout.addStretch()
        button_layout.addWidget(self.btn_close)
        
        main_layout.addLayout(button_layout)
    
    def setup_fen_tab(self):
        """Configura la pestaña de búsqueda por FEN"""
        tab = QWidget()
        layout = QVBoxLayout(tab)
        
        # Entrada de FEN
        fen_group = QGroupBox("Enter FEN Position")
        fen_layout = QVBoxLayout(fen_group)
        
        self.fen_input = QTextEdit()
        self.fen_input.setPlaceholderText(
            "Enter FEN string...\n\n"
            "Example: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        )
        self.fen_input.setMaximumHeight(100)
        
        fen_buttons = QHBoxLayout()
        self.btn_search_fen = QPushButton("Search")
        self.btn_search_fen.setStyleSheet("background-color: #4CAF50; color: white; padding: 6px;")
        self.btn_clear_fen = QPushButton("Clear")
        self.btn_load_example = QPushButton("Load Example (Initial)")
        
        self.btn_search_fen.clicked.connect(self.search_by_fen)
        self.btn_clear_fen.clicked.connect(lambda: self.fen_input.clear())
        self.btn_load_example.clicked.connect(self.load_example_fen)
        
        fen_buttons.addWidget(self.btn_search_fen)
        fen_buttons.addWidget(self.btn_clear_fen)
        fen_buttons.addWidget(self.btn_load_example)
        fen_buttons.addStretch()
        
        fen_layout.addWidget(self.fen_input)
        fen_layout.addLayout(fen_buttons)
        
        layout.addWidget(fen_group)
        
        # Resultados
        self.setup_results_panel(layout)
        
        self.tabs.addTab(tab, "Search by FEN")
    
    def setup_board_tab(self):
        """Configura la pestaña de búsqueda por tablero interactivo"""
        tab = QWidget()
        layout = QHBoxLayout(tab)
        
        # Panel izquierdo: tablero
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        
        self.board_widget = ChessBoardWidget(size=400)
        left_layout.addWidget(self.board_widget, 0, Qt.AlignCenter)
        
        # Controles del tablero
        board_controls = QHBoxLayout()
        
        self.btn_reset_board = QPushButton("Reset Position")
        self.btn_copy_fen_board = QPushButton("Copy FEN")
        self.btn_search_board = QPushButton("Search")
        self.btn_search_board.setStyleSheet("background-color: #4CAF50; color: white;")
        
        self.btn_reset_board.clicked.connect(self.reset_board)
        self.btn_copy_fen_board.clicked.connect(self.copy_fen_from_board)
        self.btn_search_board.clicked.connect(self.search_by_board)
        
        board_controls.addWidget(self.btn_reset_board)
        board_controls.addWidget(self.btn_copy_fen_board)
        board_controls.addWidget(self.btn_search_board)
        
        left_layout.addLayout(board_controls)
        
        # Panel derecho: información
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        
        self.board_fen_label = QLabel("Current FEN:")
        self.board_fen_value = QLabel("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        self.board_fen_value.setWordWrap(True)
        self.board_fen_value.setStyleSheet("font-family: monospace; font-size: 10pt;")
        
        right_layout.addWidget(self.board_fen_label)
        right_layout.addWidget(self.board_fen_value)
        
        # Resultados de búsqueda en este tab
        self.board_results = QTextEdit()
        self.board_results.setReadOnly(True)
        self.board_results.setPlaceholderText("Search results will appear here...")
        right_layout.addWidget(self.board_results)
        
        left_panel.setFixedWidth(450)
        layout.addWidget(left_panel)
        layout.addWidget(right_panel, 1)
        
        self.tabs.addTab(tab, "Build Position on Board")
    
    def setup_advanced_tab(self):
        """Configura la pestaña de búsqueda avanzada"""
        tab = QWidget()
        layout = QVBoxLayout(tab)
        
        # Filtros
        filters_group = QGroupBox("Advanced Filters")
        filters_layout = QGridLayout(filters_group)
        
        # Frecuencia mínima
        filters_layout.addWidget(QLabel("Minimum frequency:"), 0, 0)
        self.min_freq_input = QLineEdit()
        self.min_freq_input.setPlaceholderText("e.g., 100")
        filters_layout.addWidget(self.min_freq_input, 0, 1)
        
        # Winrate rango
        filters_layout.addWidget(QLabel("Winrate range:"), 1, 0)
        self.winrate_min = QLineEdit()
        self.winrate_min.setPlaceholderText("min (0-1)")
        self.winrate_max = QLineEdit()
        self.winrate_max.setPlaceholderText("max (0-1)")
        winrate_layout = QHBoxLayout()
        winrate_layout.addWidget(self.winrate_min)
        winrate_layout.addWidget(QLabel("to"))
        winrate_layout.addWidget(self.winrate_max)
        filters_layout.addLayout(winrate_layout, 1, 1)
        
        # Turno
        filters_layout.addWidget(QLabel("Turn to move:"), 2, 0)
        self.turn_combo = QComboBox()
        self.turn_combo.addItems(["Any", "White", "Black"])
        filters_layout.addWidget(self.turn_combo, 2, 1)
        
        # Ordenar por
        filters_layout.addWidget(QLabel("Sort by:"), 3, 0)
        self.sort_combo = QComboBox()
        self.sort_combo.addItems(["Frequency (highest first)", "Winrate (highest first)", "S value"])
        filters_layout.addWidget(self.sort_combo, 3, 1)
        
        # Límite de resultados
        filters_layout.addWidget(QLabel("Max results:"), 4, 0)
        self.limit_input = QLineEdit("100")
        filters_layout.addWidget(self.limit_input, 4, 1)
        
        layout.addWidget(filters_group)
        
        # Botón de búsqueda
        self.btn_advanced_search = QPushButton("Advanced Search")
        self.btn_advanced_search.setStyleSheet("background-color: #4CAF50; color: white; padding: 8px;")
        self.btn_advanced_search.clicked.connect(self.advanced_search)
        layout.addWidget(self.btn_advanced_search)
        
        # Tabla de resultados
        self.advanced_results_table = QTableWidget()
        self.advanced_results_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.advanced_results_table.setSelectionBehavior(QTableWidget.SelectRows)
        self.advanced_results_table.setAlternatingRowColors(True)
        self.advanced_results_table.setColumnCount(6)
        self.advanced_results_table.setHorizontalHeaderLabels([
            "FEN (short)", "Frequency", "Winrate (W)", "Winrate (Turn)", "Best Move", "S (log)"
        ])
        self.advanced_results_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.advanced_results_table.itemDoubleClicked.connect(self.on_result_double_click)
        
        layout.addWidget(self.advanced_results_table)
        
        self.tabs.addTab(tab, "Advanced Search")
    
    def setup_stats_tab(self):
        """Configura la pestaña de estadísticas"""
        tab = QWidget()
        layout = QVBoxLayout(tab)
        
        # Estadísticas principales
        self.stats_text = QTextEdit()
        self.stats_text.setReadOnly(True)
        self.stats_text.setFont(QFont("monospace", 10))
        layout.addWidget(self.stats_text)
        
        # Botón para actualizar
        self.btn_refresh_stats = QPushButton("Refresh Statistics")
        self.btn_refresh_stats.clicked.connect(self.load_statistics)
        layout.addWidget(self.btn_refresh_stats)
        
        # Top posiciones más frecuentes
        layout.addWidget(QLabel("\nMost Frequent Positions:"))
        self.top_positions_table = QTableWidget()
        self.top_positions_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.top_positions_table.setColumnCount(4)
        self.top_positions_table.setHorizontalHeaderLabels(["Rank", "FEN (short)", "Frequency", "Winrate"])
        self.top_positions_table.itemDoubleClicked.connect(self.on_top_position_double_click)
        layout.addWidget(self.top_positions_table)
        
        self.tabs.addTab(tab, "Statistics")
    
    def setup_results_panel(self, parent_layout):
        """Configura el panel de resultados compartido"""
        # Resultados de búsqueda
        self.results_group = QGroupBox("Search Results")
        results_layout = QVBoxLayout(self.results_group)
        
        # Información de la posición encontrada
        self.position_info = QTextEdit()
        self.position_info.setReadOnly(True)
        self.position_info.setMaximumHeight(150)
        self.position_info.setFont(QFont("monospace", 9))
        results_layout.addWidget(self.position_info)
        
        # Tabla de movimientos más comunes
        results_layout.addWidget(QLabel("Most Common Moves from this Position:"))
        
        self.moves_table = QTableWidget()
        self.moves_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.moves_table.setSelectionBehavior(QTableWidget.SelectRows)
        self.moves_table.setAlternatingRowColors(True)
        self.moves_table.setColumnCount(5)
        self.moves_table.setHorizontalHeaderLabels([
            "Move (UCI)", "Move (SAN)", "Frequency", "Winrate", "Evaluation"
        ])
        self.moves_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        
        results_layout.addWidget(self.moves_table)
        
        # Posiciones similares
        results_layout.addWidget(QLabel("Similar Positions (by S distance):"))
        
        self.similar_table = QTableWidget()
        self.similar_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.similar_table.setSelectionBehavior(QTableWidget.SelectRows)
        self.similar_table.setColumnCount(3)
        self.similar_table.setHorizontalHeaderLabels(["S Difference", "FEN (short)", "Frequency"])
        self.similar_table.itemDoubleClicked.connect(self.on_similar_double_click)
        
        results_layout.addWidget(self.similar_table)
        
        parent_layout.addWidget(self.results_group)
    
    def load_statistics(self):
        """Carga y muestra estadísticas de la BD"""
        try:
            stats = self.db.get_statistics()
            
            stats_html = f"""
            <h3>Database Statistics</h3>
            <table border="0" cellpadding="5">
            <tr><td><b>Total unique positions:</b></td><td>{stats['total_positions']:,}</td></tr>
            <tr><td><b>Total occurrences:</b></td><td>{stats['total_occurrences']:,}</td></tr>
            <tr><td><b>Total transitions:</b></td><td>{stats['total_transitions']:,}</td></tr>
            <tr><td><b>Average frequency:</b></td><td>{stats['avg_frequency']}</td></tr>
            <tr><td><b>Database size:</b></td><td>{stats['db_size_mb']} MB</td></tr>
            <tr><td><b>Database path:</b></td><td>{stats['db_path']}</td></tr>
            </table>
            """
            self.stats_text.setHtml(stats_html)
            
            # Cargar top posiciones
            top_positions = self.db.get_positions_summary(limit=50)
            self.top_positions_table.setRowCount(len(top_positions))
            
            for i, pos in enumerate(top_positions):
                # Rank
                rank_item = QTableWidgetItem(str(i+1))
                rank_item.setTextAlignment(Qt.AlignCenter)
                self.top_positions_table.setItem(i, 0, rank_item)
                
                # FEN (short)
                fen_short = pos['fen'][:60] + "..." if len(pos['fen']) > 60 else pos['fen']
                fen_item = QTableWidgetItem(fen_short)
                fen_item.setData(Qt.UserRole, pos['fen'])
                self.top_positions_table.setItem(i, 1, fen_item)
                
                # Frequency
                freq_item = QTableWidgetItem(str(pos['frecuencia']))
                freq_item.setTextAlignment(Qt.AlignRight)
                self.top_positions_table.setItem(i, 2, freq_item)
                
                # Winrate (placeholder - actualizar cuando tengamos)
                wr_item = QTableWidgetItem(f"{pos.get('winrate_white', 0.5):.3f}")
                wr_item.setTextAlignment(Qt.AlignRight)
                self.top_positions_table.setItem(i, 3, wr_item)
            
            self.top_positions_table.resizeColumnsToContents()
            
        except Exception as e:
            self.stats_text.setPlainText(f"Error loading statistics: {str(e)}")
    
    def search_by_fen(self):
        """Busca posición por FEN ingresado"""
        fen = self.fen_input.toPlainText().strip()
        if not fen:
            QMessageBox.warning(self, "Warning", "Please enter a FEN position")
            return
        
        self.perform_search(fen)
    
    def search_by_board(self):
        """Busca posición usando el tablero interactivo"""
        fen = self.board_widget.board.fen()
        self.perform_search(fen)
    
    def perform_search(self, fen: str):
        """Realiza la búsqueda y muestra resultados"""
        try:
            # Normalizar FEN (quitar partes opcionales para comparación)
            fen_base = fen.split(' ')[0]  # Solo la parte de piezas
            
            # Buscar en BD
            position = self.db.get_position_by_fen(fen)
            
            if not position:
                # Intentar buscar por FEN base
                all_positions = self._search_by_fen_pattern(fen_base)
                if all_positions:
                    self.show_multiple_results(all_positions, fen)
                else:
                    self.position_info.setPlainText(f"? Position not found in database.\n\nFEN: {fen}")
                    self.moves_table.setRowCount(0)
                    self.similar_table.setRowCount(0)
                return
            
            # Mostrar información de la posición
            self.display_position_info(position, fen)
            
            # Buscar movimientos desde esta posición
            self.load_moves_from_position(position['s_hash'])
            
            # Buscar posiciones similares
            self.load_similar_positions(position['s_log'] if position.get('s_log') else None)
            
        except Exception as e:
            self.position_info.setPlainText(f"Error searching: {str(e)}")
    
    def _search_by_fen_pattern(self, fen_pattern: str) -> list:
        """Busca posiciones que coincidan con un patrón de FEN"""
        # Implementar búsqueda LIKE en SQL
        conn = self.db.conn
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM positions 
            WHERE fen LIKE ? 
            ORDER BY frecuencia DESC 
            LIMIT 20
        """, (fen_pattern + '%',))
        return [dict(row) for row in cursor.fetchall()]
    
    def show_multiple_results(self, positions: list, original_fen: str):
        """Muestra múltiples resultados cuando la búsqueda exacta falla"""
        text = f"?? Exact position not found. Found {len(positions)} similar positions:\n\n"
        for i, pos in enumerate(positions[:10]):
            text += f"{i+1}. {pos['fen'][:80]}... (freq: {pos['frecuencia']})\n"
        text += "\nDouble-click on a result in 'Advanced Search' tab to view details."
        self.position_info.setPlainText(text)
    
    def display_position_info(self, position: dict, fen: str):
        """Muestra información detallada de una posición"""
        # Obtener mejor jugada
        best_move = self.db.get_best_move_from_hash(position['s_hash'])
        
        info = f"""
        ? POSITION FOUND
        
        ?? FEN: {fen}
        ?? Frequency: {position['frecuencia']:,} times
        ?? Winrate (White): {position.get('winrate_white', 0.5):.3f}
        ?? Winrate (Turn): {position.get('winrate_turn', 0.5):.3f}
        ?? Best Move: {best_move if best_move else 'N/A'}
        ?? First seen: {position.get('created_at', 'N/A')}
        ?? S-hash: {position['s_hash'][:32]}...
        """
        
        self.position_info.setPlainText(info)
    
    def load_moves_from_position(self, s_hash: str):
        """Carga los movimientos más comunes desde una posición"""
        cursor = self.db.conn.cursor()
        cursor.execute("""
            SELECT move_uci, frecuencia, winrate_from_move
            FROM transitions
            WHERE from_s_hash = ?
            ORDER BY frecuencia DESC
            LIMIT 20
        """, (s_hash,))
        
        moves = cursor.fetchall()
        self.moves_table.setRowCount(len(moves))
        
        for i, move in enumerate(moves):
            # Movimiento UCI
            uci_item = QTableWidgetItem(move['move_uci'])
            self.moves_table.setItem(i, 0, uci_item)
            
            # Movimiento SAN (convertir)
            try:
                # Obtener una posición para convertir
                board = chess.Board()
                move_obj = chess.Move.from_uci(move['move_uci'])
                san = board.san(move_obj) if board.is_legal(move_obj) else move['move_uci']
            except:
                san = move['move_uci']
            san_item = QTableWidgetItem(san)
            self.moves_table.setItem(i, 1, san_item)
            
            # Frecuencia
            freq_item = QTableWidgetItem(str(move['frecuencia']))
            freq_item.setTextAlignment(Qt.AlignRight)
            self.moves_table.setItem(i, 2, freq_item)
            
            # Winrate
            wr_item = QTableWidgetItem(f"{move['winrate_from_move']:.3f}")
            wr_item.setTextAlignment(Qt.AlignRight)
            self.moves_table.setItem(i, 3, wr_item)
            
            # Evaluación (placeholder)
            eval_item = QTableWidgetItem("N/A")
            eval_item.setTextAlignment(Qt.AlignCenter)
            self.moves_table.setItem(i, 4, eval_item)
        
        self.moves_table.resizeColumnsToContents()
    
    def load_similar_positions(self, s_log: float):
        """Carga posiciones similares basadas en log(S)"""
        if s_log is None:
            self.similar_table.setRowCount(0)
            return
        
        cursor = self.db.conn.cursor()
        # Buscar posiciones con log(S) cercano
        delta = 1.0  # Rango de búsqueda
        cursor.execute("""
            SELECT s_log, fen, frecuencia
            FROM positions
            WHERE s_log BETWEEN ? AND ?
            ORDER BY ABS(s_log - ?)
            LIMIT 10
        """, (s_log - delta, s_log + delta, s_log))
        
        similar = cursor.fetchall()
        self.similar_table.setRowCount(len(similar))
        
        for i, pos in enumerate(similar):
            # Diferencia
            diff = abs(pos['s_log'] - s_log) if pos['s_log'] else 0
            diff_item = QTableWidgetItem(f"{diff:.4e}")
            diff_item.setTextAlignment(Qt.AlignRight)
            self.similar_table.setItem(i, 0, diff_item)
            
            # FEN (short)
            fen_short = pos['fen'][:50] + "..." if len(pos['fen']) > 50 else pos['fen']
            fen_item = QTableWidgetItem(fen_short)
            fen_item.setData(Qt.UserRole, pos['fen'])
            self.similar_table.setItem(i, 1, fen_item)
            
            # Frecuencia
            freq_item = QTableWidgetItem(str(pos['frecuencia']))
            freq_item.setTextAlignment(Qt.AlignRight)
            self.similar_table.setItem(i, 2, freq_item)
        
        self.similar_table.resizeColumnsToContents()
    
    def advanced_search(self):
        """Realiza búsqueda avanzada con filtros"""
        try:
            # Construir consulta
            query = "SELECT * FROM positions WHERE 1=1"
            params = []
            
            # Filtro de frecuencia
            min_freq = self.min_freq_input.text().strip()
            if min_freq:
                query += " AND frecuencia >= ?"
                params.append(int(min_freq))
            
            # Filtro de winrate
            min_wr = self.winrate_min.text().strip()
            max_wr = self.winrate_max.text().strip()
            if min_wr:
                query += " AND winrate_white >= ?"
                params.append(float(min_wr))
            if max_wr:
                query += " AND winrate_white <= ?"
                params.append(float(max_wr))
            
            # Ordenamiento
            sort_by = self.sort_combo.currentText()
            if "Frequency" in sort_by:
                query += " ORDER BY frecuencia DESC"
            elif "Winrate" in sort_by:
                query += " ORDER BY winrate_white DESC"
            else:
                query += " ORDER BY s_log"
            
            # Límite
            limit = int(self.limit_input.text() or 100)
            query += " LIMIT ?"
            params.append(limit)
            
            cursor = self.db.conn.cursor()
            cursor.execute(query, params)
            results = cursor.fetchall()
            
            # Mostrar resultados
            self.advanced_results_table.setRowCount(len(results))
            
            for i, row in enumerate(results):
                # FEN (short)
                fen_short = row['fen'][:40] + "..." if len(row['fen']) > 40 else row['fen']
                fen_item = QTableWidgetItem(fen_short)
                fen_item.setData(Qt.UserRole, row['fen'])
                self.advanced_results_table.setItem(i, 0, fen_item)
                
                # Frecuencia
                freq_item = QTableWidgetItem(str(row['frecuencia']))
                freq_item.setTextAlignment(Qt.AlignRight)
                self.advanced_results_table.setItem(i, 1, freq_item)
                
                # Winrate White
                wr_item = QTableWidgetItem(f"{row.get('winrate_white', 0.5):.3f}")
                wr_item.setTextAlignment(Qt.AlignRight)
                self.advanced_results_table.setItem(i, 2, wr_item)
                
                # Winrate Turn
                wr_turn_item = QTableWidgetItem(f"{row.get('winrate_turn', 0.5):.3f}")
                wr_turn_item.setTextAlignment(Qt.AlignRight)
                self.advanced_results_table.setItem(i, 3, wr_turn_item)
                
                # Best Move
                best = self.db.get_best_move_from_hash(row['s_hash'])
                best_item = QTableWidgetItem(best if best else "N/A")
                self.advanced_results_table.setItem(i, 4, best_item)
                
                # S log
                log_item = QTableWidgetItem(f"{row['s_log']:.2f}" if row['s_log'] else "N/A")
                log_item.setTextAlignment(Qt.AlignRight)
                self.advanced_results_table.setItem(i, 5, log_item)
            
            self.advanced_results_table.resizeColumnsToContents()
            
            QMessageBox.information(self, "Search Complete", f"Found {len(results)} positions")
            
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Advanced search failed: {str(e)}")
    
    def load_example_fen(self):
        """Carga un FEN de ejemplo (posición inicial)"""
        example_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        self.fen_input.setPlainText(example_fen)
    
    def reset_board(self):
        """Resetea el tablero a la posición inicial"""
        self.board_widget.set_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        fen = self.board_widget.board.fen()
        self.board_fen_value.setText(fen)
    
    def copy_fen_from_board(self):
        """Copia el FEN actual del tablero al portapapeles"""
        fen = self.board_widget.board.fen()
        clipboard = QApplication.clipboard()
        clipboard.setText(fen)
        self.board_fen_value.setText(fen)
        QMessageBox.information(self, "Copied", "FEN copied to clipboard")
    
    def on_result_double_click(self, item):
        """Maneja doble clic en resultado de búsqueda avanzada"""
        row = item.row()
        fen = self.advanced_results_table.item(row, 0).data(Qt.UserRole)
        if fen:
            # Cambiar a pestaña FEN y mostrar resultado
            self.tabs.setCurrentIndex(0)
            self.fen_input.setPlainText(fen)
            self.search_by_fen()
    
    def on_top_position_double_click(self, item):
        """Maneja doble clic en top posiciones"""
        row = item.row()
        fen = self.top_positions_table.item(row, 1).data(Qt.UserRole)
        if fen:
            self.tabs.setCurrentIndex(0)
            self.fen_input.setPlainText(fen)
            self.search_by_fen()
    
    def on_similar_double_click(self, item):
        """Maneja doble clic en posición similar"""
        row = item.row()
        fen = self.similar_table.item(row, 1).data(Qt.UserRole)
        if fen:
            self.tabs.setCurrentIndex(0)
            self.fen_input.setPlainText(fen)
            self.search_by_fen()
    
    def get_db(self):
        """Retorna la instancia de la BD para uso externo"""
        return self.db


# Método adicional para la clase PositionDatabase (agregar)
def get_best_move_from_hash(self, s_hash: str) -> str:
    """Obtiene la mejor jugada desde un s_hash"""
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


# Agregar el método a la clase PositionDatabase
PositionDatabase.get_best_move_from_hash = get_best_move_from_hash


# Para probar standalone
if __name__ == "__main__":
    from PyQt5.QtWidgets import QApplication
    import sys
    
    app = QApplication(sys.argv)
    
    # Usar la BD existente o crear una nueva
    db_path = None
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    
    dialog = SearchDialog(db_path=db_path)
    dialog.show()
    
    sys.exit(app.exec_())