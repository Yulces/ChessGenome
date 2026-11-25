"""
Aritmética de precisión arbitraria (números enteros como strings).

Traducción y ampliación del módulo calcular.bas (Visual Basic 6).

Operaciones:
    add(a, b)       → a + b
    sub(a, b)       → a - b
    mul(a, b)       → a * b
    div(a, b)       → (cociente, resto)   división entera completa
    divmod_str      alias de div
    power(base, exp)→ base ** exp
    compare(a, b)   → -1 | 0 | 1
    is_zero(n)      → bool
    normalize(n)    → quita ceros a la izquierda y signo

También se ofrecen wrappers nativos de Python (más rápidos) que producen
el mismo resultado.
"""

from __future__ import annotations

from typing import Tuple, Union


# ===========================================================================
# Utilidades
# ===========================================================================

def normalize(n: str) -> str:
    """Quita ceros a la izquierda y normaliza el signo. '0' se queda como '0'."""
    if not n or n.strip() == "":
        return "0"
    n = n.strip()
    neg = n.startswith("-")
    if neg:
        n = n[1:]
    n = n.lstrip("0") or "0"
    if n == "0":
        return "0"
    return ("-" + n) if neg else n


def is_zero(n: str) -> bool:
    return normalize(n) == "0"


def compare(a: str, b: str) -> int:
    """
    Compara dos enteros en string.
    Devuelve -1 si a < b, 0 si a == b, 1 si a > b.
    """
    a = normalize(a)
    b = normalize(b)
    neg_a = a.startswith("-")
    neg_b = b.startswith("-")

    if neg_a and not neg_b:
        return -1
    if not neg_a and neg_b:
        return 1

    # Ambos mismos signo
    aa = a[1:] if neg_a else a
    bb = b[1:] if neg_b else b

    if len(aa) != len(bb):
        cmp = 1 if len(aa) > len(bb) else -1
    else:
        if aa == bb:
            return 0
        cmp = 1 if aa > bb else -1

    return -cmp if neg_a else cmp


def _abs(n: str) -> str:
    n = normalize(n)
    return n[1:] if n.startswith("-") else n


# ===========================================================================
# SUMA
# ===========================================================================

def add(a: str, b: str) -> str:
    """Suma de dos enteros arbitrarios (strings). Equivalente a AddLargeNumbers."""
    a = normalize(a)
    b = normalize(b)

    # Casos con signos
    if a.startswith("-") and b.startswith("-"):
        return "-" + _add_positive(_abs(a), _abs(b))
    if a.startswith("-"):
        return sub(b, _abs(a))
    if b.startswith("-"):
        return sub(a, _abs(b))

    return _add_positive(a, b)


def _add_positive(a: str, b: str) -> str:
    """Suma de dos números positivos (sin signo)."""
    a = a.lstrip("0") or "0"
    b = b.lstrip("0") or "0"
    max_len = max(len(a), len(b))
    a = a.zfill(max_len)
    b = b.zfill(max_len)

    carry = 0
    result = []
    for i in range(max_len - 1, -1, -1):
        s = int(a[i]) + int(b[i]) + carry
        result.append(str(s % 10))
        carry = s // 10
    if carry:
        result.append(str(carry))
    return "".join(reversed(result)).lstrip("0") or "0"


# ===========================================================================
# RESTA
# ===========================================================================

def sub(a: str, b: str) -> str:
    """Resta a - b. Equivalente a SubtractLong (mejorado)."""
    a = normalize(a)
    b = normalize(b)

    if b.startswith("-"):
        return add(a, _abs(b))          # a - (-b) = a + b
    if a.startswith("-"):
        return "-" + add(_abs(a), b)    # -a - b = -(a + b)

    # Ambos positivos
    cmp = compare(a, b)
    if cmp == 0:
        return "0"
    if cmp < 0:
        return "-" + _sub_positive(b, a)
    return _sub_positive(a, b)


def _sub_positive(a: str, b: str) -> str:
    """Resta de dos positivos con a >= b."""
    a = a.lstrip("0") or "0"
    b = b.lstrip("0") or "0"
    max_len = len(a)
    b = b.zfill(max_len)
    a_list = list(a)

    result = []
    for i in range(max_len - 1, -1, -1):
        da = int(a_list[i])
        db = int(b[i])
        if da >= db:
            result.append(str(da - db))
        else:
            j = i - 1
            while j >= 0 and a_list[j] == "0":
                a_list[j] = "9"
                j -= 1
            if j >= 0:
                a_list[j] = str(int(a_list[j]) - 1)
            result.append(str(10 + da - db))

    return "".join(reversed(result)).lstrip("0") or "0"


# ===========================================================================
# MULTIPLICACIÓN
# ===========================================================================

def mul(a: str, b: str) -> str:
    """Multiplicación. Equivalente a MultiplyLargeNumbers."""
    a = normalize(a)
    b = normalize(b)

    if is_zero(a) or is_zero(b):
        return "0"

    neg = (a.startswith("-")) != (b.startswith("-"))
    result = _mul_positive(_abs(a), _abs(b))
    return ("-" + result) if neg else result


