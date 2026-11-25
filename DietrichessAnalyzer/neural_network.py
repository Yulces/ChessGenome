"""
NEURAL NETWORK DIALOG - Análisis de posiciones con redes neuronales
Versión COMPLETA CON LOG10(S) FUNCIONANDO
"""

import sys
import os
import numpy as np
import chess
import chess.svg
from PyQt5.QtCore import Qt
from PyQt5.QtGui import QFont, QColor
from PyQt5.QtSvg import QSvgWidget
from PyQt5.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, QPushButton, 
                            QLabel, QTextEdit, QWidget, QGroupBox, QFormLayout,
                            QComboBox, QProgressBar, QMessageBox, QSplitter,
                            QTableWidget, QTableWidgetItem, QHeaderView,
                            QTabWidget, QFrame, QApplication, QGridLayout,
                            QCheckBox, QSpinBox, QDoubleSpinBox, QFileDialog,
                            QScrollArea, QSizePolicy)

# ============================================================
# <--- NUEVO: IMPORTAR DATETIME Y PICKLE PARA GUARDAR --->
# ============================================================
import datetime
import pickle
import json

# ============================================================================
# DICCIONARIOS DE TRADUCCIÓN
# ============================================================================
NEURAL_TEXTS = {
    'en': {
        'window_title': '🧠 Neural Network Analysis',
        'refresh_board': '🔄 Refresh Board',
        'network_status': '📊 Network Status',
        'not_trained': '⚪ Not trained',
        'trained': '✅ Trained - {0}',
        'position_info': '📍 Position Info',
        'fen': 'FEN:',
        'moves': 'Moves:',
        'pieces': 'Pieces:',
        's_value': 'S Value:',
        'log_s': 'Log10(S):',
        'stockfish_ref': '🔍 Stockfish Reference',
        'best': 'Best:',
        'score': 'Score:',
        'btn_compare_sf': '📊 Compare with Stockfish',
        'training_group': '🎯 Training',
        'btn_train': '🚀 Train Network',
        'btn_analyze': '🔮 Analyze Position',
        'btn_save': '💾 Save Model',
        'btn_load': '📂 Load Model',
        'prediction_group': '🎯 Move Predictions',
        'col_num': '#',
        'col_move': 'Move (UCI)',
        'col_san': 'Move (SAN)',
        'col_s_value': 'S Value',
        'col_log_s': 'Log10(S)',
        'col_nn_score': 'NN Score',
        'col_confidence': 'Confidence',
        'col_sf_match': 'SF Match',
        'best_move': '🏆 Best Move:',
        'confidence': 'Confidence:',
        'btn_graph': '📊 Show Comparison Graph',
        'details_group': '📋 Detailed Analysis',
        'btn_close': '❌ Close',
        'no_moves': 'No legal moves available',
        'not_trained_warning': 'The neural network has not been trained yet.',
        'train_first': 'Please train the network first',
        'stockfish_not_available': 'Stockfish engine is not available',
        'analysis_failed': 'Analysis failed: {0}',
        'save_failed': 'Save failed: {0}',
        'load_failed': 'Load failed: {0}',
        'no_model': 'No trained model to save',
        'cannot_load': 'Could not load model. Check the file format.',
        'training_complete': 'Training Complete',
        'training_msg': 'Neural network trained successfully!\n\nSamples: {0}\nFeatures: {1}\nAccuracy: {2:.2%}',
        'model_saved': 'Model saved successfully to:\n{0}',
        'model_loaded': 'Model loaded successfully!',
        'no_database': 'Database not available',
        'not_enough_data': 'Need at least 10 positions for training. Found: {0}',
        'no_ml_libs': 'Neither TensorFlow nor scikit-learn is installed.\nRun: pip install tensorflow scikit-learn',
        'best_move_text': 'Best Move: {0} ({1})',
        'confidence_text': 'Confidence: {0:.1f}%',
        'extracting_features': 'Extracting features from database...',
        'training_model': 'Training neural network...',
        'nn_prediction': 'NN Prediction',
        'sf_prediction': 'SF Prediction',
        'match': '✓ Match',
        'no_match': '✗ No match',
        'graph_title': 'Move Predictions Comparison',
        'graph_score': 'Score (%)',
        'graph_close': 'Close',
        'move_applied': 'Move Applied',
        'move_applied_msg': 'Applied move: {0}\nNew position loaded',
        'nav_first': '⏮ First',
        'nav_prev': '◀ Prev',
        'nav_next': 'Next ▶',
        'nav_last': 'Last ⏭',
        'nav_move': 'Move: {0}/{1}',
        'btn_save_complete': '💾 Save Complete Model',
        'btn_load_complete': '📂 Load Complete Model',
    },
    'es': {
        'window_title': '🧠 Análisis de Red Neuronal',
        'refresh_board': '🔄 Actualizar Tablero',
        'network_status': '📊 Estado de la Red',
        'not_trained': '⚪ No entrenada',
        'trained': '✅ Entrenada - {0}',
        'position_info': '📍 Información de la Posición',
        'fen': 'FEN:',
        'moves': 'Movimientos:',
        'pieces': 'Piezas:',
        's_value': 'Valor S:',
        'log_s': 'Log10(S):',
        'stockfish_ref': '🔍 Referencia Stockfish',
        'best': 'Mejor:',
        'score': 'Puntuación:',
        'btn_compare_sf': '📊 Comparar con Stockfish',
        'training_group': '🎯 Entrenamiento',
        'btn_train': '🚀 Entrenar Red',
        'btn_analyze': '🔮 Analizar Posición',
        'btn_save': '💾 Guardar Modelo',
        'btn_load': '📂 Cargar Modelo',
        'prediction_group': '🎯 Predicciones de Movimientos',
        'col_num': '#',
        'col_move': 'Movimiento (UCI)',
        'col_san': 'Movimiento (SAN)',
        'col_s_value': 'Valor S',
        'col_log_s': 'Log10(S)',
        'col_nn_score': 'Puntaje NN',
        'col_confidence': 'Confianza',
        'col_sf_match': 'Coincide SF',
        'best_move': '🏆 Mejor Movimiento:',
        'confidence': 'Confianza:',
        'btn_graph': '📊 Mostrar Gráfico Comparativo',
        'details_group': '📋 Análisis Detallado',
        'btn_close': '❌ Cerrar',
        'no_moves': 'No hay movimientos legales disponibles',
        'not_trained_warning': 'La red neuronal aún no ha sido entrenada.',
        'train_first': 'Por favor entrene la red primero',
        'stockfish_not_available': 'El motor Stockfish no está disponible',
        'analysis_failed': 'Error en el análisis: {0}',
        'save_failed': 'Error al guardar: {0}',
        'load_failed': 'Error al cargar: {0}',
        'no_model': 'No hay modelo entrenado para guardar',
        'cannot_load': 'No se pudo cargar el modelo. Verifique el formato del archivo.',
        'training_complete': 'Entrenamiento Completado',
        'training_msg': '¡Red neuronal entrenada exitosamente!\n\nMuestras: {0}\nCaracterísticas: {1}\nPrecisión: {2:.2%}',
        'model_saved': 'Modelo guardado exitosamente en:\n{0}',
        'model_loaded': '¡Modelo cargado exitosamente!',
        'no_database': 'Base de datos no disponible',
        'not_enough_data': 'Se necesitan al menos 10 posiciones para entrenar. Encontradas: {0}',
        'no_ml_libs': 'Ni TensorFlow ni scikit-learn están instalados.\nEjecute: pip install tensorflow scikit-learn',
        'best_move_text': 'Mejor Movimiento: {0} ({1})',
        'confidence_text': 'Confianza: {0:.1f}%',
        'extracting_features': 'Extrayendo características de la base de datos...',
        'training_model': 'Entrenando red neuronal...',
        'nn_prediction': 'Predicción NN',
        'sf_prediction': 'Predicción SF',
        'match': '✓ Coincide',
        'no_match': '✗ No coincide',
        'graph_title': 'Comparación de Predicciones de Movimientos',
        'graph_score': 'Puntuación (%)',
        'graph_close': 'Cerrar',
        'move_applied': 'Movimiento Aplicado',
        'move_applied_msg': 'Movimiento aplicado: {0}\nNueva posición cargada',
        'nav_first': '⏮ Primero',
        'nav_prev': '◀ Anterior',
        'nav_next': 'Siguiente ▶',
        'nav_last': 'Último ⏭',
        'nav_move': 'Movimiento: {0}/{1}',
        'btn_save_complete': '💾 Guardar Modelo Completo',
        'btn_load_complete': '📂 Cargar Modelo Completo',
    },
    'de': {
        'window_title': '🧠 Neuronales Netz Analyse',
        'refresh_board': '🔄 Brett aktualisieren',
        'network_status': '📊 Netzwerkstatus',
        'not_trained': '⚪ Nicht trainiert',
        'trained': '✅ Trainiert - {0}',
        'position_info': '📍 Positionsinformation',
        'fen': 'FEN:',
        'moves': 'Züge:',
        'pieces': 'Figuren:',
        's_value': 'S-Wert:',
        'log_s': 'Log10(S):',
        'stockfish_ref': '🔍 Stockfish Referenz',
        'best': 'Bester:',
        'score': 'Bewertung:',
        'btn_compare_sf': '📊 Mit Stockfish vergleichen',
        'training_group': '🎯 Training',
        'btn_train': '🚀 Netz trainieren',
        'btn_analyze': '🔮 Position analysieren',
        'btn_save': '💾 Modell speichern',
        'btn_load': '📂 Modell laden',
        'prediction_group': '🎯 Zugvorhersagen',
        'col_num': '#',
        'col_move': 'Zug (UCI)',
        'col_san': 'Zug (SAN)',
        'col_s_value': 'S-Wert',
        'col_log_s': 'Log10(S)',
        'col_nn_score': 'NN Wertung',
        'col_confidence': 'Konfidenz',
        'col_sf_match': 'SF Übereinstimmung',
        'best_move': '🏆 Bester Zug:',
        'confidence': 'Konfidenz:',
        'btn_graph': '📊 Vergleichsdiagramm anzeigen',
        'details_group': '📋 Detaillierte Analyse',
        'btn_close': '❌ Schließen',
        'no_moves': 'Keine legalen Züge verfügbar',
        'not_trained_warning': 'Das neuronale Netz wurde noch nicht trainiert.',
        'train_first': 'Bitte trainieren Sie zuerst das Netz',
        'stockfish_not_available': 'Stockfish Engine nicht verfügbar',
        'analysis_failed': 'Analyse fehlgeschlagen: {0}',
        'save_failed': 'Speichern fehlgeschlagen: {0}',
        'load_failed': 'Laden fehlgeschlagen: {0}',
        'no_model': 'Kein trainiertes Modell zum Speichern',
        'cannot_load': 'Modell konnte nicht geladen werden. Dateiformat prüfen.',
        'training_complete': 'Training abgeschlossen',
        'training_msg': 'Neuronales Netz erfolgreich trainiert!\n\nStichproben: {0}\nMerkmale: {1}\nGenauigkeit: {2:.2%}',
        'model_saved': 'Modell erfolgreich gespeichert unter:\n{0}',
        'model_loaded': 'Modell erfolgreich geladen!',
        'no_database': 'Datenbank nicht verfügbar',
        'not_enough_data': 'Mindestens 10 Positionen für Training benötigt. Gefunden: {0}',
        'no_ml_libs': 'Weder TensorFlow noch scikit-learn ist installiert.\nFühren Sie aus: pip install tensorflow scikit-learn',
        'best_move_text': 'Bester Zug: {0} ({1})',
        'confidence_text': 'Konfidenz: {0:.1f}%',
        'extracting_features': 'Extrahiere Merkmale aus der Datenbank...',
        'training_model': 'Trainiere neuronales Netz...',
        'nn_prediction': 'NN Vorhersage',
        'sf_prediction': 'SF Vorhersage',
        'match': '✓ Übereinstimmung',
        'no_match': '✗ Keine Übereinstimmung',
        'graph_title': 'Vergleich der Zugvorhersagen',
        'graph_score': 'Wertung (%)',
        'graph_close': 'Schließen',
        'move_applied': 'Zug angewendet',
        'move_applied_msg': 'Zug angewendet: {0}\nNeue Position geladen',
        'nav_first': '⏮ Erste',
        'nav_prev': '◀ Zurück',
        'nav_next': 'Weiter ▶',
        'nav_last': 'Letzte ⏭',
        'nav_move': 'Zug: {0}/{1}',
        'btn_save_complete': '💾 Vollständiges Modell speichern',
        'btn_load_complete': '📂 Vollständiges Modell laden',
    }
}

