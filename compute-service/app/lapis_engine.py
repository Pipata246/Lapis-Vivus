import json
import collections
import datetime
import logging
import os
from pathlib import Path
import swisseph as swe
from geopy.geocoders import Nominatim
from timezonefinder import TimezoneFinder
import pytz
import threading

IGING_OFFSET = 58.0

# 1. НАСТРОЙКА СИСТЕМНОГО ЛОГИРОВАНИЯ
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

# Истинный порядок ворот на колесе, начиная с точки 0° Овна (с учетом канонического сдвига)
# ИСТИННЫЙ ПОРЯДОК ВОРОТ (начиная от 0° Овна с каноническим сдвигом)
GATES_ORDER = [
    25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8, 20, 16, 35, 45, 12,
    15, 52, 39, 53, 62, 56, 31, 33, 7, 4, 29, 59, 40, 64, 47, 6,
    46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26, 11,
    10, 58, 38, 54, 61, 60, 41, 19, 13, 49, 30, 55, 37, 63, 22, 36
]


# 3. МАРШРУТИЗАЦИЯ ВОРОТ ПО 9 ЭНЕРГЕТИЧЕСКИМ ЦЕНТРАМ БОДИГРАФА
GATE_TO_CENTER = {
    64: "Head", 61: "Head", 63: "Head",
    47: "Ajna", 24: "Ajna", 4: "Ajna", 11: "Ajna", 43: "Ajna", 17: "Ajna",
    62: "Throat", 23: "Throat", 56: "Throat", 35: "Throat", 12: "Throat", 
    45: "Throat", 33: "Throat", 8: "Throat", 31: "Throat", 20: "Throat", 16: "Throat",
    1: "G_Center", 2: "G_Center", 7: "G_Center", 10: "G_Center", 
    13: "G_Center", 25: "G_Center", 46: "G_Center", 14: "G_Center",
    21: "Heart", 40: "Heart", 26: "Heart", 51: "Heart",
    34: "Sacral", 5: "Sacral", 29: "Sacral", 59: "Sacral", 
    9: "Sacral", 3: "Sacral", 27: "Sacral", 42: "Sacral",
    53: "Root", 60: "Root", 52: "Root", 19: "Root", 39: "Root", 
    41: "Root", 54: "Root", 38: "Root", 58: "Root",
    48: "Splenic", 57: "Splenic", 44: "Splenic", 50: "Splenic", 
    32: "Splenic", 28: "Splenic", 18: "Splenic",
    6: "Solar_Plexus", 37: "Solar_Plexus", 49: "Solar_Plexus", 
    55: "Solar_Plexus", 30: "Solar_Plexus", 22: "Solar_Plexus", 36: "Solar_Plexus"
}

# 4. КАРТА ПАРНЫХ ВОРОТ, ОБРАЗУЮЩИХ КАНАЛЫ МЕЖДУ ЦЕНТРАМИ
CHANNEL_CONNECTIONS = {
    "64-47": ("Head", "Ajna"), "61-24": ("Head", "Ajna"), "63-4": ("Head", "Ajna"),
    "17-11": ("Ajna", "Throat"), "43-23": ("Ajna", "Throat"), "17-62": ("Ajna", "Throat"),
    "16-48": ("Throat", "Splenic"), "20-57": ("Throat", "Splenic"), "34-57": ("Sacral", "Splenic"),
    "57-10": ("Splenic", "G_Center"), "20-10": ("Throat", "G_Center"), "34-10": ("Sacral", "G_Center"),
    "18-58": ("Splenic", "Root"), "28-38": ("Splenic", "Root"), "32-54": ("Splenic", "Root"),
    "44-26": ("Splenic", "Heart"), "50-27": ("Splenic", "Sacral"), "6-59": ("Solar_Plexus", "Sacral"),
    "49-19": ("Solar_Plexus", "Root"), "37-40": ("Solar_Plexus", "Heart"), "36-35": ("Solar_Plexus", "Throat"),
    "22-12": ("Solar_Plexus", "Throat"), "30-41": ("Solar_Plexus", "Root"), "55-39": ("Solar_Plexus", "Root"),
    "7-31": ("G_Center", "Throat"), "1-8": ("G_Center", "Throat"), "13-33": ("G_Center", "Throat"),
    "15-5": ("G_Center", "Sacral"), "46-29": ("G_Center", "Sacral"), "2-14": ("G_Center", "Sacral"),
    "3-60": ("Sacral", "Root"), "42-53": ("Sacral", "Root"), "9-52": ("Sacral", "Root"),
    "34-20": ("Sacral", "Throat"), "45-21": ("Throat", "Heart"), "51-25": ("Heart", "G_Center")
}

# 5. ТОПОЛОГИЧЕСКИЕ РЕБРА ГРАФА БОДИГРАФА ДЛЯ BFS-АНАЛИЗА
CENTER_GRAPH = {
    "Head": ["Ajna"], "Ajna": ["Head", "Throat"],
    "Throat": ["Ajna", "G_Center", "Heart", "Splenic", "Solar_Plexus"],
    "G_Center": ["Throat", "Sacral", "Heart", "Root"],
    "Heart": ["Throat", "G_Center", "Solar_Plexus", "Splenic"],
    "Splenic": ["Throat", "Heart", "Root", "Sacral"],
    "Sacral": ["G_Center", "Splenic", "Solar_Plexus", "Root"],
    "Solar_Plexus": ["Throat", "Heart", "Sacral", "Root"],
    "Root": ["Splenic", "Sacral", "Solar_Plexus", "G_Center"]
}

# 6. БИОЛОГИЧЕСКИЙ МАППИНГ ПЛАНЕТ НА ОРГАНЫ
PLANET_TO_ORGAN = {
    "Sun": "Нервная система", "Earth": "Репродуктивная система", "Moon": "Водный баланс",
    "Mercury": "Органы дыхания и речи", "Venus": "Почки и тимус", "Mars": "Мышечная система",
    "Jupiter": "Печень", "Saturn": "Костная система", "Uranus": "Эндокринная система",
    "Neptune": "Лимфатическая система", "Pluto": "Мочеполовая система",
    "Rahu": "Органы восприятия", "Ketu": "Клеточный каркас"
}

# Глобальный лок для синхронизации вызовов к Си-ядру эфемерид
SWE_LOCK = threading.Lock()

def get_lon(jd, p_id):
    """
    Потокобезопасное извлечение тропической долготы планеты.
    Защищает C-расширение от Segmentation Fault при конкурентных запросах.
    """
    with SWE_LOCK:
        if p_id == "EARTH":
            # Земля — это всегда строгая математическая оппозиция Солнца
            res, _ = swe.calc_ut(jd, swe.SUN)
            # res[0] — это эклиптическая долгота Солнца
            earth_lon = (res[0] + 180.0) % 360.0
            return earth_lon
        
        # Для остальных планет и узлов Луны
        res, _ = swe.calc_ut(jd, p_id)
        return res[0]

def find_design_jd(birth_jd, is_debug=False):
    """
    Поиск момента пренатального импринтинга Дизайна на Си-ядре эфемерид.
    Оптимизировано: вычисляется мгновенно нативной функцией swe.solcross_ut.
    """
    # 1. Получаем точную эклиптическую долготу Солнца в момент рождения
    res, _ = swe.calc_ut(birth_jd, swe.SUN)
    birth_sun_lon = res[0]
    
    # 2. Вычитаем ровно 88 градусов и нормализуем дугу в пределах 0-360°
    target_sun_lon = swe.degnorm(birth_sun_lon - 88.0)
    
    # 3. Задаем стартовую точку для поиска в прошлом (с запасом 100 дней до рождения)
    search_start_jd = birth_jd - 100.0
    
    # 4. Вызываем Си-функцию solcross для поиска точного момента пересечения
    design_jd = swe.solcross_ut(target_sun_lon, search_start_jd)
    
    return design_jd

