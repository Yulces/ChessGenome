# translations.py
# Archivo completo de traducciones para ChessAnalyzer

SEARCH_DIALOG_TEXTS = {
    # ... (copia el diccionario completo de arriba)
}

EDITOR_DIALOG_TEXTS = {
    # ... (copia el diccionario completo de arriba)
}

# Diccionario con todos los idiomas disponibles
AVAILABLE_LANGUAGES = {
    'en': 'English',
    'es': 'Español',
    'de': 'Deutsch'
}

# Función helper para obtener textos
def get_translation(dialog_type, key, lang='es'):
    """
    Obtiene una traducción específica
    
    Args:
        dialog_type: 'search' o 'editor'
        key: clave del texto a traducir
        lang: código de idioma ('en', 'es', 'de')
    
    Returns:
        str: Texto traducido o el key si no se encuentra
    """
    if dialog_type == 'search':
        texts = SEARCH_DIALOG_TEXTS.get(lang, SEARCH_DIALOG_TEXTS['en'])
    elif dialog_type == 'editor':
        texts = EDITOR_DIALOG_TEXTS.get(lang, EDITOR_DIALOG_TEXTS['en'])
    else:
        return key
        
    return texts.get(key, key)