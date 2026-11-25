"""
INTEGRACIÓN DE RED NEURONAL CON CHESSANALYZER
Agrega funcionalidad de red neuronal a la aplicación principal
"""

import os
import sys
from PyQt5.QtWidgets import QApplication, QMessageBox
from PyQt5.QtCore import QThread, pyqtSignal

# Importar el módulo de red neuronal
try:
    from neural_network import ChessNeuralNetwork, NeuralNetworkDialog
    NEURAL_AVAILABLE = True
except ImportError:
    NEURAL_AVAILABLE = False
    print("Módulo neural_network no encontrado")

class NeuralTrainingThread(QThread):
    """Hilo para entrenar la red neuronal sin bloquear la interfaz"""
    
    progress = pyqtSignal(int, str)
    finished = pyqtSignal(dict)
    error = pyqtSignal(str)
    
    def __init__(self, db, stockfish=None):
        super().__init__()
        self.db = db
        self.stockfish = stockfish
        self.nn = ChessNeuralNetwork() if NEURAL_AVAILABLE else None
    
    def run(self):
        if not self.nn:
            self.error.emit("Red neuronal no disponible")
            return
        
        try:
            self.progress.emit(0, "Recopilando datos de la base de datos...")
            
            # Obtener posiciones
            positions = self.db.get_positions_summary(limit=500)
            
            if len(positions) < 50:
                self.error.emit("Posiciones insuficientes para entrenar (mínimo 50)")
                return
            
            self.progress.emit(20, f"Procesando {len(positions)} posiciones...")
            
            # Entrenar
            result = self.nn.train_from_database(self.db, self.stockfish)
            
            self.progress.emit(100, "Entrenamiento completado")
            self.finished.emit(result)
            
        except Exception as e:
            self.error.emit(f"Error en entrenamiento: {str(e)}")


# ============================================================================
# FUNCIONES DE EXTENSIÓN PARA ChessAnalyzer
# ============================================================================
def extend_chess_analyzer_for_neural(analyzer):
    """
    Extiende la clase ChessAnalyzer con funcionalidad de red neuronal
    
    Args:
        analyzer: Instancia de ChessAnalyzer
    """
    
    if not NEURAL_AVAILABLE:
        print("Red neuronal no disponible")
        return
    
    # Guardar referencia a la red neuronal
    analyzer.neural_network = ChessNeuralNetwork()
    analyzer.neural_training_thread = None
    
    # Sobrescribir el método open_neural_network
    def open_neural_network_extended(self):
        """Versión extendida del método open_neural_network"""
        try:
            dialog = NeuralNetworkDialog(
                parent=self,
                db=self.position_db,
                stockfish=self.stockfish_engine
            )
            dialog.exec_()
        except Exception as e:
            QMessageBox.critical(self, "Error", 
                f"Error abriendo la red neuronal:\n{str(e)}")
    
    analyzer.open_neural_network = open_neural_network_extended.__get__(analyzer)
    
    # Agregar método para entrenar en segundo plano
    def train_neural_background(self):
        """Entrena la red neuronal en segundo plano"""
        if not NEURAL_AVAILABLE:
            QMessageBox.warning(self, "Advertencia", 
                "TensorFlow no está instalado. No se puede entrenar la red.")
            return
        
        if self.neural_training_thread and self.neural_training_thread.isRunning():
            QMessageBox.warning(self, "Advertencia", 
                "Ya hay un entrenamiento en curso")
            return
        
        self.neural_training_thread = NeuralTrainingThread(
            self.position_db,
            self.stockfish_engine
        )
        
        # Conectar señales
        self.neural_training_thread.progress.connect(self.on_training_progress)
        self.neural_training_thread.finished.connect(self.on_training_finished)
        self.neural_training_thread.error.connect(self.on_training_error)
        
        # Iniciar
        self.neural_training_thread.start()
        
        QMessageBox.information(self, "Entrenamiento", 
            "Entrenamiento iniciado en segundo plano. "
            "Puedes continuar usando la aplicación.")
    
    analyzer.train_neural_background = train_neural_background.__get__(analyzer)
    
    # Agregar métodos de callback
    def on_training_progress(self, value, message):
        """Callback de progreso del entrenamiento"""
        self.statusBar().showMessage(f"Red Neuronal: {message} ({value}%)")
    
    def on_training_finished(self, result):
        """Callback cuando termina el entrenamiento"""
        if 'error' in result:
            QMessageBox.warning(self, "Entrenamiento", 
                f"Error en entrenamiento: {result['error']}")
        else:
            accuracy = result.get('evaluation', {}).get('accuracy', 0)
            QMessageBox.information(self, "Entrenamiento completado",
                f"Red neuronal entrenada exitosamente!\n"
                f"Precisión: {accuracy:.2%}\n"
                f"Muestras: {result.get('samples_trained', 0)}")
        
        self.statusBar().showMessage("Listo")
    
    def on_training_error(self, error_msg):
        """Callback de error del entrenamiento"""
        QMessageBox.critical(self, "Error en entrenamiento", error_msg)
        self.statusBar().showMessage("Error en entrenamiento")
    
    analyzer.on_training_progress = on_training_progress.__get__(analyzer)
    analyzer.on_training_finished = on_training_finished.__get__(analyzer)
    analyzer.on_training_error = on_training_error.__get__(analyzer)


# ============================================================================
# FUNCIÓN PARA AGREGAR BOTÓN DE RED NEURONAL
# ============================================================================
def add_neural_network_button(analyzer):
    """
    Agrega un botón adicional en la interfaz para entrenar la red en segundo plano
    """
    if not NEURAL_AVAILABLE:
        return
    
    # Buscar el botón existente de red neuronal
    for widget in analyzer.findChildren(QPushButton):
        if widget.text() == analyzer.translate("neural_network"):
            # Agregar un menú contextual o acción adicional
            widget.setToolTip("Abrir red neuronal (Entrenar en segundo plano con Ctrl+Click)")
            
            # Guardar el comportamiento original
            original_click = widget.clicked
            
            # Crear nuevo comportamiento
            def enhanced_click():
                # Si se hace Ctrl+Click, entrenar en segundo plano
                if QApplication.keyboardModifiers() == Qt.ControlModifier:
                    analyzer.train_neural_background()
                else:
                    analyzer.open_neural_network()
            
            widget.clicked.connect(enhanced_click)
            break


# ============================================================================
# FUNCIÓN DE INICIALIZACIÓN
# ============================================================================
def init_neural_network(analyzer):
    """
    Inicializa la red neuronal en la aplicación
    """
    if not NEURAL_AVAILABLE:
        print("Red neuronal no disponible - TensorFlow no instalado")
        return
    
    print("Inicializando red neuronal...")
    
    # Extender el analizador
    extend_chess_analyzer_for_neural(analyzer)
    
    # Agregar botón mejorado
    add_neural_network_button(analyzer)
    
    # Intentar cargar el último modelo automáticamente
    model_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
    if os.path.exists(model_dir):
        models = [d for d in os.listdir(model_dir) 
                 if os.path.isdir(os.path.join(model_dir, d)) and d.startswith("chess_nn_")]
        if models:
            latest_model = sorted(models)[-1]
            model_path = os.path.join(model_dir, latest_model)
            if analyzer.neural_network.load_model(model_path):
                print(f"Modelo de red neuronal cargado: {latest_model}")
            else:
                print("No se pudo cargar el modelo automáticamente")
    
    print("Red neuronal inicializada correctamente")