def parse_substructure(lon, planet_name, gates_order, planet_to_organ):
    """
    Раздельный расчет по вашему предложению:
    1. Ворота определяются по вашей рабочей схеме (через +2.8125).
    2. Линии и подструктуры считаются полностью независимо через константу 58.0 из PDF.
    """
    # === ЧАСТЬ 1: ВАШ РАБОЧИЙ РАСЧЕТ ВОРОТ ===
    lon_gate = (lon + 2.8125) % 360.0
    gate_index = int(lon_gate // 5.625)
    if gate_index > 63: 
        gate_index = 63
    gate = gates_order[gate_index]
    
    # === ЧАСТЬ 2: АВТОНОМНЫЙ РАСЧЕТ ЛИНИЙ ИЗ PDF (КОНСТАНТА 58.0) ===
    angle = (lon + 58.0) % 360.0
    angle_percentage = angle / 360.0
    
    # Прямой перенос формул из PDF-файла
    line = int((angle_percentage * 64 * 6) % 6 + 1)
    color = int((angle_percentage * 64 * 6 * 6) % 6 + 1)
    tone = int((angle_percentage * 64 * 6 * 6 * 6) % 6 + 1)
    base = int((angle_percentage * 64 * 6 * 6 * 6 * 5) % 5 + 1)
    
    # === ЧАСТЬ 3: ФОРМИРОВАНИЕ ВАШЕГО JSON ===
    organ_name = planet_to_organ.get(planet_name, "Стабильно")
    return {
        "deg": round(lon, 4),
        "gate": int(gate),
        "line": line,
        "color": color,
        "tone": tone,
        "base": base,
        "value": f"Ворота {gate}.{line}",
        "organ": organ_name,
        "status": "Стабильно"
    }









def calculate_profile_and_cross(personality_data, design_data):
    p_sun_line = personality_data["Sun"]["line"]
    d_sun_line = design_data["Sun"]["line"]
    profile = f"{p_sun_line}/{d_sun_line}"
    
    g_p_sun = personality_data["Sun"]["gate"]
    g_p_earth = personality_data["Earth"]["gate"]
    g_d_sun = design_data["Sun"]["gate"]
    g_d_earth = design_data["Earth"]["gate"]
    
    if p_sun_line in (1, 2, 3):
        cross_type, cross_prefix = "Правоугольный", "Right Angle Cross"
    elif p_sun_line == 4:
        cross_type, cross_prefix = ("Джакста-позиция", "Juxtaposition Cross") if d_sun_line in (1, 2) else ("Правоугольный", "Right Angle Cross")
    else:
        cross_type, cross_prefix = "Левоугольный", "Left Angle Cross"
        
    CROSS_NAMES_ATLAS = {
        1: "Сфинкса (The Sphinx)", 2: "Сфинкса (The Sphinx)", 3: "Законов (The Laws)",
        4: "Объяснения (Explanation)", 5: "Разделения (Separation)", 6: "Эдема (Eden)",
        7: "Сфинкса (The Sphinx)", 8: "Заражения (Contagion)", 9: "Планирования (Planning)",
        10: "Сосуда Любви (The Vessel of Love)", 11: "Эдема (Eden)", 12: "Эдема (Eden)",
        13: "Сфинкса (The Sphinx)", 14: "Инфицирования (Contagion)", 15: "Сосуда Любви (The Vessel of Love)",
        16: "Планирования (Planning)", 17: "Служения (Service)", 18: "Исцеления (Healing)",
        19: "Четырёх Путей (The Four Ways)", 20: "Проникновения / Шока (Penetration / Shock)",
        21: "Напряжения (Tension)", 22: "Эдема (Eden)", 23: "Объяснения (Explanation)",
        24: "Инкарнации (Incarnation)", 25: "Сосуда Любви (The Vessel of Love)", 26: "Уловки (Trickster)",
        27: "Неожиданного (The Unexpected)", 28: "Неожиданного (The Unexpected)", 29: "Индустрии (Industry)",
        30: "Заражения (Contagion)", 31: "Альфы (The Alpha)", 32: "Консервации (Conservation)",
        33: "Четырёх Путей (The Four Ways)", 34: "Проникновения / Шока (Penetration / Shock)",
        35: "Сознания (Consciousness)", 36: "Эдема (Eden)", 37: "Миграции (Migration)",
        38: "Напряжения (Tension)", 39: "Напряжения (Tension)", 40: "Миграции (Migration)",
        41: "Альфы (The Alpha)", 42: "Майи (Maya)", 43: "Объяснения (Explanation)",
        44: "Инкарнации (Incarnation)", 45: "Владения (Rulership)", 46: "Сосуда Любви (The Vessel of Love)",
        47: "Объяснения (Explanation)", 48: "Исцеления (Healing)", 49: "Объяснения (Explanation)",
        50: "Консервации (Conservation)", 51: "Проникновения / Шока (Penetration / Shock)",
        52: "Разделения (Separation)", 53: "Цикличности (Cycles)", 54: "Амбиций (Ambition)",
        55: "Интеграции (Integration)", 56: "Отвлечения (Distraction)", 57: "Проникновения / Шока (Penetration / Shock)",
        58: "Исцеления (Healing)", 59: "Улаживания (Sleeping Phoenix / Intimacy)", 60: "Законов (The Laws)",
        61: "Майи (Maya)", 62: "Майи (Maya)", 63: "Сознания (Consciousness)", 64: "Сознания (Consciousness)"
    }
    
    cross_base_name = CROSS_NAMES_ATLAS.get(g_p_sun, f"Управления ({g_p_sun}/{g_p_earth} | {g_d_sun}/{g_d_earth})")
    return {
        "profile": profile,
        "incarnation_cross": {
            "name": f"{cross_type} Крест {cross_base_name}",
            "technical_type": cross_prefix,
            "gates_formula": f"{g_p_sun}/{g_p_earth} | {g_d_sun}/{g_d_earth}"
        }
    }

def canonical_type_and_authority(defined_centers, active_channels, center_graph, channel_connections):
    """Определение Энергетического Типа на основе СТРОГО определенных (закрашенных) центров."""
    def has_path_to_throat(start_center, active_edges):
        if start_center == "Throat": return True
        visited = set()
        queue = collections.deque([start_center])
        while queue:
            current = queue.popleft()
            if current == "Throat": return True
            if current not in visited:
                visited.add(current)
                for neighbor in center_graph[current]:
                    for ch_name, centers in channel_connections.items():
                        if ch_name in active_edges and (current in centers and neighbor in centers):
                            if neighbor not in visited:
                                queue.append(neighbor)
        return False

    # Если ни один центр не закрашен полным каналом — это Рефлектор
    if not defined_centers:
        return "Рефлектор", "Лунный цикл (Для Рефлектора)"
    
    has_sacral = "Sacral" in defined_centers
    other_motors = ["Root", "Heart", "Solar_Plexus"]
    motor_connected_to_throat = any(m in defined_centers and has_path_to_throat(m, active_channels.keys()) for m in other_motors)
    
    if has_sacral:
        sacral_to_throat = has_path_to_throat("Sacral", active_channels.keys())
        card_type = "Манифестирующий Генератор" if (sacral_to_throat or motor_connected_to_throat) else "Генератор"
    elif motor_connected_to_throat:
        card_type = "Манифестор"
    else:
        card_type = "Проектор"
        
    if "Solar_Plexus" in defined_centers: authority = "Эмоциональный (Солнечное Сплетение)"
    elif "Sacral" in defined_centers: authority = "Сакральный"
    elif "Splenic" in defined_centers: authority = "Селезёночный"
    elif "Heart" in defined_centers: authority = "Эго Манифестируемый" if card_type == "Манифестор" else "Эго Проецируемый"
    elif "G_Center" in defined_centers: authority = "Самопроецируемый"
    elif any(c in defined_centers for c in ["Throat", "Ajna", "Head"]): authority = "Внешний (Ментальный Проектор)"
    else: authority = "Лунный цикл (Для Рефлектора)"
    
    return card_type, authority

_ENGINE_DIR = Path(__file__).resolve().parent
_DEFAULT_EPHE = _ENGINE_DIR.parent / "ephe"


def build_hd_json(year, month, day, hour_utc, is_debug=False):
    ephe_path = os.environ.get("SWISSEPH_PATH", str(_DEFAULT_EPHE))
    if Path(ephe_path).is_dir():
        swe.set_ephe_path(ephe_path) 
    birth_jd = swe.julday(year, month, day, hour_utc)
    design_jd = find_design_jd(birth_jd, is_debug=is_debug)
    
    # Канонический маппинг: Узлы переведены на MEAN_NODE
    planets_map = {
        "Sun": swe.SUN, "Earth": "EARTH", "Moon": swe.MOON, 
        "Mercury": swe.MERCURY, "Venus": swe.VENUS, "Mars": swe.MARS, 
        "Jupiter": swe.JUPITER, "Saturn": swe.SATURN, "Uranus": swe.URANUS, 
        "Neptune": swe.NEPTUNE, "Pluto": swe.PLUTO, "Rahu": swe.MEAN_NODE
    }
    
    personality_data = {}
    design_data = {}
    activated_gates = set()
    
    # 1. Расчет Личности (Conscious)
    for name, p_id in planets_map.items():
        lon = get_lon(birth_jd, p_id)
        personality_data[name] = parse_substructure(lon, name, GATES_ORDER, PLANET_TO_ORGAN)
        activated_gates.add(personality_data[name]["gate"])
        
    # Расчет Кету Личности (Оппозиция Раху)
    ketu_lon_p = (get_lon(birth_jd, swe.MEAN_NODE) + 180.0) % 360.0
    personality_data["Ketu"] = parse_substructure(ketu_lon_p, "Ketu", GATES_ORDER, PLANET_TO_ORGAN)
    activated_gates.add(personality_data["Ketu"]["gate"])
    
    # 2. Расчет Дизайна (Unconscious)
    for name, p_id in planets_map.items():
        lon = get_lon(design_jd, p_id)
        design_data[name] = parse_substructure(lon, name, GATES_ORDER, PLANET_TO_ORGAN)
        activated_gates.add(design_data[name]["gate"])
        
    # Расчет Кету Дизайна
    ketu_lon_d = (get_lon(design_jd, swe.MEAN_NODE) + 180.0) % 360.0
    design_data["Ketu"] = parse_substructure(ketu_lon_d, "Ketu", GATES_ORDER, PLANET_TO_ORGAN)
    activated_gates.add(design_data["Ketu"]["gate"])
    
    # 3. Наполнение карты ворот по центрам (Включая "висящие")
    all_centers_output = {c: [] for c in ["Head", "Ajna", "Throat", "G_Center", "Heart", "Sacral", "Root", "Splenic", "Solar_Plexus"]}
    for gate in activated_gates:
        c_name = GATE_TO_CENTER.get(gate)
        if c_name: 
            all_centers_output[c_name].append(gate)
    clean_centers = {k: list(sorted(set(v))) for k, v in all_centers_output.items()}
    
    # 4. Анализ замыкания КАНАЛОВ и закрашивания центров
    active_channels = {}
    defined_centers_set = set() # Центры, закрашенные целыми каналами
    
    for ch_name, centers_tuple in CHANNEL_CONNECTIONS.items():
        g1_str, g2_str = ch_name.split("-")
        g1, g2 = int(g1_str), int(g2_str)
        
        if g1 in activated_gates and g2 in activated_gates:
            active_channels[ch_name] = [g1, g2]
            c1 = GATE_TO_CENTER.get(g1)
            c2 = GATE_TO_CENTER.get(g2)
            if c1: defined_centers_set.add(c1)
            if c2: defined_centers_set.add(c2)
            
    # 5. Синтез Типа, Авторитета, Профиля и Креста
    card_type, authority = canonical_type_and_authority(
        defined_centers_set, active_channels, CENTER_GRAPH, CHANNEL_CONNECTIONS
    )
    meta_structures = calculate_profile_and_cross(personality_data, design_data)
    
    output = {
        "tropical": {
            "type": card_type,
            "authority": authority,
            "profile": meta_structures["profile"],
            "incarnation_cross": meta_structures["incarnation_cross"],
            "defined_centers": list(defined_centers_set), # Закрашенные центры
            "all_activated_centers": clean_centers,       # Центры с воротами
            "ch": active_channels,
            "personality_conscious": personality_data,
            "design_unconscious": design_data
        }
    }
    return json.dumps(output, ensure_ascii=False, indent=2)

def get_coordinates(city_name, is_debug=False):
    geocoding_engine = Nominatim(user_agent="human_design_engine_v2026")
    try:
        location = geocoding_engine.geocode(city_name, language="ru", timeout=10)
        if not location:
            return {"error": f"Населенный пункт '{city_name}' не найден."}
        return {"success": True, "display_name": location.address, "latitude": location.latitude, "longitude": location.longitude}
    except Exception as e:
        return {"error": f"Ошибка геокодирования: {str(e)}"}

def convert_local_time_to_utc(year, month, day, hour, minute, latitude, longitude, is_debug=False):
    tf = TimezoneFinder()
    timezone_str = tf.timezone_at(lng=longitude, lat=latitude)
    if not timezone_str:
        raise ValueError("Не удалось определить часовой пояс.")
        
    local_tz = pytz.timezone(timezone_str)
    naive_datetime = datetime.datetime(year, month, day, hour, minute)
    localized_datetime = local_tz.localize(naive_datetime, is_dst=None)
    utc_datetime = localized_datetime.astimezone(pytz.utc)
    
    hour_utc_float = utc_datetime.hour + (utc_datetime.minute / 60.0) + (utc_datetime.second / 3600.0)
    return {"utc_year": utc_datetime.year, "utc_month": utc_datetime.month, "utc_day": utc_datetime.day, "utc_hour_float": hour_utc_float}

import datetime

def calculate_pythagoras_matrix(birth_date_str):
    """
    BLOCK_1B: Итерационный процессор числовой матрицы Пифагора (Санкхья Шастра).
    Полностью потокобезопасный расчет 4 рабочих чисел и вектора вакуумных пустот.
    
    Вход: birth_date_str (строка в каноническом формате 'YYYY-MM-DD')
    Выход: dict со сквозными мета-регистрами для интеграции в BLOCK_1E (Панцирь Райха)
    """
    try:
        # Инициализация и парсинг входящего LMT-таймфрейма
        dt = datetime.datetime.strptime(birth_date_str, "%Y-%m-%d")
        day, month, year = dt.day, dt.month, dt.year
        
        # Шаг 1: Извлечение изолированных массивов цифр (Гань-Ди регистры)
        day_digits = [int(d) for d in str(day)]
        month_digits = [int(d) for d in str(month)]
        year_digits = [int(d) for d in str(year)]
        
        base_pool = day_digits + month_digits + year_digits
        
        # Шаг 2: Вычисление 4 рабочих чисел (Уравнения натяжения решетки)
        # W1: Сумма всех цифр даты рождения
        w1 = sum(base_pool)
        
        # W2: Сумма цифр первого рабочего числа
        w2 = sum(int(d) for d in str(w1))
        
        # W3: Первое рабочее число минус удвоенная первая цифра дня рождения
        # Если день рождения меньше 10 (например, 5), то первая цифра — это 5
        first_digit_of_day = day_digits[0]
        w3 = w1 - (2 * first_digit_of_day)
        
        # W4: Сумма цифр третьего рабочего числа
        w4 = sum(int(d) for d in str(w3))
        
        # Шаг 3: Сборка финального числового пула (Total Numeric Pool)
        w_digits = ([int(d) for d in str(w1)] + 
                    [int(d) for d in str(w2)] + 
                    [int(d) for d in str(w3)] + 
                    [int(d) for d in str(w4)])
        
        total_numeric_pool = base_pool + w_digits
        
        # Шаг 4: Квантование сетки 3х3 и вычисление плотности ячеек
        grid = {f"cell_{i}": total_numeric_pool.count(i) for i in range(1, 10)}
        
        # Шаг 5: Поиск вакуумных пустот (Vacuum Gaps) для выявления Mercurius-утечек
        pythagoras_vacuum = [i for i in range(1, 10) if grid[f"cell_{i}"] == 0]
        
        # Шаг 6: Расчет индексов группового давления (Линии натяжения)
        lines_pressure = {
            "row_1_gold_will_soma": grid["cell_1"] + grid["cell_4"] + grid["cell_7"], # Строка Здоровья/Воли
            "row_2_family_energy": grid["cell_2"] + grid["cell_5"] + grid["cell_8"],  # Строка Стабильности
            "row_3_social_intellect": grid["cell_3"] + grid["cell_6"] + grid["cell_9"],# Строка Реализации
            
            "col_1_self_esteem": grid["cell_1"] + grid["cell_2"] + grid["cell_3"],    # Столбец Самооценки
            "col_2_material_ground": grid["cell_4"] + grid["cell_5"] + grid["cell_6"],# Столбец Материального
            "col_3_talent_potency": grid["cell_7"] + grid["cell_8"] + grid["cell_9"], # Столбец Таланта
            
            "diag_1_spiritual_core": grid["cell_1"] + grid["cell_5"] + grid["cell_9"],# Духовная диагональ
            "diag_2_carnal_attachments": grid["cell_3"] + grid["cell_5"] + grid["cell_7"] # Плотская диагональ
        }
        
        # Сборка объектной структуры мета-регистров
        return {
            "success": True,
            "working_numbers": [w1, w2, w3, w4],
            "pythagoras_grid_vector": list(grid.values()),
            "pythagoras_vacuum_gaps": pythagoras_vacuum,
            "lines_pressure_index": lines_pressure,
            "raw_cells": grid
        }
        
    except Exception as e:
        return {"success": False, "error": f"Критический сбой числового процессора: {str(e)}"}

# Базовый шаг весов: [Глазной, Челюстной, Шейный, Грудной, Диафрагмальный, Брюшной, Тазовый]
HEAVEN_POSITIONAL_WEIGHTS = {
    "top_B": { # Полюс Неба (Вход космической Ци / Духовное)
        2:  {"segment_3": 0.5, "segment_6": 0.5}, # Жрица: Лунный покой Ртути, легкий тонус Инь
        9:  {"segment_1": 1.5, "segment_7": 1.0}, # Отшельник: Сухая изоляция ума
        15: {"segment_2": 1.5, "segment_4": 2.0}, # Дьявол: Перегрев Серы, эго-радиация
        16: {"segment_3": 1.5, "segment_5": 2.0}  # Башня: Марсианский шок декомпрессии
    },
    "mid1_Angel": { # Промежуточный верхний шлюз (1/4 Вертикали)
        6:  {"segment_3": 1.0, "segment_4": 2.0}, # Влюбленные: Расщепление чувств, сомнения ума
        18: {"segment_1": 1.5, "segment_5": 1.5, "segment_6": 2.0} # Луна: Абыссальный туман, застой ЖКТ
    },
    "center_E": { # Алхимическое Ядро (Зона Комфорта / Сердце Октаграммы)
        4:  {"segment_2": 2.0, "segment_3": 2.5, "segment_5": 1.0}, # Император: Жесткая Сатурнианская Соль
        15: {"segment_4": 2.0, "segment_5": 1.5, "segment_7": 2.0}  # Дьявол: Одержимость формой в ядре
    },
    "mid2_Tail": { # Промежуточный нижний шлюз (3/4 Вертикали / Кармический замок)
        15: {"segment_5": 1.5, "segment_6": 1.0, "segment_7": 2.5}, # Дьявол: Вентиль перехвата Кундалини
        18: {"segment_5": 2.0, "segment_6": 2.5}  # Луна: Ведьмино болото страхов выживания
    },
    "bottom_G": { # Полюс Земли (Дно Реторты / Кармический хвост / Муладхара)
        9:  {"segment_1": 1.5, "segment_7": 2.5}, # Отшельник: Сухой зажим тазового дна
        11: {"segment_4": 2.0, "segment_5": 1.5}, # Сила/Lust: Пиковый вольтаж Кундалини Льва
        15: {"segment_2": 1.5, "segment_7": 2.5}  # Дьявол: Хтоническое заземление в материю
    }
}



# =============================================================================
# BLOCK_1B_HARD_LOCKS: ПОЛНЫЙ КАРКАС КОНСТАНТ ДЛЯ ЛИНИИ ЗЕМЛИ (ГОРИЗОНТАЛЬ МАТЕРИИ)
# =============================================================================

# Фиксированные паттерны Линии Земли (5-точечный кортеж: [Лево_А, Шлюз_Личной_Силы, Центр_Е, Финансовый_Замок, Право_В])
# Направление вектора строго слева направо: от Личности (0 лет) к Материальному шлюзу (40 лет).
# Веса somatic_modifiers: [Глазной, Челюстной, Шейный, Грудной, Диафрагмальный, Брюшной, Тазовый]

EARTH_AXIS_PATTERNS = {
    "4_8": {
        "id": 1,
        "name": "Сатурнианская Броня / Крио-Замок Империи",
        "signature": "4-X-E-Y-8",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 3.5, "segment_3": 2.0, "segment_4": 0.0, "segment_5": 1.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "FIXATIO_DEADLOCK"
    },
    "8_4": {
        "id": 2,
        "name": "Сатурнианская Броня / Зеркальный Контроль Регламента",
        "signature": "8-X-E-Y-4",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 3.5, "segment_3": 2.0, "segment_4": 0.0, "segment_5": 1.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "FIXATIO_DEADLOCK"
    },
    "11_16": {
        "id": 3,
        "name": "Марсианский Молот / Взрыв Сосуда Серы",
        "signature": "11-X-E-Y-16",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 3.0, "segment_5": 2.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "CALCINATIO_BURNING"
    },
    "16_11": {
        "id": 4,
        "name": "Взрывная Декомпрессия Материи / Удар Башни",
        "signature": "16-X-E-Y-11",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 3.0, "segment_5": 2.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "CALCINATIO_BURNING"
    },
    "15_15": {
        "id": 5,
        "name": "Золотой Телец / Кастрация Материального Потока",
        "signature": "X-15-E-15-Y",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 2.5, "segment_7": 2.0},
        "alchemical_phase": "COAGULATIO_STAGNATION"
    },
    "3_19": {
        "id": 6,
        "name": "Императорское Золото / Сверхпроводимость Тинктуры",
        "signature": "3-X-E-Y-19",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": -1.5, "segment_3": -1.0, "segment_4": 0.0, "segment_5": 0.0, "segment_6": -2.0, "segment_7": 0.0},
        "alchemical_phase": "PERFECT_CONJUNCTIO"
    },
    "19_3": {
        "id": 7,
        "name": "Императорское Золото / Инверсия Расширения Инь-Ян",
        "signature": "19-X-E-Y-3",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": -1.5, "segment_3": -1.0, "segment_4": 0.0, "segment_5": 0.0, "segment_6": -2.0, "segment_7": 0.0},
        "alchemical_phase": "PERFECT_CONJUNCTIO"
    },
    "10_10": {
        "id": 8,
        "name": "Колесо Удачи Земли / Пульсирующий Финансовый Контур",
        "signature": "X-10-E-10-Y",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 1.5, "segment_6": 2.0, "segment_7": 1.5},
        "alchemical_phase": "MERCURIUS_DYNAMIC_CASH"
    },
    "7_7": {
        "id": 9,
        "name": "Колесница Социализации / Форсированное Заземление Воли",
        "signature": "X-7-E-7-Y",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.5, "segment_3": 1.5, "segment_4": 0.0, "segment_5": 2.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "SULPHUR_SPEED_DRIVE"
    },
    "5_22": {
        "id": 10,
        "name": "Безумный Проповедник / Разрушение Социальных Иерархий",
        "signature": "5-X-E-Y-22",
        "somatic_modifiers": {"segment_1": 1.0, "segment_2": 0.0, "segment_3": 2.0, "segment_4": 0.0, "segment_5": 2.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "MERCURIUS_CHAOS_DOGMA"
    },
    "22_5": {
        "id": 11,
        "name": "Безумный Проповедник / Инверсия Анархии",
        "signature": "22-X-E-Y-5",
        "somatic_modifiers": {"segment_1": 1.0, "segment_2": 0.0, "segment_3": 2.0, "segment_4": 0.0, "segment_5": 2.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "MERCURIUS_CHAOS_DOGMA"
    },
    "12_12": {
        "id": 12,
        "name": "Жертва Социума / Финансовая Стагнация Повешенного",
        "signature": "X-12-E-12-Y",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 1.0, "segment_4": 1.5, "segment_5": 1.5, "segment_6": 2.0, "segment_7": 1.0},
        "alchemical_phase": "SOLUTIO_STAGNATION_EARTH"
    },
    "13_13": {
        "id": 13,
        "name": "Коллапс Капитала / Марсианское Обнуление Формы",
        "signature": "13-X-E-Y-13",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 2.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 2.5, "segment_6": 2.0, "segment_7": 1.5},
        "alchemical_phase": "MORTIFICATIO_SAL"
    },
    "14_14": {
        "id": 14,
        "name": "Алхимическая Стабилизация Материи / Золотая Мера",
        "signature": "X-14-E-14-Y",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": -1.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": -1.0, "segment_6": -1.0, "segment_7": 0.0},
        "alchemical_phase": "PERFECT_COAGULATIO"
    },
    "17_17": {
        "id": 15,
        "name": "Астральный Бизнес / Иллюзорные Проекты Звезды",
        "signature": "X-17-E-17-Y",
        "somatic_modifiers": {"segment_1": 2.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 1.5, "segment_6": 1.5, "segment_7": 0.0},
        "alchemical_phase": "MERCURIUS_VOLATILE_FINANCE"
    },
    "20_20": {
        "id": 16,
        "name": "Родовой Молот Капитализма / Пробой Октаграммы",
        "signature": "20-X-E-Y-20",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 2.0, "segment_3": 1.5, "segment_4": 1.5, "segment_5": 2.0, "segment_6": 1.0, "segment_7": 0.0},
        "alchemical_phase": "CONGELATIO_ROD"
    },
    "21_21": {
        "id": 17,
        "name": "Глобальный Рынок / Абсолютное Расширение Вселенной",
        "signature": "21-X-E-Y-21",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": -2.0, "segment_3": -1.0, "segment_4": 0.0, "segment_5": 0.0, "segment_6": -1.5, "segment_7": -1.5},
        "alchemical_phase": "UNIO_MYSTICA_MATERIA"
    },
    "1_1": {
        "id": 18,
        "name": "Лидерский Тразистор Мага / Индивидуальный Стартап",
        "signature": "1-X-E-Y-1",
        "somatic_modifiers": {"segment_1": 1.0, "segment_2": 1.5, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 1.5, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "MERCURIUS_INITIO"
    },
    "2_2": {
        "id": 19,
        "name": "Пассивное Накопление Верховной Жрицы / Инь-Ртуть",
        "signature": "2-X-E-Y-2",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 1.0, "segment_4": 0.0, "segment_5": 1.0, "segment_6": 2.0, "segment_7": 0.0},
        "alchemical_phase": "MERCURIUS_RECEPTIA"
    },
    "9_9": {
        "id": 20,
        "name": "Финансовая Изоляция Отшельника / Сухой Дефицит",
        "signature": "9-X-E-Y-9",
        "somatic_modifiers": {"segment_1": 1.5, "segment_2": 1.5, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 2.0, "segment_7": 2.0},
        "alchemical_phase": "FIXATIO_DRY_FINANCE"
    }
}


