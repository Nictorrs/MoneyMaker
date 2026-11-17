"""Catálogo de categorías compartido por el parser de reglas, la IA y la app."""
from __future__ import annotations

EXPENSE_CATEGORIES = (
    "food",
    "groceries",
    "transport",
    "housing",
    "utilities",
    "health",
    "entertainment",
    "subscriptions",
    "shopping",
    "education",
    "travel",
    "transfer",
    "other",
)
INCOME_CATEGORIES = ("salary", "freelance", "transfer", "other")
ALL_CATEGORIES = tuple(dict.fromkeys(EXPENSE_CATEGORIES + INCOME_CATEGORIES))

LABELS_ES = {
    "food": "Comida",
    "groceries": "Mercado",
    "transport": "Transporte",
    "housing": "Vivienda",
    "utilities": "Servicios",
    "health": "Salud",
    "entertainment": "Entretenimiento",
    "subscriptions": "Suscripciones",
    "shopping": "Compras",
    "education": "Educación",
    "travel": "Viajes",
    "transfer": "Transferencias",
    "salary": "Salario",
    "freelance": "Freelance",
    "other": "Otros",
}

# Pistas para el prompt de la IA: qué cae en cada categoría.
HINTS_ES = {
    "food": "restaurantes, domicilios, cafés, comida preparada",
    "groceries": "supermercado, tiendas de barrio, víveres",
    "transport": "taxi, apps de movilidad, bus, gasolina, peajes, parqueadero",
    "housing": "arriendo, hipoteca, administración",
    "utilities": "luz, agua, gas, internet, plan de celular",
    "health": "farmacia, citas médicas, medicina prepagada, gimnasio",
    "entertainment": "cine, conciertos, salidas, videojuegos",
    "subscriptions": "streaming y software con cobro recurrente",
    "shopping": "ropa, tecnología, regalos, compras en línea",
    "education": "cursos, matrícula, libros",
    "travel": "vuelos, hoteles, alojamiento",
    "transfer": "envíos de dinero entre personas o cuentas propias, préstamos",
    "salary": "sueldo, nómina, primas",
    "freelance": "honorarios, ventas, pagos de clientes",
    "other": "lo que no encaje en ninguna otra",
}

# Palabras clave (plegadas: minúsculas y sin tildes). Solo sustantivos y
# marcas; los verbos que indican ingreso o gasto viven en rule_parser.
KEYWORDS = {
    "subscriptions": (
        "netflix", "spotify", "disney", "hbo", "prime video", "youtube premium",
        "icloud", "suscripcion", "membresia", "chatgpt", "apple music",
    ),
    "food": (
        "almuerzo", "desayuno", "cena", "comida", "restaurante", "cafe", "tinto",
        "pizza", "hamburguesa", "sushi", "domicilio", "rappi", "uber eats",
        "empanada", "empanadas", "panaderia", "helado", "cerveza", "cervezas",
        "juan valdez", "starbucks", "mcdonalds", "onces", "corrientazo",
    ),
    "groceries": (
        "mercado", "supermercado", "exito", "carulla", "jumbo", "d1", "ara",
        "olimpica", "walmart", "oxxo", "verduras", "fruver", "viveres",
    ),
    "transport": (
        "taxi", "uber", "didi", "cabify", "bus", "transmilenio", "metro",
        "gasolina", "combustible", "peaje", "parqueadero", "estacionamiento",
        "pasaje", "sitp", "indriver",
    ),
    "housing": ("arriendo", "alquiler", "renta", "hipoteca", "administracion"),
    "utilities": (
        "luz", "agua", "gas", "internet", "energia", "plan de datos", "recibo de luz",
        "epm", "movistar", "tigo", "wom",
    ),
    "health": (
        "farmacia", "drogueria", "medico", "doctor", "consulta", "medicamento",
        "medicamentos", "eps", "dentista", "odontologo", "gimnasio", "examenes",
    ),
    "entertainment": (
        "cine", "concierto", "fiesta", "videojuego", "discoteca", "teatro",
        "boletas", "entradas", "partido", "bolos",
    ),
    "shopping": (
        "ropa", "zapatos", "tenis", "amazon", "mercadolibre", "mercado libre",
        "regalo", "falabella", "zara", "audifonos", "camisa", "maquillaje",
    ),
    "education": (
        "curso", "universidad", "colegio", "libro", "libros", "matricula",
        "platzi", "udemy", "clases", "semestre",
    ),
    "travel": ("hotel", "vuelo", "avion", "viaje", "airbnb", "tiquete", "hostal", "vacaciones"),
    "transfer": ("transferencia", "nequi", "daviplata", "prestamo", "giro", "consignacion"),
    "salary": ("salario", "sueldo", "nomina", "quincena", "prima"),
    "freelance": ("honorarios", "freelance", "cliente", "proyecto", "venta"),
}

# Marcas reconocibles aunque el usuario escriba en minúsculas.
BRANDS = {
    "rappi": "Rappi", "uber eats": "Uber Eats", "uber": "Uber", "didi": "DiDi",
    "cabify": "Cabify", "indriver": "inDrive", "netflix": "Netflix", "spotify": "Spotify",
    "disney": "Disney+", "hbo": "HBO Max", "exito": "Éxito", "carulla": "Carulla",
    "jumbo": "Jumbo", "d1": "D1", "olimpica": "Olímpica", "oxxo": "OXXO",
    "walmart": "Walmart", "amazon": "Amazon", "mercadolibre": "Mercado Libre",
    "mercado libre": "Mercado Libre", "falabella": "Falabella", "zara": "Zara",
    "juan valdez": "Juan Valdez", "starbucks": "Starbucks", "mcdonalds": "McDonald's",
    "nequi": "Nequi", "daviplata": "Daviplata", "airbnb": "Airbnb", "platzi": "Platzi",
    "udemy": "Udemy", "epm": "EPM", "movistar": "Movistar", "tigo": "Tigo",
}