def _mul_positive(a: str, b: str) -> str:
    a = a.lstrip("0") or "0"
    b = b.lstrip("0") or "0"

    # Algoritmo clásico dígito a dígito (igual que el VB6)
    product_holder = "0"
    for b_idx in range(len(b) - 1, -1, -1):
        digit_b = int(b[b_idx])
        if digit_b == 0:
            continue
        carry = 0
        partial_digits = []
        for a_idx in range(len(a) - 1, -1, -1):
            prod = digit_b * int(a[a_idx]) + carry
            partial_digits.append(str(prod % 10))
            carry = prod // 10
        if carry:
            partial_digits.append(str(carry))
        partial = "".join(reversed(partial_digits))
        zeros = len(b) - 1 - b_idx
        if zeros:
            partial += "0" * zeros
        product_holder = _add_positive(partial, product_holder)

    return product_holder.lstrip("0") or "0"


# ===========================================================================
# DIVISIÓN (entera completa)
# ===========================================================================

def div(a: str, b: str) -> Tuple[str, str]:
    """
    División entera: devuelve (cociente, resto).
    a = cociente * b + resto,  0 <= resto < |b|

    Equivalente a una Dividir completa (no solo por 2).
    """
    a = normalize(a)
    b = normalize(b)

    if is_zero(b):
        raise ZeroDivisionError("División por cero")

    if is_zero(a):
        return "0", "0"

    neg_quot = (a.startswith("-")) != (b.startswith("-"))
    neg_rem = a.startswith("-")

    aa = _abs(a)
    bb = _abs(b)

    if compare(aa, bb) < 0:
        # |a| < |b| → cociente 0, resto = a
        rem = normalize(a)
        return "0", rem

    # División larga clásica
    quotient_digits = []
    remainder = "0"

    for digit in aa:
        # remainder = remainder * 10 + digit
        remainder = _add_positive(_mul_positive(remainder, "10"), digit)
        # cuántas veces cabe bb en remainder
        qdigit = 0
        while compare(remainder, bb) >= 0:
            remainder = _sub_positive(remainder, bb)
            qdigit += 1
        quotient_digits.append(str(qdigit))

    quot = "".join(quotient_digits).lstrip("0") or "0"
    rem = remainder.lstrip("0") or "0"

    if neg_quot and quot != "0":
        quot = "-" + quot
    if neg_rem and rem != "0":
        rem = "-" + rem

    return quot, rem


def divmod_str(a: str, b: str) -> Tuple[str, str]:
    """Alias de div."""
    return div(a, b)


def divide_by_small(numer: str, divisor: int) -> str:
    """División por un entero pequeño (optimizada). Traducción de DividirPorDos."""
    if divisor <= 0:
        raise ValueError("Divisor debe ser positivo")
    numer = normalize(numer)
    if is_zero(numer):
        return "0"

    neg = numer.startswith("-")
    numer = _abs(numer)

    quotient = []
    remainder = 0
    for ch in numer:
        remainder = remainder * 10 + int(ch)
        quotient.append(str(remainder // divisor))
        remainder %= divisor

    res = "".join(quotient).lstrip("0") or "0"
    return ("-" + res) if neg and res != "0" else res


# ===========================================================================
# POTENCIA
# ===========================================================================

def power(base: str, exp: Union[str, int]) -> str:
    """
    Potencia base ** exp (exp >= 0).
    Traducción de PowerLargeNumbers + exponenciación rápida.
    """
    base = normalize(base)
    e = int(exp)
    if e < 0:
        raise ValueError("Exponente negativo no soportado (solo enteros)")
    if e == 0:
        return "1"
    if is_zero(base):
        return "0"
    if e == 1:
        return base

    # Exponenciación binaria (mucho más rápida que el bucle lineal del VB6)
    result = "1"
    b = base
    while e > 0:
        if e & 1:
            result = mul(result, b)
        b = mul(b, b)
        e >>= 1
    return result


# ===========================================================================
# Cálculo de S del Genoma (usando este módulo o nativo)
# ===========================================================================

def compute_S_exact_string(exponents: list, primes: tuple) -> str:
    """S = ∏ (p_i ** v_i) usando solo operaciones string."""
    S = "1"
    for i, v in enumerate(exponents):
        if v > 0:
            powered = power(str(primes[i]), v)
            S = mul(S, powered)
    return S


def compute_S_exact_native(exponents: list, primes: tuple) -> str:
    """S = ∏ (p_i ** v_i) con enteros nativos de Python (recomendado)."""
    S = 1
    for i, v in enumerate(exponents):
        if v > 0:
            S *= primes[i] ** v
    return str(S)


# ===========================================================================
# Aliases con los nombres originales del VB6 (compatibilidad)
# ===========================================================================

AddLargeNumbers = add
MultiplyLargeNumbers = mul
PowerLargeNumbers = power
SubtractLong = sub
DividirPorDos = divide_by_small