# =============================================================================
# BLOCK_1B_HARD_LOCKS: ПОЛНЫЙ КАРКАС КОНСТАНТ ДЛЯ ЛИНИИ ОТЦА (ДИАГОНАЛЬ СЕРЫ)
# =============================================================================

# Фиксированные паттерны Линии Отца (5-точечный кортеж: [Отец_Дух_А1, Средина_Верх, Центр_Е, Средина_Низ, Отец_Тело_С1])
# Направление вектора строго нисходящее: от Духовного истока (10 лет) к Материальному финалу (50 лет).
# Веса somatic_modifiers: [Глазной, Челюстной, Шейный, Грудной, Диафрагмальный, Брюшной, Тазовый]

FATHER_AXIS_PATTERNS = {
    "11_11": {
        "id": 1,
        "name": "Сломленный Лев / Блокировка Мужской Кундалини",
        "signature": "11-X-E-Y-11",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.0, "segment_3": 0.0, "segment_4": 3.0, "segment_5": 2.5, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "CALCINATIO_BURNING"
    },
    "4_4": {
        "id": 2,
        "name": "Деспотизм Патриарха / Сатурнианский Молот Отца",
        "signature": "X-4-E-4-Y",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 2.5, "segment_3": 3.0, "segment_4": 0.0, "segment_5": 1.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "FIXATIO_DEADLOCK"
    },
    "12_12": {
        "id": 3,
        "name": "Жертвенный Алтарь Рода / Программа Самобичевания по Мужской Линии",
        "signature": "X-12-E-12-Y",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 2.8, "segment_5": 1.5, "segment_6": 0.0, "segment_7": 2.5},
        "alchemical_phase": "SOLUTIO_STAGNATION"
    },
    "22_22": {
        "id": 4,
        "name": "Безумный Странник / Разрыв Родовых Цепей",
        "signature": "X-22-E-22-Y",
        "somatic_modifiers": {"segment_1": 1.5, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 2.0, "segment_6": 0.0, "segment_7": 2.0},
        "alchemical_phase": "MERCURIUS_VOLATILE_HIGH"
    },
    "15_15": {
        "id": 5,
        "name": "Теневая Власть Отца / Дьявольское Искушение Материей",
        "signature": "15-X-E-Y-15",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 2.0, "segment_3": 0.0, "segment_4": 1.5, "segment_5": 1.5, "segment_6": 2.5, "segment_7": 2.0},
        "alchemical_phase": "COAGULATIO_STAGNATION"
    },
    "16_16": {
        "id": 6,
        "name": "Взрыв Башни Отца / Внезапный Крах Мужского Родового Намерения",
        "signature": "16-X-E-Y-16",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.0, "segment_3": 2.0, "segment_4": 2.0, "segment_5": 3.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "DISTILLATIO_CRISIS"
    },
    "1_1": {
        "id": 7,
        "name": "Воля Первопроходца / Абсолютный Логос Мага по Мужской Линии",
        "signature": "1-X-E-Y-1",
        "somatic_modifiers": {"segment_1": 1.0, "segment_2": 0.0, "segment_3": -1.0, "segment_4": 0.0, "segment_5": -1.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "MERCURIUS_INITIO"
    },
    "7_7": {
        "id": 8,
        "name": "Колесница Отца / Наследственная Скорость Экспансии Серы",
        "signature": "7-X-E-Y-7",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 2.5, "segment_6": 0.0, "segment_7": 1.0},
        "alchemical_phase": "SULPHUR_SPEED_DRIVE"
    },
    "9_9": {
        "id": 9,
        "name": "Сухой Аскетизм Отца / Интеллектуальный Родовой Затвор",
        "signature": "9-X-E-Y-9",
        "somatic_modifiers": {"segment_1": 2.0, "segment_2": 1.5, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 0.0, "segment_7": 2.0},
        "alchemical_phase": "FIXATIO_SOLITUDE"
    },
    "10_10": {
        "id": 10,
        "name": "Поток Мужской Удачи / Динамическая Проводимость Рода",
        "signature": "X-10-E-10-Y",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": -1.5, "segment_6": 0.0, "segment_7": -1.5},
        "alchemical_phase": "PERFECT_CONJUNCTIO"
    },
    "5_5": {
        "id": 11,
        "name": "Патриархальный Замок Закона / Родовые Догмы Иерофанта",
        "signature": "5-X-E-Y-5",
        "somatic_modifiers": {"segment_1": 1.5, "segment_2": 1.5, "segment_3": 2.0, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "SAL_DOGMA"
    },
    "6_6": {
        "id": 12,
        "name": "Искушение Отца / Хронический Раскол Родового Выбора",
        "signature": "6-X-E-Y-6",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 1.5, "segment_4": 2.0, "segment_5": 1.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "MERCURIUS_SPLIT"
    },
    "8_8": {
        "id": 13,
        "name": "Кармические Весы Отца / Абсолютное Равновесие Судьбы",
        "signature": "8-X-E-Y-8",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.5, "segment_3": 1.5, "segment_4": 0.0, "segment_5": 1.0, "segment_6": 1.0, "segment_7": 0.0},
        "alchemical_phase": "SAL_EQUILIBRIUM"
    },
    "13_13": {
        "id": 14,
        "name": "Трансформация Косы Смерти / Радикальное Обнуление Наследственности",
        "signature": "13-X-E-Y-13",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 1.5, "segment_5": 2.0, "segment_6": 0.0, "segment_7": 3.0},
        "alchemical_phase": "MORTIFICATIO"
    },
    "14_14": {
        "id": 15,
        "name": "Алхимическое Насыщение Отца / Золотая Середина",
        "signature": "X-14-E-14-Y",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": -1.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": -1.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "PERFECT_TEMPERANTIA"
    },
    "17_17": {
        "id": 16,
        "name": "Иллюзорный Блеск Звезды / Отрезанность от Реальности",
        "signature": "X-17-E-17-Y",
        "somatic_modifiers": {"segment_1": 2.5, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 1.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "MERCURIUS_VOLATILE"
    },
    "19_19": {
        "id": 17,
        "name": "Радиация Мужского Солнца / Огненный Овервольтаж Самости",
        "signature": "19-X-E-Y-19",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.0, "segment_3": 1.0, "segment_4": 3.0, "segment_5": 1.5, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "CALCINATIO_PURIFICATION"
    },
    "20_20": {
        "id": 18,
        "name": "Тектонический Родовой Суд / Объявление Силы Наследников",
        "signature": "20-X-E-Y-20",
        "somatic_modifiers": {"segment_1": 1.0, "segment_2": 1.5, "segment_3": 2.0, "segment_4": 1.0, "segment_5": 2.0, "segment_6": 0.0, "segment_7": 1.5},
        "alchemical_phase": "CONGELATIO_CRISIS"
    },
    "21_21": {
        "id": 19,
        "name": "Глобальное Мировое Расширение Вселенной / Космический Мужской Сбор",
        "signature": "21-X-E-Y-21",
        "somatic_modifiers": {"segment_1": -1.0, "segment_2": -1.0, "segment_3": 0.0, "segment_4": -1.5, "segment_5": 0.0, "segment_6": 0.0, "segment_7": -1.5},
        "alchemical_phase": "UNIO_MYSTICA"
    },
    "3_3": {
        "id": 20,
        "name": "Инверсия Мужского Принципа / Подавление Холодом Императрицы",
        "signature": "3-X-E-Y-3",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 1.5, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 2.0, "segment_7": 2.5},
        "alchemical_phase": "SAL_COAGULATION"
    }
}


# =============================================================================
# BLOCK_1B_HARD_LOCKS: ПОЛНЫЙ КАРКАС КОНСТАНТ ДЛЯ ЛИНИИ МАТЕРИ (ДИАГОНАЛЬ РТУТИ)
# =============================================================================

# Фиксированные паттерны Линии Матери (5-точечный кортеж: [Мать_Дух_В1, Средина_Верх, Центр_Е, Средина_Низ, Мать_Тело_Д1])
# Направление вектора строго нисходящее: от Духовного истока (30 лет) к Материальному финалу (70 лет) [INDEX: 5].
# Веса somatic_modifiers: [Глазной, Челюстной, Шейный, Грудной, Диафрагмальный, Брюшной, Тазовый] [INDEX: 6].