# Intentar importar tensorflow
TF_AVAILABLE = False
try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers, models
    TF_AVAILABLE = True
except ImportError:
    pass

SKLEARN_AVAILABLE = False
try:
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import mean_squared_error, r2_score
    SKLEARN_AVAILABLE = True
except ImportError:
    pass


class NeuralNetworkDialog(QDialog):
    def __init__(self, parent=None, db=None, stockfish=None, lang='en', initial_board=None, move_history=None, board_history=None):
        super().__init__(parent)
        self.parent_window = parent
        self.db = db
        self.stockfish = stockfish
        self.current_lang = lang
        self.initial_board = initial_board
        
        self.texts = NEURAL_TEXTS.get(lang, NEURAL_TEXTS['en'])
        
        self.model = None
        self.scaler = None
        self.is_trained = False
        self.training_accuracy = 0
        self.output_dim = 0
        
        self.current_board = None
        self.current_move_index = 0
        self.move_history = move_history.copy() if move_history else []
        self.board_history = board_history.copy() if board_history else []
        
        if initial_board is not None:
            self.current_board = initial_board.copy()
        elif self.move_history and self.board_history:
            try:
                fen = self.board_history[-1]
                self.current_board = chess.Board(fen)
                self.current_move_index = len(self.move_history)
            except:
                self.current_board = chess.Board()
        else:
            self.current_board = chess.Board()
        
        self.move_analysis = []
        self.sf_analysis = None
        
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
        
        print(f"🧠 NEURAL NETWORK DIALOG INICIALIZADO")
        print(f"  - Movimientos: {len(self.move_history)}")
        print(f"  - Estados: {len(self.board_history)}")
        
        self.setup_ui()
        self.update_board_display()
        self.update_position_info()
        self.update_navigation_info()
    
    # ============================================================
    # CALCULAR S CON LOGARITMOS - CORREGIDO
    # ============================================================
    def calculate_s_value(self, board):
        """Calcula el valor S usando logaritmos para evitar overflow"""
        try:
            log_s = 0.0
            for square in chess.SQUARES:
                piece = board.piece_at(square)
                if piece is not None:
                    square_name = chess.square_name(square)
                    casilla_valor = self.mapeo_casillas.get(square_name, 1)
                    pieza_valor = self.valores_piezas.get(piece.symbol(), 1)
                    
                    if casilla_valor <= 0 or pieza_valor <= 0:
                        continue
                    
                    # Usar logaritmos: log(S) = sum(pieza_valor * log(casilla_valor))
                    log_s += pieza_valor * np.log(casilla_valor)
            
            # Convertir de vuelta a S
            s_value = np.exp(log_s)
            
            if s_value <= 0 or s_value == float('inf') or s_value == float('-inf'):
                return None
            return s_value
        except Exception as e:
            print(f"❌ Error calculando S: {e}")
            return None
    
    def calculate_log_s(self, s_value):
        """Calcula Log10(S) de forma segura"""
        if s_value is None:
            return None
        try:
            if isinstance(s_value, (int, float)) and s_value > 0:
                if s_value != float('inf') and s_value != float('-inf'):
                    return np.log10(s_value)
            return None
        except:
            return None
    
    def set_move_history(self, moves, boards):
        print(f"📥 set_move_history: {len(moves) if moves else 0} movimientos")
        self.move_history = moves.copy() if moves else []
        self.board_history = boards.copy() if boards else []
        self.current_move_index = len(self.move_history)
        
        if self.current_move_index > 0 and self.board_history:
            try:
                fen = self.board_history[self.current_move_index - 1]
                self.current_board = chess.Board(fen)
            except Exception as e:
                print(f"Error: {e}")
                self.current_board = chess.Board()
                self.current_move_index = 0
        else:
            self.current_board = chess.Board()
            self.current_move_index = 0
        
        self.update_board_display()
        self.update_position_info()
        self.update_navigation_info()
    
    def update_navigation_info(self):
        total = len(self.move_history)
        current = self.current_move_index
        self.nav_info.setText(self.texts['nav_move'].format(current, total))
        
        self.btn_first.setEnabled(current > 0)
        self.btn_prev.setEnabled(current > 0)
        self.btn_next.setEnabled(current < total)
        self.btn_last.setEnabled(current < total)
    
    def go_to_first(self):
        if self.move_history:
            self.current_move_index = 0
            self.apply_current_position()
    
    def go_to_prev(self):
        if self.current_move_index > 0:
            self.current_move_index -= 1
            self.apply_current_position()
    
    def go_to_next(self):
        if self.current_move_index < len(self.move_history):
            self.current_move_index += 1
            self.apply_current_position()
    
    def go_to_last(self):
        if self.move_history:
            self.current_move_index = len(self.move_history)
            self.apply_current_position()
    
    def apply_current_position(self):
        try:
            if self.current_move_index == 0:
                self.current_board = chess.Board()
            else:
                fen = self.board_history[self.current_move_index - 1]
                self.current_board = chess.Board(fen)
            
            self.update_board_display()
            self.update_position_info()
            self.update_navigation_info()
            
            self.move_analysis = []
            self.prediction_table.setRowCount(0)
            self.best_move_label.setText(self.texts['best_move'] + " -")
            self.confidence_label.setText(self.texts['confidence'] + " -")
            self.btn_show_graph.setEnabled(False)
            self.details_text.clear()
            
        except Exception as e:
            print(f"Error: {e}")
    
    def setup_ui(self):
        self.setWindowTitle(self.texts['window_title'])
        self.setMinimumSize(1000, 650)
        self.resize(1200, 780)
        
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(8, 8, 8, 8)
        main_layout.setSpacing(8)
        
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        scroll.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        
        container = QWidget()
        container_layout = QVBoxLayout(container)
        container_layout.setContentsMargins(5, 5, 5, 5)
        container_layout.setSpacing(8)
        
        top_panel = QWidget()
        top_panel.setMinimumHeight(430)
        top_layout = QHBoxLayout(top_panel)
        top_layout.setContentsMargins(0, 0, 0, 0)
        
        board_container = QWidget()
        board_container.setFixedSize(350, 430)
        board_layout = QVBoxLayout(board_container)
        board_layout.setContentsMargins(0, 0, 0, 0)
        
        board_widget_container = QWidget()
        board_widget_container.setFixedSize(350, 350)
        board_widget_container.setStyleSheet("background-color: #f0f0f0; border: 1px solid #ccc;")
        
        board_inner_layout = QVBoxLayout(board_widget_container)
        board_inner_layout.setContentsMargins(0, 0, 0, 0)
        
        self.board_widget = QSvgWidget()
        self.board_widget.setFixedSize(350, 350)
        board_inner_layout.addWidget(self.board_widget)
        
        board_layout.addWidget(board_widget_container)
        
        nav_container = QWidget()
        nav_container.setFixedHeight(35)
        nav_layout = QHBoxLayout(nav_container)
        nav_layout.setContentsMargins(0, 2, 0, 2)
        nav_layout.setSpacing(3)
        
        self.btn_first = QPushButton(self.texts['nav_first'])
        self.btn_first.setFixedWidth(60)
        self.btn_first.clicked.connect(self.go_to_first)
        self.btn_first.setEnabled(False)
        
        self.btn_prev = QPushButton(self.texts['nav_prev'])
        self.btn_prev.setFixedWidth(60)
        self.btn_prev.clicked.connect(self.go_to_prev)
        self.btn_prev.setEnabled(False)
        
        self.nav_info = QLabel(self.texts['nav_move'].format(0, 0))
        self.nav_info.setStyleSheet("font-weight: bold; font-size: 10px;")
        
        self.btn_next = QPushButton(self.texts['nav_next'])
        self.btn_next.setFixedWidth(60)
        self.btn_next.clicked.connect(self.go_to_next)
        self.btn_next.setEnabled(False)
        
        self.btn_last = QPushButton(self.texts['nav_last'])
        self.btn_last.setFixedWidth(60)
        self.btn_last.clicked.connect(self.go_to_last)
        self.btn_last.setEnabled(False)
        
        nav_layout.addWidget(self.btn_first)
        nav_layout.addWidget(self.btn_prev)
        nav_layout.addWidget(self.nav_info)
        nav_layout.addWidget(self.btn_next)
        nav_layout.addWidget(self.btn_last)
        
        board_layout.addWidget(nav_container)
        
        board_controls = QHBoxLayout()
        self.btn_refresh = QPushButton(self.texts['refresh_board'])
        self.btn_refresh.clicked.connect(self.refresh_board)
        board_controls.addWidget(self.btn_refresh)
        board_controls.addStretch()
        board_layout.addLayout(board_controls)
        
        top_layout.addWidget(board_container)
        
        info_container = QWidget()
        info_layout = QVBoxLayout(info_container)
        info_layout.setContentsMargins(5, 0, 5, 0)
        info_layout.setSpacing(4)
        
        status_group = QGroupBox(self.texts['network_status'])
        status_group.setMaximumHeight(55)
        status_layout = QVBoxLayout(status_group)
        status_layout.setContentsMargins(5, 5, 5, 5)
        self.nn_status = QLabel(self.texts['not_trained'])
        self.nn_status.setStyleSheet("font-weight: bold; font-size: 11px;")
        status_layout.addWidget(self.nn_status)
        info_layout.addWidget(status_group)
        
        pos_group = QGroupBox(self.texts['position_info'])
        pos_group.setMinimumHeight(190)
        pos_layout = QFormLayout(pos_group)
        pos_layout.setContentsMargins(5, 5, 5, 5)
        pos_layout.setSpacing(2)
        
        self.fen_label = QLabel(self.texts['fen'])
        self.fen_value = QLabel()
        self.fen_value.setWordWrap(True)
        self.fen_value.setStyleSheet("font-family: monospace; font-size: 8pt; background: #f0f0f0; padding: 2px;")
        pos_layout.addRow(self.fen_label, self.fen_value)
        
        self.move_count_label = QLabel(self.texts['moves'])
        self.move_count_value = QLabel("0")
        pos_layout.addRow(self.move_count_label, self.move_count_value)
        
        self.piece_count_label = QLabel(self.texts['pieces'])
        self.piece_count_value = QLabel("White: 0 | Black: 0")
        pos_layout.addRow(self.piece_count_label, self.piece_count_value)
        
        self.s_value_label = QLabel(self.texts['s_value'])
        self.s_value_value = QLabel("N/A")
        pos_layout.addRow(self.s_value_label, self.s_value_value)
        
        self.log_s_label = QLabel(self.texts['log_s'])
        self.log_s_value = QLabel("N/A")
        pos_layout.addRow(self.log_s_label, self.log_s_value)
        
        info_layout.addWidget(pos_group)
        
        sf_group = QGroupBox(self.texts['stockfish_ref'])
        sf_group.setMaximumHeight(90)
        sf_layout = QVBoxLayout(sf_group)
        sf_layout.setContentsMargins(5, 5, 5, 5)
        sf_layout.setSpacing(2)
        self.sf_best = QLabel(self.texts['best'] + " -")
        self.sf_score = QLabel(self.texts['score'] + " -")
        sf_layout.addWidget(self.sf_best)
        sf_layout.addWidget(self.sf_score)
        self.btn_sf = QPushButton(self.texts['btn_compare_sf'])
        self.btn_sf.setMaximumHeight(25)
        self.btn_sf.clicked.connect(self.analyze_with_stockfish)
        sf_layout.addWidget(self.btn_sf)
        info_layout.addWidget(sf_group)
        
        train_group = QGroupBox(self.texts['training_group'])
        train_group.setMaximumHeight(110)
        train_layout = QVBoxLayout(train_group)
        train_layout.setContentsMargins(5, 5, 5, 5)
        train_layout.setSpacing(2)
        
        train_buttons = QHBoxLayout()
        train_buttons.setSpacing(3)
        self.btn_train = QPushButton(self.texts['btn_train'])
        self.btn_train.setStyleSheet("background-color: #4CAF50; color: white; font-weight: bold; font-size: 10px;")
        self.btn_train.clicked.connect(self.train_network)
        
        self.btn_analyze = QPushButton(self.texts['btn_analyze'])
        self.btn_analyze.setStyleSheet("background-color: #2196F3; color: white; font-weight: bold; font-size: 10px;")
        self.btn_analyze.clicked.connect(self.analyze_position)
        self.btn_analyze.setEnabled(False)
        
        train_buttons.addWidget(self.btn_train)
        train_buttons.addWidget(self.btn_analyze)
        train_layout.addLayout(train_buttons)
        
        model_buttons = QHBoxLayout()
        model_buttons.setSpacing(3)
        self.btn_save = QPushButton(self.texts['btn_save'])
        self.btn_save.setStyleSheet("background-color: #795548; color: white; font-size: 10px;")
        self.btn_save.clicked.connect(self.save_model)
        self.btn_save.setEnabled(False)
        
        self.btn_load = QPushButton(self.texts['btn_load'])
        self.btn_load.setStyleSheet("background-color: #607D8B; color: white; font-size: 10px;")
        self.btn_load.clicked.connect(self.load_model)
        
        model_buttons.addWidget(self.btn_save)
        model_buttons.addWidget(self.btn_load)
        train_layout.addLayout(model_buttons)
        
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        self.progress_bar.setMaximumHeight(15)
        train_layout.addWidget(self.progress_bar)
        
        info_layout.addWidget(train_group)
        info_layout.addStretch()
        
        top_layout.addWidget(info_container, 1)
        container_layout.addWidget(top_panel)
        
        prediction_group = QGroupBox(self.texts['prediction_group'])
        prediction_group.setStyleSheet("QGroupBox { font-weight: bold; font-size: 11px; }")
        prediction_layout = QVBoxLayout(prediction_group)
        prediction_layout.setContentsMargins(5, 5, 5, 5)
        prediction_layout.setSpacing(3)
        
        self.prediction_table = QTableWidget()
        self.prediction_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.prediction_table.setSelectionBehavior(QTableWidget.SelectRows)
        self.prediction_table.setColumnCount(8)
        self.prediction_table.setHorizontalHeaderLabels([
            self.texts['col_num'],
            self.texts['col_move'],
            self.texts['col_san'],
            self.texts['col_s_value'],
            self.texts['col_log_s'],
            self.texts['col_nn_score'],
            self.texts['col_confidence'],
            self.texts['col_sf_match']
        ])
        self.prediction_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.prediction_table.setMinimumHeight(150)
        self.prediction_table.itemDoubleClicked.connect(self.on_move_double_click)
        prediction_layout.addWidget(self.prediction_table)
        
        summary_widget = QWidget()
        summary_layout = QHBoxLayout(summary_widget)
        summary_layout.setContentsMargins(0, 0, 0, 0)
        summary_layout.setSpacing(10)
        
        self.best_move_label = QLabel(self.texts['best_move'] + " -")
        self.best_move_label.setStyleSheet("font-weight: bold; color: #4CAF50; font-size: 12px;")
        summary_layout.addWidget(self.best_move_label)
        
        self.confidence_label = QLabel(self.texts['confidence'] + " -")
        summary_layout.addWidget(self.confidence_label)
        
        summary_layout.addStretch()
        
        self.btn_show_graph = QPushButton(self.texts['btn_graph'])
        self.btn_show_graph.clicked.connect(self.show_comparison_graph)
        self.btn_show_graph.setEnabled(False)
        self.btn_show_graph.setMaximumHeight(25)
        summary_layout.addWidget(self.btn_show_graph)
        
        prediction_layout.addWidget(summary_widget)
        container_layout.addWidget(prediction_group, 1)
        
        details_group = QGroupBox(self.texts['details_group'])
        details_group.setMaximumHeight(100)
        details_layout = QVBoxLayout(details_group)
        details_layout.setContentsMargins(5, 5, 5, 5)
        details_layout.setSpacing(2)
        
        self.details_text = QTextEdit()
        self.details_text.setReadOnly(True)
        self.details_text.setFont(QFont("Courier New", 8))
        self.details_text.setMaximumHeight(70)
        details_layout.addWidget(self.details_text)
        
        container_layout.addWidget(details_group)
        
        btn_close = QPushButton(self.texts['btn_close'])
        btn_close.setStyleSheet("background-color: #f44336; color: white; padding: 5px; font-weight: bold;")
        btn_close.clicked.connect(self.accept)
        btn_close.setMaximumHeight(30)
        container_layout.addWidget(btn_close)
        
        scroll.setWidget(container)
        main_layout.addWidget(scroll)
    
    def refresh_board(self):
        try:
            if self.current_board:
                self.board_widget.load(chess.svg.board(board=self.current_board, size=350).encode('utf-8'))
                self.update_position_info()
                self.update_navigation_info()
        except Exception as e:
            print(f"Error: {e}")
    
    def update_board_display(self):
        try:
            svg_data = chess.svg.board(board=self.current_board, size=350)
            self.board_widget.load(svg_data.encode('utf-8'))
        except Exception as e:
            print(f"Error: {e}")
    
    def update_position_info(self):
        """Actualiza la información de la posición con S y Log10(S)"""
        if not self.current_board:
            return
        
        fen = self.current_board.fen()
        self.fen_value.setText(fen)
        self.fen_value.setToolTip(fen)
        
        self.move_count_value.setText(str(len(self.current_board.move_stack)))
        
        white_count = 0
        black_count = 0
        for square in chess.SQUARES:
            piece = self.current_board.piece_at(square)
            if piece:
                if piece.color == chess.WHITE:
                    white_count += 1
                else:
                    black_count += 1
        self.piece_count_value.setText(f"White: {white_count} | Black: {black_count}")
        
        # ============================================================
        # CALCULAR S Y LOG10(S)
        # ============================================================
        try:
            s_value = self.calculate_s_value(self.current_board)
            print(f"🔍 S calculado: {s_value}")
            
            if s_value is not None and isinstance(s_value, (int, float)):
                if s_value > 0 and s_value != float('inf'):
                    self.s_value_value.setText(f"{s_value:.2e}")
                    try:
                        log_s = np.log10(s_value)
                        self.log_s_value.setText(f"{log_s:.4f}")
                        print(f"✅ Log10(S): {log_s:.4f}")
                    except Exception as e:
                        print(f"⚠️ Error calculando Log10(S): {e}")
                        self.log_s_value.setText("N/A")
                else:
                    self.s_value_value.setText("N/A")
                    self.log_s_value.setText("N/A")
            else:
                self.s_value_value.setText("N/A")
                self.log_s_value.setText("N/A")
        except Exception as e:
            print(f"❌ Error en update_position_info: {e}")
            self.s_value_value.setText("Error")
            self.log_s_value.setText("N/A")
    
    def analyze_with_stockfish(self):
        if not self.stockfish or not self.stockfish.is_available():
            QMessageBox.warning(self, self.texts['stockfish_not_available'], 
                self.texts['stockfish_not_available'])
            return
            
        try:
            fen = self.current_board.fen()
            self.sf_analysis = self.stockfish.analyze_position(fen, depth=18)
            
            if self.sf_analysis:
                self.sf_best.setText(f"{self.texts['best']} {self.sf_analysis['best_move']} ({self.sf_analysis['best_move_san']})")
                self.sf_score.setText(f"{self.texts['score']} {self.sf_analysis['score']} cp")
                
                if self.is_trained and self.move_analysis:
                    self.compare_with_stockfish(self.sf_analysis)
        except Exception as e:
            QMessageBox.critical(self, "Error", self.texts['analysis_failed'].format(str(e)))
    
    def compare_with_stockfish(self, sf_analysis):
        sf_best = sf_analysis.get('best_move')
        if sf_best is None:
            return
        
        for row in range(self.prediction_table.rowCount()):
            move_item = self.prediction_table.item(row, 1)
            if move_item and move_item.text() == sf_best:
                match_item = self.prediction_table.item(row, 7)
                if match_item:
                    match_item.setText("✓ " + self.texts['match'])
                    match_item.setBackground(QColor(144, 238, 144))
                    match_item.setForeground(QColor(0, 150, 0))
                    for col in range(self.prediction_table.columnCount()):
                        item = self.prediction_table.item(row, col)
                        if item and col != 7:
                            item.setBackground(QColor(200, 255, 200))
            else:
                match_item = self.prediction_table.item(row, 7)
                if match_item and match_item.text() != "✓ " + self.texts['match']:
                    match_item.setText("✗ " + self.texts['no_match'])
                    match_item.setBackground(QColor(255, 200, 200))
                    match_item.setForeground(QColor(200, 0, 0))
    
    def analyze_position(self):
        if not self.is_trained or self.model is None:
            QMessageBox.warning(self, self.texts['not_trained_warning'], 
                self.texts['train_first'])
            return
            
        try:
            legal_moves = list(self.current_board.legal_moves)
            if not legal_moves:
                QMessageBox.warning(self, self.texts['no_moves'], self.texts['no_moves'])
                return
            
            self.move_analysis = []
            self.prediction_table.setRowCount(0)
            
            current_s = self.calculate_s_value(self.current_board)
            current_log_s = self.calculate_log_s(current_s) if current_s else None
            
            for move in legal_moves:
                board_copy = self.current_board.copy()
                board_copy.push(move)
                
                features = self.extract_features(board_copy)
                if features is None:
                    continue
                
                if self.scaler:
                    features_scaled = self.scaler.transform([features])
                else:
                    features_scaled = np.array([features])
                
                prediction = self.model.predict(features_scaled)[0][0]
                
                # ============================================================
                # CALCULAR S Y LOG10(S) PARA CADA MOVIMIENTO
                # ============================================================
                s_value = self.calculate_s_value(board_copy)
                log_s = self.calculate_log_s(s_value) if s_value else None
                
                print(f"  Movimiento {move.uci()}: S={s_value}, Log10(S)={log_s}")
                
                self.move_analysis.append({
                    'move_uci': move.uci(),
                    'move_san': self.current_board.san(move),
                    'move': move,
                    's_value': s_value,
                    'log_s': log_s,
                    'prediction': prediction,
                    'board': board_copy,
                    'sf_match': False
                })
            
            self.move_analysis.sort(key=lambda x: x['prediction'], reverse=True)
            
            self.prediction_table.setRowCount(len(self.move_analysis))
            
            for row, data in enumerate(self.move_analysis):
                num_item = QTableWidgetItem(str(row + 1))
                num_item.setTextAlignment(Qt.AlignCenter)
                self.prediction_table.setItem(row, 0, num_item)
                
                uci_item = QTableWidgetItem(data['move_uci'])
                uci_item.setTextAlignment(Qt.AlignCenter)
                self.prediction_table.setItem(row, 1, uci_item)
                
                san_item = QTableWidgetItem(data['move_san'])
                san_item.setBackground(QColor(240, 240, 240))
                self.prediction_table.setItem(row, 2, san_item)
                
                # S Value
                if data['s_value'] is not None and isinstance(data['s_value'], (int, float)) and data['s_value'] > 0:
                    s_text = f"{data['s_value']:.2e}"
                else:
                    s_text = "N/A"
                s_item = QTableWidgetItem(s_text)
                s_item.setTextAlignment(Qt.AlignRight)
                self.prediction_table.setItem(row, 3, s_item)
                
                # Log10(S)
                if data['log_s'] is not None and isinstance(data['log_s'], (int, float)):
                    log_text = f"{data['log_s']:.4f}"
                else:
                    log_text = "N/A"
                log_item = QTableWidgetItem(log_text)
                log_item.setTextAlignment(Qt.AlignRight)
                self.prediction_table.setItem(row, 4, log_item)
                
                pred_value = data['prediction']
                pred_item = QTableWidgetItem(f"{pred_value:.4f}")
                pred_item.setTextAlignment(Qt.AlignRight)
                
                if pred_value > 0.7:
                    pred_item.setBackground(QColor(144, 238, 144))
                elif pred_value > 0.5:
                    pred_item.setBackground(QColor(255, 255, 144))
                elif pred_value > 0.3:
                    pred_item.setBackground(QColor(255, 200, 150))
                else:
                    pred_item.setBackground(QColor(255, 150, 150))
                
                self.prediction_table.setItem(row, 5, pred_item)
                
                conf_item = QTableWidgetItem(f"{pred_value * 100:.1f}%")
                conf_item.setTextAlignment(Qt.AlignCenter)
                if pred_value > 0.7:
                    conf_item.setForeground(QColor(0, 150, 0))
                elif pred_value > 0.5:
                    conf_item.setForeground(QColor(150, 150, 0))
                else:
                    conf_item.setForeground(QColor(200, 0, 0))
                self.prediction_table.setItem(row, 6, conf_item)
                
                match_item = QTableWidgetItem("—")
                match_item.setTextAlignment(Qt.AlignCenter)
                self.prediction_table.setItem(row, 7, match_item)
            
            if self.move_analysis:
                best = self.move_analysis[0]
                self.best_move_label.setText(
                    self.texts['best_move_text'].format(best['move_san'], best['move_uci'])
                )
                self.confidence_label.setText(
                    self.texts['confidence_text'].format(best['prediction'] * 100)
                )
                
                for col in range(self.prediction_table.columnCount()):
                    item = self.prediction_table.item(0, col)
                    if item:
                        item.setBackground(QColor(200, 230, 255))
            
            if self.sf_analysis:
                self.compare_with_stockfish(self.sf_analysis)
            
            details = "=" * 60 + "\n"
            details += "📊 NEURAL NETWORK PREDICTIONS\n"
            details += "=" * 60 + "\n\n"
            details += f"Position: {self.current_board.fen()}\n"
            details += f"Legal moves: {len(legal_moves)}\n"
            if current_s is not None and isinstance(current_s, (int, float)) and current_s > 0:
                details += f"Current S Value: {current_s:.2e}\n"
                if current_log_s is not None:
                    details += f"Current Log10(S): {current_log_s:.4f}\n"
            details += "\n"
            
            if self.move_analysis:
                details += "Top 5 NN Predictions:\n"
                details += "-" * 60 + "\n"
                for i, data in enumerate(self.move_analysis[:5]):
                    s_val = f"{data['s_value']:.2e}" if data['s_value'] else "N/A"
                    log_val = f"{data['log_s']:.4f}" if data['log_s'] is not None else "N/A"
                    details += f"{i+1}. {data['move_san']:10s} | NN: {data['prediction'] * 100:6.1f}% | S: {s_val} | Log: {log_val}\n"
            
            self.details_text.setText(details)
            self.btn_show_graph.setEnabled(True)
            
        except Exception as e:
            QMessageBox.critical(self, "Error", self.texts['analysis_failed'].format(str(e)))
    
    def extract_features(self, board):
        try:
            features = []
            white_material = 0
            black_material = 0
            white_count = 0
            black_count = 0
            
            for square in chess.SQUARES:
                piece = board.piece_at(square)
                if piece:
                    value = self.get_piece_value(piece.piece_type)
                    if piece.color == chess.WHITE:
                        white_material += value
                        white_count += 1
                    else:
                        black_material += value
                        black_count += 1
            
            features.extend([white_material, black_material, white_material - black_material, white_count + black_count])
            
            center_squares = [chess.E4, chess.D4, chess.E5, chess.D5]
            center_control = 0
            for square in center_squares:
                center_control += len(board.attackers(chess.WHITE, square))
                center_control -= len(board.attackers(chess.BLACK, square))
            features.append(center_control)
            
            mobility = 0
            for square in chess.SQUARES:
                piece = board.piece_at(square)
                if piece and piece.color == chess.WHITE:
                    mobility += len(board.attacks(square))
                elif piece and piece.color == chess.BLACK:
                    mobility -= len(board.attacks(square))
            features.append(mobility / 10.0)
            
            king_safety = 0
            for color in [chess.WHITE, chess.BLACK]:
                king_square = board.king(color)
                if king_square:
                    pawns = board.pieces(chess.PAWN, color)
                    for pawn in pawns:
                        if abs(chess.square_rank(pawn) - chess.square_rank(king_square)) <= 1 and \
                           abs(chess.square_file(pawn) - chess.square_file(king_square)) <= 1:
                            king_safety += 1 if color == chess.WHITE else -1
            features.append(king_safety)
            
            pawn_structure = 0
            for color in [chess.WHITE, chess.BLACK]:
                pawns = board.pieces(chess.PAWN, color)
                pawn_files = [chess.square_file(p) for p in pawns]
                for file in set(pawn_files):
                    count = pawn_files.count(file)
                    if count > 1:
                        pawn_structure += (count - 1) if color == chess.WHITE else -(count - 1)
            features.append(pawn_structure)
            
            features.append(sum(features[:8]) / 10.0)
            
            return np.array(features)
        except Exception as e:
            print(f"Error extracting features: {e}")
            return None
    
    def get_piece_value(self, piece_type):
        values = {
            chess.PAWN: 1,
            chess.KNIGHT: 3,
            chess.BISHOP: 3,
            chess.ROOK: 5,
            chess.QUEEN: 9,
            chess.KING: 100
        }
        return values.get(piece_type, 0)
    
    def on_move_double_click(self, item):
        row = item.row()
        if row < len(self.move_analysis):
            data = self.move_analysis[row]
            board = data['board']
            self.current_board = board.copy()
            self.update_board_display()
            self.update_position_info()
            QMessageBox.information(self, self.texts['move_applied'], 
                self.texts['move_applied_msg'].format(data['move_san']))
    
    def show_comparison_graph(self):
        if not self.move_analysis:
            return
            
        try:
            import matplotlib
            matplotlib.use('Qt5Agg')
            from matplotlib import pyplot as plt
            from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
            
            dialog = QDialog(self)
            dialog.setWindowTitle(self.texts['graph_title'])
            dialog.setMinimumSize(800, 450)
            
            layout = QVBoxLayout(dialog)
            fig, ax = plt.subplots(figsize=(10, 4))
            
            moves = [d['move_san'] for d in self.move_analysis[:10]]
            scores = [d['prediction'] * 100 for d in self.move_analysis[:10]]
            colors = []
            for score in scores:
                if score > 70:
                    colors.append('green')
                elif score > 50:
                    colors.append('orange')
                else:
                    colors.append('red')
            
            bars = ax.bar(moves, scores, color=colors, alpha=0.7)
            ax.set_ylim(0, 100)
            ax.set_ylabel(self.texts['graph_score'])
            ax.set_title(self.texts['graph_title'])
            ax.grid(True, alpha=0.3, axis='y')
            
            for bar, score in zip(bars, scores):
                height = bar.get_height()
                ax.text(bar.get_x() + bar.get_width()/2., height + 1,
                        f'{score:.1f}%', ha='center', va='bottom', fontsize=9)
            
            plt.tight_layout()
            canvas = FigureCanvas(fig)
            layout.addWidget(canvas)
            
            btn_close = QPushButton(self.texts['graph_close'])
            btn_close.clicked.connect(dialog.accept)
            layout.addWidget(btn_close)
            
            dialog.exec_()
            
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Could not show graph: {str(e)}")
    
    # ============================================================
    # <--- CORRECCIÓN: train_network - GUARDA SCALER --->
    # ============================================================
    def train_network(self):
        if not self.db:
            QMessageBox.warning(self, self.texts['no_database'], self.texts['no_database'])
            return
            
        try:
            positions = self.db.get_positions_summary(2000)
            if len(positions) < 10:
                QMessageBox.warning(self, self.texts['not_enough_data'].format(len(positions)), 
                    self.texts['not_enough_data'].format(len(positions)))
                return
                
            self.progress_bar.setVisible(True)
            self.progress_bar.setValue(0)
            self.btn_train.setEnabled(False)
            
            X = []
            y = []
            
            for i, pos in enumerate(positions):
                try:
                    board = chess.Board(pos['fen'])
                    features = self.extract_features(board)
                    
                    if features is not None:
                        X.append(features)
                        winrate = pos.get('winrate_white', 0.5)
                        y.append(winrate)
                        
                except Exception as e:
                    continue
                    
                progress = int((i + 1) / len(positions) * 50)
                self.progress_bar.setValue(progress)
                self.progress_bar.setFormat(self.texts['extracting_features'])
                QApplication.processEvents()
                
            if len(X) < 10:
                QMessageBox.warning(self, self.texts['not_enough_data'].format(len(X)), 
                    self.texts['not_enough_data'].format(len(X)))
                self.progress_bar.setVisible(False)
                self.btn_train.setEnabled(True)
                return
                
            X = np.array(X)
            y = np.array(y)
            
            self.progress_bar.setValue(60)
            self.progress_bar.setFormat(self.texts['training_model'])
            QApplication.processEvents()
            
            # ============================================================
            # <--- NUEVO: Guardar el scaler para usarlo después --->
            # ============================================================
            self.scaler = StandardScaler()
            X_scaled = self.scaler.fit_transform(X)
            
            self.progress_bar.setValue(70)
            QApplication.processEvents()
            
            if TF_AVAILABLE:
                self.model = models.Sequential([
                    layers.Dense(64, activation='relu', input_shape=(X.shape[1],)),
                    layers.Dropout(0.2),
                    layers.Dense(32, activation='relu'),
                    layers.Dropout(0.2),
                    layers.Dense(16, activation='relu'),
                    layers.Dense(1, activation='linear')
                ])
                
                self.model.compile(optimizer='adam', loss='mse', metrics=['mae'])
                
                self.progress_bar.setValue(80)
                QApplication.processEvents()
                
                history = self.model.fit(
                    X_scaled, y,
                    epochs=50,
                    batch_size=16,
                    validation_split=0.2,
                    verbose=0
                )
                
                self.is_trained = True
                self.training_accuracy = 1 - history.history['mae'][-1]
                self.output_dim = 1
                
            elif SKLEARN_AVAILABLE:
                self.model = RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42)
                self.model.fit(X_scaled, y)
                
                self.is_trained = True
                predictions = self.model.predict(X_scaled)
                mse = mean_squared_error(y, predictions)
                r2 = r2_score(y, predictions)
                self.training_accuracy = r2
                self.output_dim = 1
            else:
                QMessageBox.warning(self, "No ML Libraries", self.texts['no_ml_libs'])
                self.progress_bar.setVisible(False)
                self.btn_train.setEnabled(True)
                return
                
            self.progress_bar.setValue(100)
            QApplication.processEvents()
            
            self.btn_analyze.setEnabled(True)
            self.btn_save.setEnabled(True)
            
            status_text = self.texts['trained'].format(f"{self.training_accuracy:.2%}")
            self.nn_status.setText(status_text)
            
            QMessageBox.information(self, self.texts['training_complete'], 
                self.texts['training_msg'].format(len(X), X.shape[1], self.training_accuracy))
                
            self.progress_bar.setVisible(False)
            self.btn_train.setEnabled(True)
            
        except Exception as e:
            self.progress_bar.setVisible(False)
            self.btn_train.setEnabled(True)
            QMessageBox.critical(self, "Error", self.texts['analysis_failed'].format(str(e)))
    
    # ============================================================
    # <--- CORRECCIÓN: save_model - GUARDA SCALER Y METADATA --->
    # ============================================================
    def save_model(self):
        if not self.is_trained or self.model is None:
            QMessageBox.warning(self, self.texts['no_model'], self.texts['no_model'])
            return
            
        try:
            # Crear carpeta models si no existe
            base_dir = os.path.dirname(os.path.abspath(__file__))
            models_dir = os.path.join(base_dir, "models")
            os.makedirs(models_dir, exist_ok=True)
            
            # Generar nombre base con timestamp y precisión
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            acc_str = f"{self.training_accuracy:.3f}".replace('.', '_')
            base_name = os.path.join(models_dir, f"neural_model_{timestamp}_acc{acc_str}")
            
            file_name, _ = QFileDialog.getSaveFileName(
                self, self.texts['btn_save'], base_name, 
                "H5 Model (*.h5);;Joblib Files (*.joblib);;All Files (*)"
            )
            
            if file_name:
                base_name = file_name.replace(".h5", "").replace(".joblib", "")
                
                # 1. Guardar modelo
                if TF_AVAILABLE and hasattr(self.model, 'save'):
                    self.model.save(f"{base_name}.h5")
                elif SKLEARN_AVAILABLE:
                    import joblib
                    joblib.dump(self.model, f"{base_name}.joblib")
                else:
                    QMessageBox.warning(self, "Error", "No se puede guardar el modelo")
                    return
                
                # 2. Guardar Scaler
                if self.scaler:
                    with open(f"{base_name}_scaler.pkl", 'wb') as f:
                        pickle.dump(self.scaler, f)
                
                # 3. Guardar metadata
                metadata = {
                    "input_dim": 9,
                    "output_dim": self.output_dim,
                    "accuracy": float(self.training_accuracy) if self.training_accuracy else 0,
                    "is_trained": self.is_trained,
                    "created_at": datetime.datetime.now().isoformat(),
                    "version": "1.0"
                }
                with open(f"{base_name}_metadata.json", 'w', encoding='utf-8') as f:
                    json.dump(metadata, f, indent=4, ensure_ascii=False)
                
                QMessageBox.information(self, self.texts['training_complete'], 
                    self.texts['model_saved'].format(file_name))
                
        except Exception as e:
            QMessageBox.critical(self, "Error", self.texts['save_failed'].format(str(e)))
    
    # ============================================================
    # <--- CORRECCIÓN: load_model - CARGA SCALER Y METADATA --->
    # ============================================================
    def load_model(self):
        try:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            models_dir = os.path.join(base_dir, "models")
            os.makedirs(models_dir, exist_ok=True)
            
            file_name, _ = QFileDialog.getOpenFileName(
                self, self.texts['btn_load'], models_dir, 
                "H5 Model (*.h5);;Joblib Files (*.joblib);;All Files (*)"
            )
            
            if file_name:
                base_name = file_name.replace(".h5", "").replace(".joblib", "")
                
                # 1. Cargar modelo
                if file_name.endswith('.h5') and TF_AVAILABLE:
                    self.model = keras.models.load_model(file_name)
                    self.is_trained = True
                    self.output_dim = 1
                elif (file_name.endswith('.joblib') or file_name.endswith('.pkl')) and SKLEARN_AVAILABLE:
                    import joblib
                    self.model = joblib.load(file_name)
                    self.is_trained = True
                    self.output_dim = 1
                else:
                    QMessageBox.warning(self, "Error", self.texts['cannot_load'])
                    return
                
                # 2. Cargar Scaler
                scaler_path = f"{base_name}_scaler.pkl"
                if os.path.exists(scaler_path):
                    with open(scaler_path, 'rb') as f:
                        self.scaler = pickle.load(f)
                
                # 3. Cargar metadata
                meta_path = f"{base_name}_metadata.json"
                if os.path.exists(meta_path):
                    with open(meta_path, 'r', encoding='utf-8') as f:
                        metadata = json.load(f)
                        self.training_accuracy = metadata.get('accuracy', 0)
                        self.output_dim = metadata.get('output_dim', 1)
                    
                    status_text = self.texts['trained'].format(f"{self.training_accuracy:.2%}")
                    self.nn_status.setText(status_text)
                else:
                    self.nn_status.setText(self.texts['trained'].format("loaded"))
                
                self.btn_analyze.setEnabled(True)
                self.btn_save.setEnabled(True)
                
                QMessageBox.information(self, self.texts['training_complete'], 
                    self.texts['model_loaded'])
                
        except Exception as e:
            QMessageBox.critical(self, "Error", self.texts['load_failed'].format(str(e)))
    
    def set_board(self, board):
        if board is not None:
            self.current_board = board.copy()
            self.update_board_display()
            self.update_position_info()
    
    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.update_board_display()


# ============================================================================
# FUNCIÓN DE ACCESO RÁPIDO
# ============================================================================
def open_neural_network_dialog(parent=None, db=None, stockfish=None, lang='en', initial_board=None):
    move_history = []
    board_history = []
    
    if parent:
        if hasattr(parent, 'move_list'):
            move_history = parent.move_list
        if hasattr(parent, 'board_states'):
            board_history = parent.board_states
    
    dialog = NeuralNetworkDialog(
        parent=parent,
        db=db,
        stockfish=stockfish,
        lang=lang,
        initial_board=initial_board,
        move_history=move_history,
        board_history=board_history
    )
    
    return dialog.exec_()