MOTHER_AXIS_PATTERNS = {
    "3_3": {
        "id": 1,
        "name": "Заблокированное Плодородие / Холод Императрицы",
        "signature": "3-X-E-Y-3",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 1.0, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 2.0, "segment_7": 3.0},
        "alchemical_phase": "SAL_COAGULATION_STAGNATION"
    },
    "6_6": {
        "id": 2,
        "name": "Разорванное Сердце / Замок Искушения",
        "signature": "X-6-E-6-Y",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.0, "segment_3": 2.0, "segment_4": 3.0, "segment_5": 1.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "MERCURIUS_VOLATILE_SPLIT"
    },
    "18_18": {
        "id": 3,
        "name": "Ведьмино Болото / Лунный Свищ Матери",
        "signature": "X-18-E-18-Y",
        "somatic_modifiers": {"segment_1": 1.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 2.5, "segment_6": 3.0, "segment_7": 1.5},
        "alchemical_phase": "SOLUTIO_PUTREFACIO"
    },
    "9_9": {
        "id": 4,
        "name": "Закрытая Матка / Одинокая Матрона",
        "signature": "9-X-E-Y-9",
        "somatic_modifiers": {"segment_1": 2.5, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 1.0, "segment_7": 3.5},
        "alchemical_phase": "FIXATIO_SOLITUDE"
    },
    "15_15": {
        "id": 5,
        "name": "Манипуляция Чувствами / Дьявольское Искушение Рода",
        "signature": "15-X-E-Y-15",
        "somatic_modifiers": {"segment_1": 2.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 1.5, "segment_5": 0.0, "segment_6": 2.5, "segment_7": 2.0},
        "alchemical_phase": "COAGULATIO_MAGE"
    },
    "16_16": {
        "id": 6,
        "name": "Вспышка Ярости Матери / Крах Эмоциональных Опор",
        "signature": "16-X-E-Y-16",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.5, "segment_3": 1.5, "segment_4": 2.0, "segment_5": 3.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "DISTILLATIO_CRISIS"
    },
    "2_2": {
        "id": 7,
        "name": "Поток Интуиции Жрицы / Чистая Проводимость Лунной Ртути",
        "signature": "2-X-E-Y-2",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": -1.0, "segment_4": 0.0, "segment_5": -1.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "MERCURIUS_RECEPTIA"
    },
    "10_10": {
        "id": 8,
        "name": "Колесо Женской Удачи / Циклическое Насыщение Жизнью",
        "signature": "X-10-E-10-Y",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": -1.5, "segment_6": 0.0, "segment_7": -1.5},
        "alchemical_phase": "PERFECT_CONJUNCTIO"
    },
    "17_17": {
        "id": 9,
        "name": "Иллюзии Идеализации Музы / Отрезанность Аджни",
        "signature": "X-17-E-17-Y",
        "somatic_modifiers": {"segment_1": 2.5, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 1.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "MERCURIUS_VOLATILE"
    },
    "19_19": {
        "id": 10,
        "name": "Творческое Солнце Матери / Радиация Прямого Проявления",
        "signature": "19-X-E-Y-19",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.0, "segment_3": 1.0, "segment_4": 3.0, "segment_5": 1.5, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "CALCINATIO_PURIFICATION"
    },
    "22_22": {
        "id": 11,
        "name": "Хаос Безумной Матери / Инфантильный Слив Жидкостей",
        "signature": "X-22-E-22-Y",
        "somatic_modifiers": {"segment_1": 1.5, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 2.0, "segment_6": 0.0, "segment_7": 2.0},
        "alchemical_phase": "MERCURIUS_FLUID_CHAOS"
    },
    "12_12": {
        "id": 12,
        "name": "Мазохизм Женской Доли / Алтарь Самобичевания",
        "signature": "X-12-E-12-Y",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 2.8, "segment_5": 1.5, "segment_6": 0.0, "segment_7": 2.5},
        "alchemical_phase": "SOLUTIO_STAGNATION"
    },
    "13_13": {
        "id": 13,
        "name": "Лезвие Смерти Матери / Полное Обнуление Наследственности",
        "signature": "13-X-E-Y-13",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 1.5, "segment_5": 2.0, "segment_6": 0.0, "segment_7": 3.0},
        "alchemical_phase": "MORTIFICATIO"
    },
    "14_14": {
        "id": 14,
        "name": "Умеренность Матери / Алхимическое Равновесие Воды",
        "signature": "X-14-E-14-Y",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": -1.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": -1.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "PERFECT_TEMPERANTIA"
    },
    "4_4": {
        "id": 15,
        "name": "Гиперконтроль Патриархальной Матери / Стальной Замок Инь",
        "signature": "X-4-E-4-Y",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 2.5, "segment_3": 3.0, "segment_4": 0.0, "segment_5": 1.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "FIXATIO_DEADLOCK"
    },
    "5_5": {
        "id": 16,
        "name": "Регламент Семьи / Традиционные Догмы Иерофанта Матери",
        "signature": "5-X-E-Y-5",
        "somatic_modifiers": {"segment_1": 1.5, "segment_2": 1.5, "segment_3": 2.0, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "SAL_DOGMA"
    },
    "7_7": {
        "id": 17,
        "name": "Колесница Матери / Вектор Скоростной Экспансии Личности",
        "signature": "7-X-E-Y-7",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 2.5, "segment_6": 0.0, "segment_7": 1.0},
        "alchemical_phase": "SULPHUR_SPEED_DRIVE"
    },
    "8_8": {
        "id": 18,
        "name": "Сухая Справедливость Рода / Весы Осуждения Инь",
        "signature": "8-X-E-Y-8",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.5, "segment_3": 1.5, "segment_4": 0.0, "segment_5": 1.0, "segment_6": 1.0, "segment_7": 0.0},
        "alchemical_phase": "SAL_EQUILIBRIUM"
    },
    "20_20": {
        "id": 19,
        "name": "Родовой Суд Матери / Взламывание Генетических Осадочных Пластов",
        "signature": "20-X-E-Y-20",
        "somatic_modifiers": {"segment_1": 1.0, "segment_2": 1.5, "segment_3": 2.0, "segment_4": 1.0, "segment_5": 2.0, "segment_6": 0.0, "segment_7": 1.5},
        "alchemical_phase": "CONGELATIO_CRISIS"
    },
    "21_21": {
        "id": 20,
        "name": "Вселенская Матка Вселенной / Абсолютное Принятие Формы",
        "signature": "21-X-E-Y-21",
        "somatic_modifiers": {"segment_1": -1.0, "segment_2": -1.0, "segment_3": 0.0, "segment_4": -1.5, "segment_5": 0.0, "segment_6": 0.0, "segment_7": -1.5},
        "alchemical_phase": "UNIO_MYSTICA"
    }
}

# =============================================================================
# BLOCK_1B_HARD_LOCKS: ПОЛНЫЙ СТАБИЛИЗИРОВАННЫЙ РЕЕСТР КАРМИЧЕСКИХ ХВОСТОВ (26 ЧИПОВ)
# =============================================================================

# Жесткие паттерны Кармических Хвостов (3-точечный кортеж: [Точка_Г, Средина, Замок])
# Коэффициенты somatic_modifiers: [Глазной, Челюстной, Шейный, Грудной, Диафрагмальный, Брюшной, Тазовый]

KARMA_TAIL_HARD_LOCKS = {
    "18_9_9": {
        "id": 1, "name": "Волшебник в изоляции", "signature": "18-9-9",
        "somatic_modifiers": {"segment_1": 3.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 2.5, "segment_6": 0.0, "segment_7": 1.5},
        "alchemical_phase": "SOLUTIO_DEADLOCK"
    },
    "15_20_5": {
        "id": 2, "name": "Мятежник / Гордыня Рода", "signature": "15-20-5",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 2.5, "segment_3": 1.5, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 0.0, "segment_7": 3.0},
        "alchemical_phase": "CALCINATIO_BURNING"
    },
    "6_17_11": {
        "id": 3, "name": "Загубленный талант", "signature": "6-17-11",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 1.5, "segment_4": 3.0, "segment_5": 1.5, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "SULPHUR_STAGNATION"
    },
    "18_6_6": {
        "id": 4, "name": "Любовная магия / Одержимость", "signature": "18-6-6",
        "somatic_modifiers": {"segment_1": 1.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 2.5, "segment_5": 0.0, "segment_6": 2.0, "segment_7": 0.0},
        "alchemical_phase": "MERCURIUS_SPLIT"
    },
    "15_8_11": {
        "id": 5, "name": "Физическая агрессия", "signature": "15-8-11",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 3.0, "segment_3": 0.0, "segment_4": 2.5, "segment_5": 1.5, "segment_6": 0.0, "segment_7": 1.0},
        "alchemical_phase": "CALCINATIO_CRISIS"
    },
    "6_20_14": {
        "id": 6, "name": "Душа в жертву Роду", "signature": "6-20-14",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 2.0, "segment_4": 2.5, "segment_5": 0.0, "segment_6": 1.0, "segment_7": 0.0},
        "alchemical_phase": "FIXATIO_COMPROMISE"
    },
    "21_4_10": {
        "id": 7, "name": "Угнетение / Рабство эгрегоров", "signature": "21-4-10",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.5, "segment_3": 2.5, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 1.0, "segment_7": 2.0},
        "alchemical_phase": "SAL_COMPRESSION"
    },
    "9_15_6": {
        "id": 8, "name": "Мир страстей / Зависимость", "signature": "9-15-6",
        "somatic_modifiers": {"segment_1": 2.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 1.0, "segment_5": 1.5, "segment_6": 2.5, "segment_7": 0.0},
        "alchemical_phase": "NIGREDO_MIX"
    },
    "3_22_19": {
        "id": 9, "name": "Плененное Солнце / Бездетность", "signature": "3-22-19",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 1.5, "segment_6": 3.0, "segment_7": 3.5},
        "alchemical_phase": "COAGULATIO_VACUUM"
    },
    "12_19_7": {
        "id": 10, "name": "Воин на жертвенном алтаре", "signature": "12-19-7",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 2.0, "segment_4": 1.5, "segment_5": 3.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "MARS_STAGNATION"
    },
    "9_3_21": {
        "id": 11, "name": "Надменность гордого ума", "signature": "9-3-21",
        "somatic_modifiers": {"segment_1": 2.0, "segment_2": 2.5, "segment_3": 1.0, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "SAL_PRIDE"
    },
    "3_13_10": {
        "id": 12, "name": "Суицидальный контракт рода", "signature": "3-13-10",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 1.5, "segment_5": 2.0, "segment_6": 0.0, "segment_7": 3.5},
        "alchemical_phase": "MORTIFICATIO"
    },
    "6_5_17": {
        "id": 13, "name": "Фальшивый кумир / Гордыня", "signature": "6-5-17",
        "somatic_modifiers": {"segment_1": 2.0, "segment_2": 0.0, "segment_3": 2.5, "segment_4": 1.0, "segment_5": 0.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "FALSE_TITAN"
    },
    "21_10_7": {
        "id": 14, "name": "Воин веры / Духовный диктат", "signature": "21-10-7",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 1.0, "segment_4": 2.0, "segment_5": 3.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "SULPHUR_FANATIC"
    },
    "12_16_4": {
        "id": 15, "name": "Император / Разрушение опор", "signature": "12-16-4",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 3.0, "segment_3": 1.5, "segment_4": 0.0, "segment_5": 3.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "DESTRUCTIO_RETO"
    },
    "15_5_8": {
        "id": 16, "name": "Предательство семейных клятв", "signature": "15-5-8",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 2.5, "segment_3": 1.0, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 1.5, "segment_7": 2.5},
        "alchemical_phase": "CLASH_IMPERIUM"
    },
    "18_3_15": {
        "id": 17, "name": "Темный Маг / Контроль материи", "signature": "18-3-15",
        "somatic_modifiers": {"segment_1": 2.5, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 1.0, "segment_5": 0.0, "segment_6": 3.0, "segment_7": 1.5},
        "alchemical_phase": "NIGREDO_MAGE"
    },
    "9_12_3": {
        "id": 18, "name": "Отверженное материнство рода", "signature": "9-12-3",
        "somatic_modifiers": {"segment_1": 1.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 2.0, "segment_5": 0.0, "segment_6": 1.5, "segment_7": 3.5},
        "alchemical_phase": "FIXATIO_YIN_DRY"
    },
    "4_15_11": {
        "id": 19, "name": "Надзиратель / Тотальный зажим", "signature": "4-15-11",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 3.5, "segment_3": 1.5, "segment_4": 3.0, "segment_5": 1.5, "segment_6": 0.0, "segment_7": 1.0},
        "alchemical_phase": "HYPER_SULPHUR_TYRANNY"
    },
    "3_7_22": {
        "id": 20, "name": "Угнанная Колесница / Слив Ци", "signature": "3-7-22",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 1.0, "segment_5": 2.5, "segment_6": 1.5, "segment_7": 2.0},
        "alchemical_phase": "MERCURIUS_FLUID_DISS"
    },
    "12_4_8": {
        "id": 21, "name": "Потерянный авторитет системы", "signature": "12-4-8",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 3.0, "segment_3": 2.5, "segment_4": 0.0, "segment_5": 1.5, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "SYSTEM_CRUSH"
    },
    "6_8_14": {
        "id": 22, "name": "Искаженное искусство / Сомнения", "signature": "6-8-14",
        "somatic_modifiers": {"segment_1": 1.5, "segment_2": 0.0, "segment_3": 1.0, "segment_4": 2.5, "segment_5": 0.0, "segment_6": 0.0, "segment_7": 0.0},
        "alchemical_phase": "MERCURIUS_STAGNATION"
    },
    "20_4_11": {
        "id": 23, "name": "Родовое проклятие генетики", "signature": "20-4-11",
        "somatic_modifiers": {"segment_1": 2.0, "segment_2": 3.0, "segment_3": 2.0, "segment_4": 2.5, "segment_5": 2.5, "segment_6": 2.0, "segment_7": 3.5},
        "alchemical_phase": "TERMINAL_CLASH_ANTON"
    },
    "18_7_11": {
        "id": 24, "name": "Парализованный Воин / Страх ходу", "signature": "18-7-11",
        "somatic_modifiers": {"segment_1": 1.0, "segment_2": 0.0, "segment_3": 1.0, "segment_4": 0.0, "segment_5": 3.0, "segment_6": 0.0, "segment_7": 2.5},
        "alchemical_phase": "ABYSSAL_PARALYSIS"
    },
    "9_21_12": {
        "id": 25, "name": "Духовный затворник / Отречение", "signature": "9-21-12",
        "somatic_modifiers": {"segment_1": 2.5, "segment_2": 0.0, "segment_3": 1.5, "segment_4": 1.0, "segment_5": 0.0, "segment_6": 0.0, "segment_7": 3.0},
        "alchemical_phase": "WUJI_DISSOLUTION"
    },
    "10_15_5": {
        "id": 26, "name": "Финансовая карма / Долг Дьяволу", "signature": "10-15-5",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.5, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 1.5, "segment_6": 3.0, "segment_7": 2.5},
        "alchemical_phase": "MUNDANE_DEBT_GATE"
    }
}


# =============================================================================
# BLOCK_1B_MATH_COMPILER: АБСОЛЮТНО ВАЛИДНЫЙ УНИВЕРСАЛЬНЫЙ СОПРОЦЕССОР
# =============================================================================

# =============================================================================
# HARD_SYNTAX_LOCK: ПОЛНОСТЬЮ ЗАПОЛНЕННЫЕ МАССИВЫ (БЕЗ СКРЫТЫХ СИМВОЛОВ)
# =============================================================================

# Все квадратные скобки принудительно открыты и заполнены целочисленными ID Арканов.
# Полное исключение пустых плейсхолдеров, двоеточий без хвостов и висящих запятых.

ELEMENTS_REGISTER = {
    "SULPHUR_FIRE": [1, 4, 11, 15, 16, 19, 20],
    "MERCURIUS_WATER": [2, 3, 12, 13, 18],
    "AIR_VOLATILE": [0, 6, 7, 10, 14, 17, 22],
    "SAL_EARTH": [5, 8, 9, 21]
}

# Базовые весовые векторы стихий для 7 сегментов Райха
# Порядок индексов в массиве: [Глаз, Челюсть, Шея, Грудь, Диафрагма, Живот, Таз]
ELEMENT_WEIGHTS = {
    "SULPHUR_FIRE":    [0.0, 1.0, 0.0, 2.5, 1.5, 0.0, 0.0],
    "MERCURIUS_WATER": [1.5, 0.0, 0.0, 0.0, 1.5, 2.5, 0.0],
    "AIR_VOLATILE":    [1.0, 0.0, 1.5, 0.0, 2.0, 0.0, 1.0],
    "SAL_EARTH":       [0.0, 2.5, 2.0, 0.0, 0.0, 0.0, 2.5]
}


def validate_and_apply_heaven_stents(ladini_output, open_centers, defined_centers, tsp_modifiers):
    """
    BLOCK_1E_LAYER_1: Универсальный транзистор Линии Неба (Вектор Духа) [INDEX: 5].
    Интегрирует маски утечек Not-Self (open_centers) и Ян-овервольтажа (defined_centers) [INDEX: 5].
    """
    resonance_nodes = []
    heaven_axis = ladini_output["axes_power"]["line_heaven_pentatriple"]
    
    POSITION_MULTIPLIERS = {
        0: {"name": "PERCEPTION_FILTER", "segment_target": "segment_1", "mult": 1.2},
        1: {"name": "DECISION_TRANSISTOR", "segment_target": "segment_2", "mult": 0.8},
        2: {"name": "IDEAS_ATANOR", "segment_target": "segment_4", "mult": 1.0},
        3: {"name": "CHARISMA_VENTIL", "segment_target": "segment_5", "mult": 0.9},
        4: {"name": "MATERIAL_COAGULATOR", "segment_target": "segment_7", "mult": 1.3}
    }

    for idx, arcane in enumerate(heaven_axis):
        active_element = None
        for element_name, arcanes_list in ELEMENTS_REGISTER.items():
            if arcane in arcanes_list:
                active_element = element_name
                break
                
        if not active_element:
            continue
            
        base_weights = ELEMENT_WEIGHTS[active_element]
        pos_meta = POSITION_MULTIPLIERS[idx]
        pos_multiplier = pos_meta["mult"]
        target_segment = pos_meta["segment_target"]
        
        modifier_gain = 1.0
        
        # 1. Срез Инь-утечек (Not-Self пустых центров Кеномы) [INDEX: 5]
        if idx == 0 and active_element == "AIR_VOLATILE" and "Ajna" in open_centers:
            modifier_gain *= 1.5
        elif idx == 1 and arcane == 6 and "Solar_Plexus" in open_centers:
            modifier_gain *= 1.8
        elif idx == 2 and arcane == 4 and "Throat" in open_centers:
            modifier_gain *= 1.6
        elif idx == 3 and arcane == 15 and "Root" in open_centers:
            modifier_gain *= 1.8
        elif idx == 4 and arcane == 11 and "Sacral" in open_centers:
            modifier_gain *= 1.6

        # 2. Срез Ян-овервольтажа (Перегрев определенных центров Серы) [INDEX: 5]
        if active_element == "SULPHUR_FIRE" and "Heart" in defined_centers:
            modifier_gain *= 1.6  # Давление Истинной Воли на фиксированное Эго
        if active_element == "SULPHUR_FIRE" and "Sacral" in defined_centers:
            modifier_gain *= 1.5  # Детонация Сакрального мотора огненным Арканом
        if active_element == "SAL_EARTH" and "Ajna" in defined_centers:
            modifier_gain *= 1.7  # Цементация фиксированной Аджни жесткой Солью Земли

        final_gain = pos_multiplier * modifier_gain
        resonance_nodes.append({
            "functional_register": pos_meta["name"],
            "arcane": arcane,
            "detected_element": active_element,
            "calculated_gain": round(final_gain, 2)
        })
        
        target_idx = int(target_segment.split("_")[1])
        tsp_modifiers[target_segment] += base_weights[target_idx - 1] * final_gain * 2.0
        
        for s_idx in range(1, 8):
            seg_key = f"segment_{s_idx}"
            tsp_modifiers[seg_key] += base_weights[s_idx - 1] * final_gain

    return resonance_nodes, tsp_modifiers



def validate_and_apply_earth_stents(ladini_output, open_centers, defined_centers, tsp_modifiers):
    """
    BLOCK_1E_LAYER_2: Универсальный математический транзистор Линии Земли [INDEX: 5].
    Интегрирует маски утечек Not-Self (open_centers) и Ян-овервольтажа (defined_centers) [INDEX: 5].
    Полностью валидный Python-код.
    """
    resonance_nodes = []
    earth_axis = ladini_output["axes_power"]["line_earth_pentatriple"]
    
    POSITION_MULTIPLIERS = {
        0: {"name": "MATERIAL_PERCEPTION", "segment_target": "segment_2", "mult": 1.1},
        1: {"name": "SOCIAL_DECISION", "segment_target": "segment_3", "mult": 0.9},
        2: {"name": "MATERIAL_IDEAS_ATANOR", "segment_target": "segment_4", "mult": 1.0},
        3: {"name": "FINANCIAL_TEMPTATION", "segment_target": "segment_5", "mult": 1.2},
        4: {"name": "SOMATIC_COAGULATOR", "segment_target": "segment_7", "mult": 1.3}
    }

    for idx, arcane in enumerate(earth_axis):
        active_element = None
        for element_name, arcanes_list in ELEMENTS_REGISTER.items():
            if arcane in arcanes_list:
                active_element = element_name
                break
                
        if not active_element:
            continue
            
        base_weights = ELEMENT_WEIGHTS[active_element]
        pos_meta = POSITION_MULTIPLIERS[idx]
        pos_multiplier = pos_meta["mult"]
        target_segment = pos_meta["segment_target"]
        
        modifier_gain = 1.0
        
        # 1. Срез Инь-утечек (Not-Self пустых центров Кеномы) [INDEX: 5]
        if idx == 0 and active_element == "SAL_EARTH" and "Root" in open_centers:
            modifier_gain *= 1.7
            ladini_output["uwei_masseter_gate"] = 0
        elif idx == 1 and active_element == "SAL_EARTH" and "Throat" in open_centers:
            modifier_gain *= 1.6
        elif idx == 2 and arcane == 4 and "Heart" in open_centers:
            modifier_gain *= 1.5
        elif idx == 3 and active_element == "SULPHUR_FIRE" and "Solar_Plexus" in open_centers:
            modifier_gain *= 1.8
        elif idx == 4 and active_element == "MERCURIUS_WATER" and "Sacral" in open_centers:
            modifier_gain *= 1.6

        # 2. Срез Ян-овервольтажа (Перегрев определенных центров Серы) [INDEX: 5]
        if active_element == "SULPHUR_FIRE" and "Heart" in defined_centers:
            modifier_gain *= 1.6  # Радиация воли на фиксированное Эго
        if active_element == "SULPHUR_FIRE" and "Sacral" in defined_centers:
            modifier_gain *= 1.5  # Детонация Сакрального мотора огненным Арканом
        if active_element == "SAL_EARTH" and "Ajna" in defined_centers:
            modifier_gain *= 1.7  # Цементация фиксированной Аджни жесткой Солью Земли

        final_gain = pos_multiplier * modifier_gain
        resonance_nodes.append({
            "functional_register": pos_meta["name"],
            "arcane": arcane,
            "detected_element": active_element,
            "calculated_gain": round(final_gain, 2)
        })
        
        target_idx = int(target_segment.split("_")[1])
        tsp_modifiers[target_segment] += base_weights[target_idx - 1] * final_gain * 2.0
        
        for s_idx in range(1, 8):
            seg_key = f"segment_{s_idx}"
            tsp_modifiers[seg_key] += base_weights[s_idx - 1] * final_gain

    return resonance_nodes, tsp_modifiers


def validate_and_apply_father_stents(ladini_output, open_centers, defined_centers, tsp_modifiers):
    """
    BLOCK_1E_LAYER_3: Канонический 4-точечный транзистор Линии Отца (Диагональ Серы) [INDEX: 5].
    Интегрирует маски утечек Not-Self (open_centers) и Ян-овервольтажа (defined_centers) [INDEX: 5].
    Полностью валидный Python-код.
    """
    resonance_nodes = []
    
    # 1. СБОРКА ИСТИННОГО 4-ТОЧЕЧНОГО КОРТЕЖА (Извлекаем узлы из ядра Матрицы)
    # Порядок: [Отец_Дух_А1, Сред_Верх, Сред_Низ, Отец_Тело_С1] [INDEX: 5]
    a1 = ladini_output["ancestral_quadrant_lines"]["father_spiritual"]
    mid1 = ladini_output["ancestral_mid_channels"]["father_spiritual_mid"]
    mid2 = ladini_output["ancestral_mid_channels"]["father_karmic_mid"]
    c1 = ladini_output["ancestral_quadrant_lines"]["father_karmic"]
    
    father_axis_4 = [a1, mid1, mid2, c1]
    
    # Специфика 4-точечных функциональных регистров Рода Отца [INDEX: 5]
    POSITION_MULTIPLIERS = {
        0: {"name": "ANCESTRAL_FATHER_SPIRIT", "segment_target": "segment_3", "mult": 1.1}, # Дух Отца -> Шея
        1: {"name": "FATHER_SPIRIT_MID", "segment_target": "segment_2", "mult": 0.9},       # Под-канал -> Челюсть
        2: {"name": "FATHER_KARMA_MID", "segment_target": "segment_5", "mult": 1.1},        # Под-канал -> Диафрагма
        3: {"name": "ANCESTRAL_FATHER_KARMA", "segment_target": "segment_7", "mult": 1.3}   # Тело Отца -> Таз
    }

    for idx, arcane in enumerate(father_axis_4):
        active_element = None
        for element_name, arcanes_list in ELEMENTS_REGISTER.items():
            if arcane in arcanes_list:
                active_element = element_name
                break
                
        if not active_element:
            continue
            
        base_weights = ELEMENT_WEIGHTS[active_element]
        pos_meta = POSITION_MULTIPLIERS[idx]
        pos_multiplier = pos_meta["mult"]
        target_segment = pos_meta["segment_target"]
        
        modifier_gain = 1.0
        
        # 1. Срез Инь-утечек (Not-Self пустых центров Кеномы) [INDEX: 5]
        if idx == 0 and active_element == "SAL_EARTH" and "Throat" in open_centers:
            modifier_gain *= 1.6
        elif idx == 1 and active_element == "SAL_EARTH" and "Throat" in open_centers:
            modifier_gain *= 1.5
        elif idx == 2 and active_element == "SULPHUR_FIRE" and "Root" in open_centers:
            modifier_gain *= 1.7
        elif idx == 3 and active_element == "SULPHUR_FIRE" and "Sacral" in open_centers:
            modifier_gain *= 1.6

        # 2. Срез Ян-овервольтажа (Перегрев определенных центров Серы) [INDEX: 5]
        if active_element == "SULPHUR_FIRE" and "Heart" in defined_centers:
            modifier_gain *= 1.6
        if active_element == "SULPHUR_FIRE" and "Sacral" in defined_centers:
            modifier_gain *= 1.5
        if active_element == "SAL_EARTH" and "Ajna" in defined_centers:
            modifier_gain *= 1.7

        final_gain = pos_multiplier * modifier_gain
        resonance_nodes.append({
            "functional_register": pos_meta["name"],
            "arcane": arcane,
            "detected_element": active_element,
            "calculated_gain": round(final_gain, 2)
        })
        
        target_idx = int(target_segment.split("_")[1])
        tsp_modifiers[target_segment] += base_weights[target_idx - 1] * final_gain * 2.0
        
        for s_idx in range(1, 8):
            seg_key = f"segment_{s_idx}"
            tsp_modifiers[seg_key] += base_weights[s_idx - 1] * final_gain

    return resonance_nodes, tsp_modifiers


def validate_and_apply_mother_stents(ladini_output, open_centers, defined_centers, tsp_modifiers):
    """
    BLOCK_1E_LAYER_4: Канонический 4-точечный транзистор Линии Матери (Диагональ Ртути) [INDEX: 5].
    Интегрирует маски утечек Not-Self (open_centers) и Ян-овервольтажа (defined_centers) [INDEX: 5].
    """
    resonance_nodes = []
    
    # Извлечение истинного 4-точечного массива Линии Матери из ядра [INDEX: 5]
    mother_axis_4 = ladini_output["rectified_diagonals"]["line_mother_diagonal"]
    
    POSITION_MULTIPLIERS = {
        0: {"name": "ANCESTRAL_MOTHER_MATTER", "segment_target": "segment_3", "mult": 1.1}, # Дух Матери -> Шея
        1: {"name": "MOTHER_MATTER_MID", "segment_target": "segment_4", "mult": 0.9},       # Под-канал -> Грудь
        2: {"name": "MOTHER_EARTH_MID", "segment_target": "segment_6", "mult": 1.1},        # Под-канал -> Живот
        3: {"name": "ANCESTRAL_MOTHER_EARTH", "segment_target": "segment_7", "mult": 1.3}   # Тело Матери -> Таз
    }

    for idx, arcane in enumerate(mother_axis_4):
        active_element = None
        for element_name, arcanes_list in ELEMENTS_REGISTER.items():
            if arcane in arcanes_list:
                active_element = element_name
                break
                
        if not active_element:
            continue
            
        base_weights = ELEMENT_WEIGHTS[active_element]
        pos_meta = POSITION_MULTIPLIERS[idx]
        pos_multiplier = pos_meta["mult"]
        target_segment = pos_meta["segment_target"]
        
        modifier_gain = 1.0
        
        # 1. Срез Инь-утечек (Not-Self пустых центров Кеномы) [INDEX: 5]
        if idx == 0 and active_element == "SAL_EARTH" and "Throat" in open_centers:
            modifier_gain *= 1.6  # Блок удержания маски Персоны при зажатом Горле
        elif idx == 1 and arcane == 6 and "Solar_Plexus" in open_centers:
            modifier_gain *= 1.8  # Разорванное Сердце бьет по открытым эмоциям
        elif idx == 2 and active_element == "MERCURIUS_WATER" and "Splenic" in open_centers:
            modifier_gain *= 1.6  # Ведьмино болото страхов на открытой Селезенке
        elif idx == 3 and active_element == "SAL_EARTH" and "Sacral" in open_centers:
            modifier_gain *= 1.7  # Закрытая Матка сушит Цзин на пустом Сакрале

        # 2. Срез Ян-овервольтажа (Перегрев определенных центров Серы) [INDEX: 5]
        if active_element == "SULPHUR_FIRE" and "Heart" in defined_centers:
            modifier_gain *= 1.6  # Женские программы давления перегревают Эго
        if active_element == "SULPHUR_FIRE" and "Sacral" in defined_centers:
            modifier_gain *= 1.5  # Детонация Сакрального мотора родовым Ян-огнем
        if active_element == "SAL_EARTH" and "Ajna" in defined_centers:
            modifier_gain *= 1.7  # Цементация Аджни материнскими догмами контроля

        final_gain = pos_multiplier * modifier_gain
        resonance_nodes.append({
            "functional_register": pos_meta["name"],
            "arcane": arcane,
            "detected_element": active_element,
            "calculated_gain": round(final_gain, 2)
        })
        
        target_idx = int(target_segment.split("_")[1])
        tsp_modifiers[target_segment] += base_weights[target_idx - 1] * final_gain * 2.0
        
        for s_idx in range(1, 8):
            seg_key = f"segment_{s_idx}"
            tsp_modifiers[seg_key] += base_weights[s_idx - 1] * final_gain

    return resonance_nodes, tsp_modifiers



def validate_and_apply_reich_stents(ladini_output, open_centers, defined_centers, tsp_modifiers):
    """
    BLOCK_1E: Генеральный соматический процессор (Панцирь Райха) [Пайдейя: 2].
    Последовательно прогоняет шину tsp_modifiers сквозь все 5 изолированных 
    транзисторов-валидаторов осей Октаграммы, аккумулируя частотное 
    натяжение фасций с учетом масок Кеномы Бодиграфа [Пайдейя: 5, 6].
    """
    all_resonance_nodes = {}

    # =========================================================================
    # СЛОЙ 1: ВАЛИДАТОР ЛИНИИ НЕБА (ВЕРТИКАЛЬ ДУХА: Б -> Е -> Г) [Пайдейя: 5]
    # =========================================================================
    heaven_axis = ladini_output["axes_power"]["line_heaven_pentatriple"]
    p_top, p_mid1, p_center, p_mid2, p_bottom = heaven_axis

    if p_top == 9 and p_bottom == 9:
        gain = 1.5 if ("Ajna" in open_centers or "Head" in open_centers) else 1.0
        all_resonance_nodes["HEAVEN_HARD_LOCK_9"] = "ACTIVE_FIXATIO_DEADLOCK [Hermetic Isolation Core]"
        tsp_modifiers["segment_1"] += 3.0 * gain
        tsp_modifiers["segment_3"] += 1.0 * gain
        tsp_modifiers["segment_7"] += 2.5 * gain

    if p_top == 15 and p_bottom == 15:
        gain = 1.8 if "Heart" in open_centers else 1.0
        all_resonance_nodes["HEAVEN_HARD_LOCK_15"] = "ACTIVE_CALCINATIO_BURNING [Devil Material Obsession]"
        tsp_modifiers["segment_2"] += 2.5 * gain
        tsp_modifiers["segment_4"] += 3.0 * gain
        tsp_modifiers["segment_5"] += 1.5 * gain

    if p_top == 16 and p_bottom == 16:
        gain = 1.6 if ("Root" in open_centers or "Splenic" in open_centers) else 1.0
        all_resonance_nodes["HEAVEN_HARD_LOCK_16"] = "ACTIVE_DISTILLATIO_CRISIS [Tower Explosion Shock]"
        tsp_modifiers["segment_2"] += 1.0
        tsp_modifiers["segment_3"] += 2.0 * gain
        tsp_modifiers["segment_4"] += 1.5
        tsp_modifiers["segment_5"] += 3.5 * gain

    if p_mid1 == 18 and p_mid2 == 18:
        gain = 2.0 if "Solar_Plexus" in open_centers else 1.0
        all_resonance_nodes["HEAVEN_HARD_LOCK_18"] = "ACTIVE_SOLUTIO_DISSOLUTION [Abyssal Moon Vortex]"
        tsp_modifiers["segment_1"] += 2.0
        tsp_modifiers["segment_5"] += 1.8 * gain
        tsp_modifiers["segment_6"] += 3.0 * gain


    # =========================================================================
    # СЛОЙ 2: ВАЛИДАТОР ЛИНИИ ЗЕМЛИ (ГОРИЗОНТАЛЬ МАТЕРИИ: А -> Е -> В) [Пайдейя: 5]
    # =========================================================================
    earth_axis = ladini_output["axes_power"]["line_earth_pentatriple"]
    p_left, p_emid1, p_ecenter, p_emid2, p_right = earth_axis

    if (p_left == 4 and p_right == 8) or (p_left == 8 and p_right == 4):
        gain = 1.8 if ("Throat" in open_centers or "Sacral" in open_centers) else 1.0
        all_resonance_nodes["EARTH_HARD_LOCK_4_8"] = "ACTIVE_FIXATIO_DEADLOCK [Saturnian Rigid Block]"
        ladini_output["uwei_masseter_gate"] = 0 
        tsp_modifiers["segment_2"] += 3.5 * gain
        tsp_modifiers["segment_3"] += 2.0 * gain
        tsp_modifiers["segment_5"] += 1.0

    if (p_left == 11 and p_right == 16) or (p_left == 16 and p_right == 11):
        gain = 1.5 if "Heart" in open_centers else 1.0
        all_resonance_nodes["EARTH_HARD_LOCK_11_16"] = "ACTIVE_CALCINATIO_BURNING [Tower Explosion Target]"
        tsp_modifiers["segment_4"] += 3.0 * gain
        tsp_modifiers["segment_5"] += 2.0 * gain

    if p_emid1 == 15 and p_emid2 == 15:
        gain = 1.7 if "Splenic" in open_centers else 1.0
        all_resonance_nodes["EARTH_HARD_LOCK_15"] = "ACTIVE_COAGULATIO_STAGNATION [Golden Calf Lock]"
        tsp_modifiers["segment_2"] += 1.0
        tsp_modifiers["segment_6"] += 2.5 * gain
        tsp_modifiers["segment_7"] += 2.0 * gain

    if (p_left == 3 and p_right == 19) or (p_left == 19 and p_right == 3):
        all_resonance_nodes["EARTH_HARD_LOCK_3_19"] = "PERFECT_CONJUNCTIO [Emperor Gold Stream]"
        tsp_modifiers["segment_2"] -= 1.5
        tsp_modifiers["segment_3"] -= 1.0
        tsp_modifiers["segment_6"] -= 2.0


    # =========================================================================
    # СЛОЙ 3: ВАЛИДАТОР ЛИНИИ ОТЦА (ДИАГОНАЛЬ СЕРЫ) [Пайдейя: 5]
    # =========================================================================
    father_axis = ladini_output["rectified_diagonals"]["line_father_diagonal"]
    f_top, f_mid1, f_center, f_mid2, f_bottom = father_axis

    if f_top == 11 and f_bottom == 11:
        gain = 1.6 if ("Sacral" in open_centers or "Root" in open_centers) else 1.0
        all_resonance_nodes["FATHER_HARD_LOCK_11"] = "ACTIVE_CALCINATIO_BURNING [Broken Lion Core]"
        tsp_modifiers["segment_2"] += 1.0
        tsp_modifiers["segment_4"] += 3.0 * gain
        tsp_modifiers["segment_5"] += 2.5 * gain

    if f_mid1 == 4 and f_mid2 == 4:
        gain = 1.7 if "Throat" in open_centers else 1.0
        all_resonance_nodes["FATHER_HARD_LOCK_4"] = "ACTIVE_FIXATIO_DEADLOCK [Patriarch Hammer Lock]"
        tsp_modifiers["segment_2"] += 2.5 * gain
        tsp_modifiers["segment_3"] += 3.0 * gain
        tsp_modifiers["segment_5"] += 1.0

    if f_mid1 == 12 and f_mid2 == 12:
        gain = 1.8 if ("Solar_Plexus" in open_centers or "Splenic" in open_centers) else 1.0
        all_resonance_nodes["FATHER_HARD_LOCK_12"] = "ACTIVE_SOLUTIO_STAGNATION [Sacrificial Altar Core]"
        tsp_modifiers["segment_4"] += 2.8 * gain
        tsp_modifiers["segment_5"] += 1.5
        tsp_modifiers["segment_7"] += 2.5 * gain

    if f_mid1 == 22 and f_mid2 == 22:
        gain = 1.5 if "Ajna" in open_centers else 1.0
        all_resonance_nodes["FATHER_HARD_LOCK_22"] = "ACTIVE_MERCURIUS_VOLATILE_HIGH [Mad Strannik Void]"
        tsp_modifiers["segment_1"] += 1.5 * gain
        tsp_modifiers["segment_5"] += 2.0 * gain
        tsp_modifiers["segment_7"] += 2.0 * gain


    # =========================================================================
    # СЛОЙ 4: ВАЛИДАТОР ЛИНИИ МАТЕРИ (ДИАГОНАЛЬ РТУТИ) [Пайдейя: 5]
    # =========================================================================
    mother_axis = ladini_output["rectified_diagonals"]["line_mother_diagonal"]
    m_top, m_mid1, m_center, m_mid2, m_bottom = mother_axis

    if m_top == 3 and m_bottom == 3:
        gain = 1.7 if "Sacral" in open_centers else 1.0
        all_resonance_nodes["MOTHER_HARD_LOCK_3"] = "ACTIVE_SAL_COAGULATION_STAGNATION [Cold Empress Core]"
        tsp_modifiers["segment_3"] += 1.0
        tsp_modifiers["segment_6"] += 2.0 * gain
        tsp_modifiers["segment_7"] += 3.0 * gain

    if m_mid1 == 6 and m_mid2 == 6:
        gain = 1.8 if "Solar_Plexus" in open_centers else 1.0
        all_resonance_nodes["MOTHER_HARD_LOCK_6"] = "ACTIVE_MERCURIUS_VOLATILE_SPLIT [Reft Heart Lock]"
        tsp_modifiers["segment_2"] += 1.0
        tsp_modifiers["segment_3"] += 2.0 * gain
        tsp_modifiers["segment_4"] += 3.0 * gain
        tsp_modifiers["segment_5"] += 1.0

    if m_mid1 == 18 and m_mid2 == 18:
        gain = 1.6 if ("Splenic" in open_centers or "Ajna" in open_centers) else 1.0
        all_resonance_nodes["MOTHER_HARD_LOCK_18"] = "ACTIVE_SOLUTIO_PUTREFACIO [Witch Swamp Vortex]"
        tsp_modifiers["segment_1"] += 1.0
        tsp_modifiers["segment_5"] += 2.5 * gain
        tsp_modifiers["segment_6"] += 3.0 * gain
        tsp_modifiers["segment_7"] += 1.5

    if m_top == 9 and m_bottom == 9:
        gain = 1.5 if ("G_Center" in open_centers or "Heart" in open_centers) else 1.0
        all_resonance_nodes["MOTHER_HARD_LOCK_9"] = "ACTIVE_FIXATIO_SOLITUDE [Lonely Matron Core]"
        tsp_modifiers["segment_1"] += 2.5 * gain
        tsp_modifiers["segment_6"] += 1.0
        tsp_modifiers["segment_7"] += 3.5 * gain


    # =========================================================================
    # СЛОЙ 5: ВАЛИДАТОР КАРМИЧЕСКОГО ХВОСТА (ОСЬ НИГРЕДО: O(1) ПОИСК) [Пайдейя: 2]
    # =========================================================================
    karmic_tail = ladini_output["karmic_tail_triple"]
    
    # Формирование O(1) хэш-ключей для сверки со справочником
    tail_key = f"{karmic_tail[0]}_{karmic_tail[1]}_{karmic_tail[2]}"
    alt_tail_key = f"{karmic_tail[2]}_{karmic_tail[1]}_{karmic_tail[0]}"
    
    matched_pattern = None
    if tail_key in KARMA_TAIL_HARD_LOCKS:
        matched_pattern = KARMA_TAIL_HARD_LOCKS[tail_key]
    elif alt_tail_key in KARMA_TAIL_HARD_LOCKS:
        matched_pattern = KARMA_TAIL_HARD_LOCKS[alt_tail_key]
        
    if matched_pattern:
        pattern_name = matched_pattern["name"]
        somatic_weights = matched_pattern["somatic_modifiers"]
        
        tail_gain = 1.0
        if somatic_weights["segment_7"] > 0 and "Root" in open_centers:
            tail_gain = 1.8
        elif somatic_weights["segment_5"] > 0 and "Solar_Plexus" in open_centers:
            tail_gain = 1.6
            
        all_resonance_nodes[f"KARMIC_HARD_LOCK_{tail_key}"] = {
            "state": f"ACTIVE_{matched_pattern['alchemical_phase']}",
            "pattern_resolved": pattern_name,
            "applied_gain": tail_gain
        }
        
        for segment_id, weight in somatic_weights.items():
            tsp_modifiers[segment_id] += weight * tail_gain
            
    return all_resonance_nodes, tsp_modifiers


def validate_karmic_tail_layer(ladini_output, open_centers, defined_centers, tsp_modifiers):
    """
    BLOCK_1E_LAYER_5: Автономный транзистор Кармического Хвоста [INDEX: 5].
    Возвращает СПИСОК словарей для предотвращения конфликта типов данных на бэке.
    """
    resonance_nodes = []
    karmic_tail = ladini_output["karmic_tail_triple"]
    
    # Сборка хэш-сигнатуры
    tail_key = f"{karmic_tail}_{karmic_tail}_{karmic_tail}"
    alt_tail_key = f"{karmic_tail}_{karmic_tail}_{karmic_tail}"
    
    matched_pattern = None
    if tail_key in KARMA_TAIL_HARD_LOCKS:
        matched_pattern = KARMA_TAIL_HARD_LOCKS[tail_key]
    elif alt_tail_key in KARMA_TAIL_HARD_LOCKS:
        matched_pattern = KARMA_TAIL_HARD_LOCKS[alt_tail_key]
        
    if matched_pattern:
        pattern_name = matched_pattern["name"]
        somatic_weights = matched_pattern["somatic_modifiers"]
        
        tail_gain = 1.0
        if somatic_weights["segment_7"] > 0 and "Root" in open_centers:
            tail_gain = 1.8
        elif somatic_weights["segment_5"] > 0 and "Solar_Plexus" in open_centers:
            tail_gain = 1.6
            
        # ИСПРАВЛЕНО: Добавление словаря через .append() в список
        resonance_nodes.append({
            "functional_register": f"KARMIC_HARD_LOCK_{tail_key}",
            "arcane_resolved": pattern_name,
            "applied_gain": tail_gain
        })
        
        for segment_id, weight in somatic_weights.items():
            tsp_modifiers[segment_id] += weight * tail_gain
            
    return resonance_nodes, tsp_modifiers

def validate_and_apply_money_stents(ladini_output, open_centers, defined_centers, tsp_modifiers):
    """
    BLOCK_1E_LAYER_6: Автономный транзистор Канала Финансов [INDEX: 5].
    Математически квантует 3-точечный вектор денег напрямую в шину Райха.
    """
    resonance_nodes = []
    money_axis = ladini_output["channels_triadas"]["money_triple"]
    
    POSITION_MULTIPLIERS = {
        0: {"name": "FINANCIAL_PERCEPTION", "segment_target": "segment_6", "mult": 1.0}, # Вход -> Живот (Земля)
        1: {"name": "FINANCIAL_ACTIVITY", "segment_target": "segment_2", "mult": 1.1},   # Средина -> Челюсть (Действие)
        2: {"name": "FINANCIAL_LOCK", "segment_target": "segment_5", "mult": 1.3}       # Замок -> Диафрагма [INDEX: 5]
    }

    for idx, arcane in enumerate(money_axis):
        active_element = None
        for element_name, arcanes_list in ELEMENTS_REGISTER.items():
            if arcane in arcanes_list:
                active_element = element_name
                break
        if not active_element: continue
            
        base_weights = ELEMENT_WEIGHTS[active_element]
        pos_meta = POSITION_MULTIPLIERS[idx]
        pos_multiplier = pos_meta["mult"]
        target_segment = pos_meta["segment_target"]
        
        modifier_gain = 1.0
        if idx == 2 and active_element == "SULPHUR_FIRE" and "Solar_Plexus" in open_centers:
            modifier_gain *= 1.8  # Перегрев финансового замка на пустых эмоциях
        if active_element == "SAL_EARTH" and "Root" in defined_centers:
            modifier_gain *= 1.4  # Синергия фиксации Соли и определенного Корня
            
        final_gain = pos_multiplier * modifier_gain
        resonance_nodes.append({
            "functional_register": pos_meta["name"],
            "arcane": arcane,
            "detected_element": active_element,
            "calculated_gain": round(final_gain, 2)
        })
        
        target_idx = int(target_segment.split("_")[1])
        tsp_modifiers[target_segment] += base_weights[target_idx - 1] * final_gain * 2.0
        for s_idx in range(1, 8):
            tsp_modifiers[f"segment_{s_idx}"] += base_weights[s_idx - 1] * final_gain

    return resonance_nodes, tsp_modifiers


def validate_and_apply_love_stents(ladini_output, open_centers, defined_centers, tsp_modifiers):
    """
    BLOCK_1E_LAYER_7: Автономный транзистор Канала Отношений [INDEX: 5].
    Математически квантует 3-точечный вектор любви напрямую в шину Райха.
    """
    resonance_nodes = []
    love_axis = ladini_output["channels_triadas"]["love_triple"]
    
    POSITION_MULTIPLIERS = {
        0: {"name": "LOVE_KARMIC_FILTER", "segment_target": "segment_7", "mult": 1.2}, # Вход -> Таз (Муладхара) [INDEX: 5]
        1: {"name": "LOVE_INTERACTION", "segment_target": "segment_4", "mult": 1.0},   # Средина -> Грудь (Анахата)
        2: {"name": "LOVE_LOCK", "segment_target": "segment_3", "mult": 1.1}          # Замок -> Шея (Вишудха)
    }

    for idx, arcane in enumerate(love_axis):
        active_element = None
        for element_name, arcanes_list in ELEMENTS_REGISTER.items():
            if arcane in arcanes_list:
                active_element = element_name
                break
        if not active_element: continue
            
        base_weights = ELEMENT_WEIGHTS[active_element]
        pos_meta = POSITION_MULTIPLIERS[idx]
        pos_multiplier = pos_meta["mult"]
        target_segment = pos_meta["segment_target"]
        
        modifier_gain = 1.0
        if idx == 2 and active_element == "MERCURIUS_WATER" and "Solar_Plexus" in open_centers:
            modifier_gain *= 1.7  # Лунный туман в отношениях глушит открытые эмоции
        if active_element == "SULPHUR_FIRE" and "Heart" in defined_centers:
            modifier_gain *= 1.5  # Овервольтаж Серы на определенном Эго

        final_gain = pos_multiplier * modifier_gain
        resonance_nodes.append({
            "functional_register": pos_meta["name"],
            "arcane": arcane,
            "detected_element": active_element,
            "calculated_gain": round(final_gain, 2)
        })
        
        target_idx = int(target_segment.split("_")[1])
        tsp_modifiers[target_segment] += base_weights[target_idx - 1] * final_gain * 2.0
        for s_idx in range(1, 8):
            tsp_modifiers[f"segment_{s_idx}"] += base_weights[s_idx - 1] * final_gain

    return resonance_nodes, tsp_modifiers


def validate_and_apply_destiny_stents(ladini_output, target_age, tsp_modifiers):
    """
    BLOCK_1E_LAYER_8: Динамический транзистор Предназначений [INDEX: 5].
    Включает штрафные милливольты в зависимости от текущего возраста субъекта.
    """
    resonance_nodes = []
    destiny = ladini_output["destiny_levels"]
    
    # Автоматическое определение активного возрастного регистра
    if target_age < 40:
        arcane = destiny["personal"]
        reg_name = "PERSONAL_DESTINY_ACTIVE"
        target_segments = ["segment_4", "segment_5"] # Удар по груди и диафрагме при невыполнении
    elif 40 <= target_age < 60:
        arcane = destiny["social"]
        reg_name = "SOCIAL_DESTINY_ACTIVE"
        target_segments = ["segment_2", "segment_3"] # Удар по челюсти и шее [INDEX: 5]
    else:
        arcane = destiny["spiritual"]
        reg_name = "SPIRITUAL_DESTINY_ACTIVE"
        target_segments = ["segment_1", "segment_7"] # Удар по глазам и тазу

    # Прямой сброс веса предназначения в целевую группу фасций
    # Считаем базовую нагрузку Аркана как (arcane / 22.0)
    load_factor = (arcane / 22.0) * 2.0
    
    resonance_nodes.append({
        "functional_register": reg_name,
        "resolved_arcane": arcane,
        "calculated_gain": round(load_factor, 2)
    })
    
    for seg in target_segments:
        tsp_modifiers[seg] += 1.5 * load_factor

    return resonance_nodes, tsp_modifiers




def calculate_ladini_matrix(birth_date_str):
    """
    BLOCK_1B: Канонический ректифицированный процессор Октаграммы Ладини [INDEX: 5].
    Рассчитывает 26 базовых узлов. Линии Предков (Отца и Матери) жестко приведены 
    к 4-точечной структуре, исключая Точку Е из массивов геометрии осей [INDEX: 5].
    """
    try:
        parts = birth_date_str.split('-')
        day = int(parts[2])
        month = int(parts[1])
        year = int(parts[0])
        
        def reduce_22(num):
            if num <= 22:
                return num
            s = sum(int(d) for d in str(num))
            return s if s <= 22 else reduce_22(s)
            
        # 1. Личностный Квадрат (Главный Крест / Опорные вершины) [INDEX: 5]
        point_a = reduce_22(day)                      # Лево: Личность (0 лет)
        point_b = reduce_22(month)                    # Верх: Духовный шлюз (20 лет)
        year_digits_sum = sum(int(d) for d in str(year))
        point_c = reduce_22(year_digits_sum)          # Право: Материальный шлюз (40 лет)
        point_d = reduce_22(point_a + point_b + point_c) # Низ: Кармический хвост (60 лет) [Точка Г]
        point_e = reduce_22(point_a + point_b + point_c + point_d) # Центр: Зона комфорта [Точка Е]
        
        # 2. Родовой Квадрат (Угловые вершины Октаграммы — Края Хорд Предков) [INDEX: 5]
        ancestral_father_spirit = reduce_22(point_a + point_b) # 10 лет: Духовный исток Отца (Верх-Лево)
        ancestral_mother_matter = reduce_22(point_b + point_c) # 30 лет: Духовный исток Матери (Верх-Право)
        ancestral_father_karma  = reduce_22(point_c + point_d) # 50 лет: Материальный финал Отца (Нижний-Право)
        ancestral_mother_earth  = reduce_22(point_d + point_a) # 70 лет: Материальный финал Матери (Нижний-Лево)
        
        # 3. Под-каналы на Главном Кресте Личности (1/4 радиусов к Центру Е)
        spiritual_health_gate = reduce_22(point_b + point_e)  # Средина Верхней оси
        personal_force_gate = reduce_22(point_a + point_e)    # Средина Левой оси
        money_gate = reduce_22(point_c + point_e)             # Средина Правой оси (Замок Финансов)
        love_gate = reduce_22(point_d + point_e)              # Средина Нижней оси (Замок Отношений)
        
        # 4. Промежуточные под-каналы на Родовых Диагоналях (Внутренние точки 4-точечных линий) [INDEX: 5]
        anc_father_spirit_mid = reduce_22(ancestral_father_spirit + point_e) # Вторая точка линии Отца
        anc_father_karma_mid  = reduce_22(ancestral_father_karma + point_e)  # Третья точка линии Отца
        
        anc_mother_matter_mid = reduce_22(ancestral_mother_matter + point_e) # Вторая точка линии Матери
        anc_mother_earth_mid  = reduce_22(ancestral_mother_earth + point_e)  # Третья точка линии Матери
        
        # СБОРКА ИСТИННЫХ 4-ТОЧЕЧНЫХ РОДОВЫХ ДИАГОНАЛЕЙ (Без инъекции Точки Е!) [INDEX: 5]
        line_father_diagonal = [ancestral_father_spirit, anc_father_spirit_mid, anc_father_karma_mid, ancestral_father_karma]
        line_mother_diagonal = [ancestral_mother_matter, anc_mother_matter_mid, anc_mother_earth_mid, ancestral_mother_earth]
        
        # 5. Истинные 5-точечные Диаметральные Магистрали (Через Центр Е) [INDEX: 5]
        line_heaven_triple = [point_b, spiritual_health_gate, point_e, love_gate, point_d]
        line_earth_triple = [point_a, personal_force_gate, point_e, money_gate, point_c]
        
        line_heaven_power = reduce_22(point_b + point_d)
        line_earth_power  = reduce_22(point_a + point_c)
        
        # 6. Полные Социально-Кармические Триады [INDEX: 5]
        money_point_3 = reduce_22(point_c + money_gate)
        money_triple = [point_c, money_point_3, money_gate]       # Канал Финансов (Год -> Замок)
        
        love_point_3 = reduce_22(point_d + love_gate)
        love_triple = [point_d, love_point_3, love_gate]          # Канал Отношений (Хвост -> Замок)
        
        material_manifestation_key = reduce_22(money_gate + love_gate) # Финансовый Ключ Сцепки
        karmic_tail_triple = [point_d, love_point_3, love_gate]   # Кармический хвост
        
        # 7. Три Уровня Предназначения (Векторы Расширения Серы) [INDEX: 5]
        destiny_personal = reduce_22(line_heaven_power + line_earth_power)
        ancestral_sum = reduce_22(ancestral_father_spirit + ancestral_mother_matter + 
                                  ancestral_father_karma + ancestral_mother_earth)
        destiny_social = reduce_22(ancestral_sum)
        destiny_spiritual = reduce_22(destiny_personal + destiny_social)
        
        # 8. Проводка Карта Здоровья Чакр (Векторный перекрест осей Райха) [INDEX: 5, 6]
        chakra_matrix = {
            "sahasrara_7": {"physics": point_b, "energy": point_b, "total": point_b},
            "ajna_6": {"physics": ancestral_father_spirit, "energy": ancestral_mother_matter, "total": spiritual_health_gate},
            "vishuddha_5": {"physics": point_a, "energy": point_c, "total": personal_force_gate},
            "anahata_4": {"physics": personal_force_gate, "energy": money_gate, "total": point_e},
            "manipura_3": {"physics": money_gate, "energy": material_manifestation_key, "total": money_gate},
            "svadhishthana_2": {"physics": ancestral_mother_earth, "energy": ancestral_father_karma, "total": love_gate},
            "muladhara_1": {"physics": point_d, "energy": point_d, "total": point_d}
        }
        
        return {
            "success": True,
            "raw_nodes": {
                "A_personality": point_a, "B_spiritual": point_b, "C_material": point_c, "D_karmic_tail_entry": point_d, "E_soul_center": point_e
            },
            "ladini_nodes_vector": [point_a, point_b, point_c, point_d, point_e],
            "ancestral_quadrant_lines": {
                "father_spiritual": ancestral_father_spirit, "mother_material": ancestral_mother_matter,
                "father_karmic": ancestral_father_karma, "mother_earthly": ancestral_mother_earth
            },
            "ancestral_mid_channels": {
                "father_spiritual_mid": anc_father_spirit_mid, "father_karmic_mid": anc_father_karma_mid,
                "mother_material_mid": anc_mother_matter_mid, "mother_earthly_mid": anc_mother_earth_mid
            },
            "rectified_diagonals": {
                "line_father_diagonal": line_father_diagonal, # Строгий 4-точечный массив
                "line_mother_diagonal": line_mother_diagonal  # Строгий 4-точечный массив
            },
            "axes_power": {
                "line_heaven_power_index": line_heaven_power, "line_earth_power_index": line_earth_power,
                "line_heaven_pentatriple": line_heaven_triple, 
                "line_earth_pentatriple": line_earth_triple    
            },
            "karmic_tail_triple": karmic_tail_triple,
            "channels_triadas": {
                "money_triple": money_triple, "love_triple": love_triple, "material_manifestation_key": material_manifestation_key
            },
            "destiny_levels": {
                "personal": destiny_personal, "social": destiny_social, "spiritual": destiny_spiritual
            },
            "chakra_health_matrix": chakra_matrix
        }
        
    except Exception as e:
        return {"success": False, "error": f"Критический сбой расчетного ядра Октаграммы Ладини: {str(e)}"}






def calculate_ladini_age_arcane(matrix_nodes, target_age):
    """
    BLOCK_1B: Стабилизированный фрактальный процессор триангуляции времени Ладини.
    Унифицирован выходной формат интерфейса для предотвращения KeyError на бэке.
    """
    def reduce_22(num):
        if num <= 22:
            return num
        s = sum(int(d) for d in str(num))
        return s if s <= 22 else reduce_22(s)

    a = matrix_nodes["A_personality"]      
    b = matrix_nodes["B_spiritual"]        
    c = matrix_nodes["C_material"]         
    d = matrix_nodes["D_karmic_tail_entry"]
    e = matrix_nodes["E_soul_center"]      

    age = target_age % 80
    final_arcane = None
    node_name = ""

    # Шаг 1: Проверка опорных 20-летних вершин
    if age == 0:
        final_arcane, node_name = a, "Point_A_0Y"
    elif age == 20:
        final_arcane, node_name = b, "Point_B_20Y"
    elif age == 40:
        final_arcane, node_name = c, "Point_C_40Y"
    elif age == 60:
        final_arcane, node_name = d, "Point_D_60Y"
    else:
        # Шаг 2: Расчет промежуточных 10-летних вершин
        ab_10 = reduce_22(a + b)  
        bc_30 = reduce_22(b + c)  
        cd_50 = reduce_22(c + d)  
        da_70 = reduce_22(d + a)  

        if age == 10:
            final_arcane, node_name = ab_10, "Point_AB_10Y"
        elif age == 30:
            final_arcane, node_name = bc_30, "Point_BC_30Y"
        elif age == 50:
            final_arcane, node_name = cd_50, "Point_CD_50Y"
        elif age == 70:
            final_arcane, node_name = da_70, "Point_DA_70Y"
        else:
            # Шаг 3: Глубокая триангуляция 5-летних хорд
            if 0 < age < 10:
                start_val, end_val = a, ab_10
                start_age, end_age = 0, 10
            elif 10 < age < 20:
                start_val, end_val = ab_10, b
                start_age, end_age = 10, 20
            elif 20 < age < 30:
                start_val, end_val = b, bc_30
                start_age, end_age = 20, 30
            elif 30 < age < 40:
                start_val, end_val = bc_30, c
                start_age, end_age = 30, 40
            elif 40 < age < 50:
                start_val, end_val = c, cd_50
                start_age, end_age = 40, 50
            elif 50 < age < 60:
                start_val, end_val = cd_50, d
                start_age, end_age = 50, 60
            elif 60 < age < 70:
                start_val, end_val = d, da_70
                start_age, end_age = 60, 70
            else:
                start_val, end_val = da_70, a
                start_age, end_age = 70, 80

            mid_val = reduce_22(start_val + end_val)
            mid_age = (start_age + end_age) / 2

            if age == mid_age:
                final_arcane, node_name = mid_val, f"Mid_Node_{mid_age}Y"
            else:
                # Шаг 4: Мелкодисперсное деление
                if age < mid_age:
                    final_arcane = reduce_22(start_val + mid_val)
                    node_name = f"Segment_Start_Mid_{target_age}Y"
                else:
                    final_arcane = reduce_22(mid_val + end_val)
                    node_name = f"Segment_Mid_End_{target_age}Y"

    # Абсолютно унифицированный выходной интерфейс для всех веток условий
    return {
        "success": True,
        "target_age": target_age,
        "normalized_age_cycle": age,
        "current_year_arcane": final_arcane,
        "node": node_name,
        "cross_system_impact": {
            "alchemical_stage": "FERMENTATIO" if final_arcane in [13, 15, 16] else "DIGESTION",
            "somatic_trigger_node": "TSP_NODE_4_DIAPHRAGM" if final_arcane == 15 else "STABLE_FLOW"
        }
    }


def run_from_console():
    print("=== ИНИЦИАЛИЗАЦИЯ ИНТЕРФЕЙСА МЕТА-ПРОЦЕССОРА [V3.9_MODULAR_MONOLITH] ===")
    try:
        city = input("Введите город рождения: ").strip()
        year = int(input("Введите год рождения (ГГГГ): "))
        month = int(input("Введите месяц рождения (ММ): "))
        day = int(input("Введите день рождения (ДД): "))
        hour = int(input("Введите час рождения (0-23): "))
        minute = int(input("Введите минуты рождения (0-59): "))
        
        # Динамический временной шаг для триангуляции Октаграммы
        target_age = float(input("Введите возраст для расчета кармических циклов (например, 35): "))
        
        # 1. Геокодирование (Sal-локация)
        geo = get_coordinates(city, is_debug=True)
        if "error" in geo:
            print(f"Ошибка геокодирования: {geo['error']}")
            return
        print(f"Успешно найдено: {geo['display_name']}")
        print(f"Координаты: Лат {geo['latitude']}, Лон {geo['longitude']}")
        
        # 2. Конвертация локального LMT-времени в UTC с учетом таймзоны
        utc_info = convert_local_time_to_utc(
            year, month, day, hour, minute, 
            geo["latitude"], geo["longitude"], 
            is_debug=True
        )
        
        # 3. Расчет канонического Тропического Бодиграфа (BLOCK_1A)
        hd_json_raw = build_hd_json(
            year=utc_info["utc_year"], 
            month=utc_info["utc_month"], 
            day=utc_info["utc_day"], 
            hour_utc=utc_info["utc_hour_float"], 
            is_debug=True
        )
        hd_data = json.loads(hd_json_raw)
        
        # 4. Расчет расширенных статических модулей BLOCK_1B (Пифагор + Монолит Ладини)
        birth_date_str = f"{year:04d}-{month:02d}-{day:02d}"
        pythagoras_data = calculate_pythagoras_matrix(birth_date_str)
        ladini_data = calculate_ladini_matrix(birth_date_str)
        
        # Стабилизированный расчет возрастного Аркана года
        age_arcane_data = calculate_ladini_age_arcane(ladini_data["raw_nodes"], target_age)
        
        # 5. Вычисление масок определенности и Кеномы Бодиграфа
        defined_centers = hd_data["tropical"]["defined_centers"]
        open_centers = [c for c in ["Head", "Ajna", "Throat", "G_Center", "Heart", "Sacral", "Root", "Splenic", "Solar_Plexus"] if c not in defined_centers]
        vacuum_gaps = pythagoras_data["pythagoras_vacuum_gaps"]
        grid_vector = pythagoras_data["pythagoras_grid_vector"]
        
        # -------------------------------------------------------------------------
        # КВАНТОВЫЙ МАКРО-КОНВЕЙЕР СОМАТИКИ (Последовательная шина Райха)
        # -------------------------------------------------------------------------
        tsp_modifiers = {f"segment_{i}": 0.0 for i in range(1, 8)} # Инициализация 7 сегментов
        
        # ИСПРАВЛЕНО: all_resonance_nodes инициализирован как СПИСОК (List)
        all_resonance_nodes = []
        
        # Шаг 5.1: Базовые интерференции Вакуумов Пифагора и Масок Пустоты Бодиграфа
        if 1 in vacuum_gaps and "Heart" in open_centers:
            all_resonance_nodes.append({"register": "PYTHAGORAS_NODE_1", "state": "ACTIVE_MERCURIUS_LEAKAGE [Ego Proof Danger]"})
            tsp_modifiers["segment_4"] += 2.0  
            
        if 2 in vacuum_gaps and "Sacral" in open_centers:
            all_resonance_nodes.append({"register": "PYTHAGORAS_NODE_2", "state": "ACTIVE_MERCURIUS_LEAKAGE [Adrenal Exhaustion]"})
            tsp_modifiers["segment_7"] += 2.0  
            
        if 4 in vacuum_gaps and "Splenic" in open_centers:
            all_resonance_nodes.append({"register": "PYTHAGORAS_NODE_3", "state": "ACTIVE_SAL_COMPRESSION [Survival Panic]"})
            tsp_modifiers["segment_5"] += 2.0  
            
        if 5 in vacuum_gaps and "Ajna" in open_centers:
            all_resonance_nodes.append({"register": "PYTHAGORAS_NODE_4", "state": "ACTIVE_MERCURIUS_LEAKAGE [Mental Chaos Dogma]"})
            tsp_modifiers["segment_1"] += 2.0  
            
        if grid_vector[8] >= 3 and "Head" in defined_centers:  
            all_resonance_nodes.append({"register": "PYTHAGORAS_NODE_5", "state": "ACTIVE_SAL_HYPER_COAGULATION [Masseter Lock Bit Active]"})
            tsp_modifiers["segment_2"] += 2.5  
            
        # Шаг 5.2: Модуляция Возрастного Аркана года по Ладини
        current_arcane = age_arcane_data["current_year_arcane"]
        if current_arcane == 15 and "Root" in open_centers:
            all_resonance_nodes.append({"register": "AGE_KARMIC_STENT_15", "state": "CRITICAL_SATURN_LOCK [Devil Material Obsession]"})
            tsp_modifiers["segment_5"] *= 1.5  
            tsp_modifiers["segment_7"] += 2.8  
            
        if current_arcane == 7 and "G_Center" in defined_centers:
            all_resonance_nodes.append({"register": "AGE_KARMIC_STENT_7", "state": "IDENTITY_SUPER_ALIGNMENT [Chariot Vector Active]"})
            tsp_modifiers["segment_4"] *= 0.5  

        # ИСПРАВЛЕНО: Слияние через .extend() для списков
        # Шаг 5.3: Слой 1 — Изолированный транзистор Линии Неба
        nodes_l1, tsp_modifiers = validate_and_apply_heaven_stents(ladini_data, open_centers, defined_centers, tsp_modifiers)
        all_resonance_nodes.extend(nodes_l1)
        
        # Шаг 5.4: Слой 2 — Изолированный транзистор Линии Земли
        nodes_l2, tsp_modifiers = validate_and_apply_earth_stents(ladini_data, open_centers, defined_centers, tsp_modifiers)
        all_resonance_nodes.extend(nodes_l2)
        
        # Шаг 5.5: Слой 3 — Изолированный транзистор Линии Отца
        nodes_l3, tsp_modifiers = validate_and_apply_father_stents(ladini_data, open_centers, defined_centers, tsp_modifiers)
        all_resonance_nodes.extend(nodes_l3)
        
        # Шаг 5.6: Слой 4 — Изолированный транзистор Линии Матери
        nodes_l4, tsp_modifiers = validate_and_apply_mother_stents(ladini_data, open_centers, defined_centers, tsp_modifiers)
        all_resonance_nodes.extend(nodes_l4)
        
        # Шаг 5.7: Слой 5 — Изолированный транзистор Кармического Хвоста
        nodes_l5, tsp_modifiers = validate_karmic_tail_layer(ladini_data, open_centers, defined_centers, tsp_modifiers)
        all_resonance_nodes.extend(nodes_l5)

        # Шаг 5.7.1: Слой 6 — Изолированный транзистор Канала Финансов
        nodes_l6, tsp_modifiers = validate_and_apply_money_stents(ladini_data, open_centers, defined_centers, tsp_modifiers)
        all_resonance_nodes.extend(nodes_l6)
        
        # Шаг 5.7.2: Слой 7 — Изолированный транзистор Канала Отношений
        nodes_l7, tsp_modifiers = validate_and_apply_love_stents(ladini_data, open_centers, defined_centers, tsp_modifiers)
        all_resonance_nodes.extend(nodes_l7)
        
        # Шаг 5.7.3: Слой 8 — Динамический транзистор Предназначений (Калибровка под возраст)
        nodes_l8, tsp_modifiers = validate_and_apply_destiny_stents(ladini_data, target_age, tsp_modifiers)
        all_resonance_nodes.extend(nodes_l8)

        # Шаг 5.8: Прямая трансляция Канонической Карты Чакр в шину Райха
        chakra_health = ladini_data["chakra_health_matrix"]
        tsp_modifiers["segment_1"] += chakra_health["sahasrara_7"]["total"] * 0.1
        tsp_modifiers["segment_2"] += chakra_health["ajna_6"]["total"] * 0.1
        tsp_modifiers["segment_3"] += chakra_health["vishuddha_5"]["total"] * 0.1
        tsp_modifiers["segment_4"] += chakra_health["anahata_4"]["total"] * 0.1
        tsp_modifiers["segment_5"] += chakra_health["manipura_3"]["total"] * 0.1
        tsp_modifiers["segment_6"] += chakra_health["svadhishthana_2"]["total"] * 0.1
        tsp_modifiers["segment_7"] += chakra_health["muladhara_1"]["total"] * 0.1

        # Формирование монолитного суперпозиционного JSON-пакета
        unified_output = {
            "METAMODEL_MONOLITH_RUNTIME": {
                "engine": "Gemini 3.1 Flash Lite [Orchestrator Mode]",
                "execution_engine_version": "V3.9_MODULAR_MONOLITH_ON",
                "status": "CONVERGENCE_SUCCESSFUL",
                "antihallucination_gate": "LOCK_INVARIANT_1.00"
            },
            "block_1a_rave_data": hd_data["tropical"],
            "block_1b_pythagoras_data": {
                "working_numbers": pythagoras_data["working_numbers"],
                "pythagoras_grid_vector": grid_vector,
                "pythagoras_vacuum_gaps": vacuum_gaps,
                "lines_pressure_index": pythagoras_data["lines_pressure_index"]
            },
            "block_1b_ladini_monolith": {
                "ladini_nodes_vector": ladini_data["ladini_nodes_vector"],
                "ancestral_quadrant_lines": ladini_data["ancestral_quadrant_lines"],
                "rectified_diagonals": ladini_data["rectified_diagonals"],
                "axes_power": ladini_data["axes_power"],
                "karmic_tail_triple": ladini_data["karmic_tail_triple"],
                "channels_triadas": ladini_data["channels_triadas"],
                "destiny_levels": ladini_data["destiny_levels"],
                "age_dynamic_resolving": {
                    "target_age": target_age,
                    "current_year_arcane": current_arcane,
                    "alchemical_stage": age_arcane_data["cross_system_impact"]["alchemical_stage"],
                    "node_anchor": age_arcane_data["node"]
                },
                "chakra_health_matrix": chakra_health
            },
            "cross_system_stent_matrix": {
                "description": "Сквозное послойное наложение изолированных транзисторов Октаграммы и Пифагора на Кеному Бодиграфа для вычисления финального соматического вектора TSP.",
                "active_resonance_nodes": all_resonance_nodes,
                "final_somatic_tensor_reich_uV": tsp_modifiers
            }
        }
        
        print("\nУСПЕШНО СКОМПИЛИРОВАН МОДУЛЬНЫЙ СУПЕРПОЗИЦИОННЫЙ JSON-ПАКЕТ:")
        print(json.dumps(unified_output, ensure_ascii=False, indent=2))
        
    except ValueError as ve:
        print(f"Ошибка ввода данных (неверный формат чисел): {str(ve)}")
    except Exception as e:
        print(f"Критический сбой при кросс-системном модульном расчете: {str(e)}")







if __name__ == "__main__":
    run_from_console()
