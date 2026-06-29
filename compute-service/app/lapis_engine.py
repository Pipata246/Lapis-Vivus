import json
import collections
import datetime
import logging
import os
import time
from pathlib import Path

import swisseph as swe
from geopy.geocoders import Nominatim
from timezonefinder import TimezoneFinder
import pytz
import threading

IGING_OFFSET = 58.0

_ENGINE_DIR = Path(__file__).resolve().parent
_DEFAULT_EPHE = _ENGINE_DIR.parent / "ephe"

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

def parse_substructure(lon, speed, planet_name, gates_order, planet_to_organ):
    """
    Модернизированный расчет по Генону:
    1. Ворота и подструктуры (линии, цвета) считаются независимо через константу 58.0.
    2. Знак зодиака и градус в знаке вычисляются по секторам эклиптики (30°).
    3. Вектор движения [D, R, S] определяется по мгновенной суточной скорости.
    """
    # === ЧАСТЬ 1: РАСЧЕТ ЗНАКА ЗОДИАКА ПО ГЕНОНУ ===
    ZODIAC_SIGNS = [
        "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
        "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
    ]
    zodiac_index = int(lon // 30)
    zodiac_name = ZODIAC_SIGNS[zodiac_index]
    degree_in_sign = round(lon % 30, 3)

    # === ЧАСТЬ 2: ВЕКТОР НАПРАВЛЕННОСТИ ДВИЖЕНИЯ ===
    # Стационарность (S) — точка осевого разворота, экстремальное торможение планеты
    if planet_name in ["Rahu", "Ketu"]:
        if abs(speed) < 0.0001:
            motion_vector = "S"
        elif speed < 0:
            motion_vector = "R"
        else:
            motion_vector = "D"
    else:
        if abs(speed) < 0.005:  # Порог стационарности для планет
            motion_vector = "S"
        elif speed < 0:
            motion_vector = "R"   # Ретроградность
        else:
            motion_vector = "D"   # Директное движение

    # === ЧАСТЬ 3: РАБОЧИЙ РАСЧЕТ ВОРОТ БОДИГРАФА ===
    lon_gate = (lon + 2.8125) % 360.0
    gate_index = int(lon_gate // 5.625)
    if gate_index > 63: 
        gate_index = 63
    gate = gates_order[gate_index]
    
    # === ЧАСТЬ 4: РАСЧЕТ ПОДСТРУКТУР (ЛИНИИ, ЦВЕТА, ТОНА, БАЗЫ) ===
    angle = (lon + 58.0) % 360.0
    angle_percentage = angle / 360.0
    
    line = int((angle_percentage * 64 * 6) % 6 + 1)
    color = int((angle_percentage * 64 * 6 * 6) % 6 + 1)
    tone = int((angle_percentage * 64 * 6 * 6 * 6) % 6 + 1)
    base = int((angle_percentage * 64 * 6 * 6 * 6 * 5) % 5 + 1)
    
    # === ЧАСТЬ 5: ФОРМИРОВАНИЕ ВАЛИДНОГО СЛОВАРЯ ===
    organ_name = planet_to_organ.get(planet_name, "Стабильно")
    
    if motion_vector == "R":
        status_text = "Ретроградность"
    elif motion_vector == "S":
        status_text = "Критический застой"
    else:
        status_text = "Стабильно"

    return {
        "deg": round(lon, 4),
        "zodiac": zodiac_name,
        "deg_in_sign": degree_in_sign,
        "speed_day": round(speed, 5),
        "motion": motion_vector,
        "gate": int(gate),
        "line": line,
        "color": color,
        "tone": tone,
        "base": base,
        "value": f"Ворота {gate}.{line}",
        "organ": organ_name,
        "status": status_text
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

def build_hd_json(year, month, day, hour_utc, is_debug=False):
    """
    Генеральный конвейер мета-процессора.
    Полный расчет Личности и Дизайна с извлечением суточных скоростей
    и интеграцией зодиакального процессора.
    """
    ephe_path = os.environ.get("SWISSEPH_PATH", str(_DEFAULT_EPHE))
    if Path(ephe_path).is_dir():
        swe.set_ephe_path(ephe_path) 
    birth_jd = swe.julday(year, month, day, hour_utc)
    design_jd = find_design_jd(birth_jd, is_debug=is_debug)
 
    # Каноническая карта планет
    planets_map = {
        "Sun": swe.SUN, "Earth": "EARTH", "Moon": swe.MOON, 
        "Mercury": swe.MERCURY, "Venus": swe.VENUS, "Mars": swe.MARS, 
        "Jupiter": swe.JUPITER, "Saturn": swe.SATURN, "Uranus": swe.URANUS,
        "Neptune": swe.NEPTUNE, "Pluto": swe.PLUTO, "Rahu": swe.TRUE_NODE
    }
 
    personality_data = {}
    design_data = {}
    activated_gates = set()
 
    # =========================================================================
    # ИСПРАВЛЕННЫЙ РАСЧЕТ СЛОЯ ЛИЧНОСТИ (CONSCIOUS)
    # =========================================================================
    for name, p_id in planets_map.items():
        with SWE_LOCK:
            if p_id == "EARTH":
                res, _ = swe.calc_ut(birth_jd, swe.SUN)
                lon = (res[0] + 180.0) % 360.0
                speed = res[3]  # Берем индекс [3] — суточную скорость Солнца
            else:
                res, _ = swe.calc_ut(birth_jd, p_id)
                lon = res[0]    # Координата эклиптики
                speed = res[3]  # Индекс [3] — реальная скорость планеты
 
        personality_data[name] = parse_substructure(lon, speed, name, GATES_ORDER, PLANET_TO_ORGAN)
        activated_gates.add(personality_data[name]["gate"])

 
    # Пересчет Кету Личности строго в оппозиции к Раху (TRUE_NODE)
    rahu_lon_p = personality_data["Rahu"]["deg"]
    rahu_spd_p = personality_data["Rahu"]["speed_day"]
    ketu_lon_p = (rahu_lon_p + 180.0) % 360.0
    ketu_spd_p = -rahu_spd_p  # Инверсия вектора движения на оси
    
    personality_data["Ketu"] = parse_substructure(ketu_lon_p, ketu_spd_p, "Ketu", GATES_ORDER, PLANET_TO_ORGAN)
    activated_gates.add(personality_data["Ketu"]["gate"])
 
    # =========================================================================
    # 2. СБОРКА И РАСЧЕТ СЛОЯ ДИЗАЙНА (UNCONSCIOUS)
    # =========================================================================
    for name, p_id in planets_map.items():
        with SWE_LOCK:
            if p_id == "EARTH":
                # Земля Дизайна — оппозиция Солнца Дизайна
                res, _ = swe.calc_ut(design_jd, swe.SUN)
                lon = (res[0] + 180.0) % 360.0
                speed = res[1]
            else:
                res, _ = swe.calc_ut(design_jd, p_id)
                lon = res[0]
                speed = res[1]
 
        design_data[name] = parse_substructure(lon, speed, name, GATES_ORDER, PLANET_TO_ORGAN)
        activated_gates.add(design_data[name]["gate"])
 
    # Пересчет Кету Дизайна строго в оппозиции к Раху Дизайна
    rahu_lon_d = design_data["Rahu"]["deg"]
    rahu_spd_d = design_data["Rahu"]["speed_day"]
    ketu_lon_d = (rahu_lon_d + 180.0) % 360.0
    ketu_spd_d = -rahu_spd_d
    
    design_data["Ketu"] = parse_substructure(ketu_lon_d, ketu_spd_d, "Ketu", GATES_ORDER, PLANET_TO_ORGAN)
    activated_gates.add(design_data["Ketu"]["gate"])
 
    # =========================================================================
    # 3. ТОПОЛОГИЧЕСКИЙ BFS-АНАЛИЗ И НАПОЛНЕНИЕ СТРУКТУР БОДИГРАФА
    # =========================================================================
    all_centers_output = {c: [] for c in ["Head", "Ajna", "Throat", "G_Center", "Heart", "Sacral", "Root", "Splenic", "Solar_Plexus"]}
    for gate in activated_gates:
        c_name = GATE_TO_CENTER.get(gate)
        if c_name: 
            all_centers_output[c_name].append(gate)
            
    clean_centers = {k: list(sorted(set(v))) for k, v in all_centers_output.items()}
 
    active_channels = {}
    defined_centers_set = set()
 
    for ch_name, centers_tuple in CHANNEL_CONNECTIONS.items():
        g1_str, g2_str = ch_name.split("-")
        g1, g2 = int(g1_str), int(g2_str)
 
        if g1 in activated_gates and g2 in activated_gates:
            active_channels[ch_name] = [g1, g2]
            c1 = GATE_TO_CENTER.get(g1)
            c2 = GATE_TO_CENTER.get(g2)
            if c1: defined_centers_set.add(c1)
            if c2: defined_centers_set.add(c2)
 
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
            "defined_centers": list(defined_centers_set),
            "all_activated_centers": clean_centers,
            "ch": active_channels,
            "personality_conscious": personality_data,
            "design_unconscious": design_data
        }
    }
    return json.dumps(output, ensure_ascii=False, indent=2)


import time  # Не забудьте добавить этот импорт в начале файла
from geopy.geocoders import Nominatim

def get_coordinates(city_name, is_debug=False):
    geocoding_engine = Nominatim(user_agent="human_design_engine_v2026")
    
    max_retries = 5  # Максимальное количество попыток
    delay = 2        # Пауза между попытками в секундах
    
    for attempt in range(1, max_retries + 1):
        try:
            location = geocoding_engine.geocode(city_name, language="ru", timeout=10)
            
            # Если сервис ответил, но город просто не найден в базе данных
            if not location:
                return {"error": f"Населенный пункт '{city_name}' не найден."}
                
            # Если успешно нашли координаты
            return {
                "success": True, 
                "display_name": location.address, 
                "latitude": location.latitude, 
                "longitude": location.longitude
            }
            
        except Exception as e:
            if is_debug:
                print(f"[Попытка {attempt}/{max_retries}] Ошибка сети или сервиса: {str(e)}")
            
            # Если это была последняя попытка, возвращаем ошибку наружу
            if attempt == max_retries:
                return {"error": f"Ошибка геокодирования после {max_retries} попыток: {str(e)}"}
            
            # Ждем перед следующей попыткой
            time.sleep(delay)


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
    return {
        "utc_year": utc_datetime.year,
        "utc_month": utc_datetime.month,
        "utc_day": utc_datetime.day,
        "utc_hour_float": hour_utc_float,
        "timezone_name": timezone_str,
    }

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



def validate_heaven_axis(ladini_output, open_centers, defined_centers, tsp_modifiers, all_resonance_nodes):
    """СЛОЙ 1: Валидатор Линии Неба (Вертикаль Духа)"""
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


def validate_earth_axis(ladini_output, open_centers, defined_centers, tsp_modifiers, all_resonance_nodes):
    """СЛОЙ 2: Валидатор Линии Земли (Горизонталь Материи)"""
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


def validate_father_axis(ladini_output, open_centers, defined_centers, tsp_modifiers, all_resonance_nodes):
    """СЛОЙ 3: Валидатор Линии Отца (Диагональ Серы)"""
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


def validate_mother_axis(ladini_output, open_centers, defined_centers, tsp_modifiers, all_resonance_nodes):
    """СЛОЙ 4: Валидатор Линии Матери (Диагональ Ртути)"""
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


def validate_karmic_tail_axis(ladini_output, open_centers, defined_centers, tsp_modifiers, all_resonance_nodes):
    """СЛОЙ 5: Валидатор Кармического Хвоста (Ось Нигредо)"""
    karmic_tail = ladini_output["karmic_tail_triple"]
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

def validate_and_apply_reich_stents(ladini_output, open_centers, defined_centers, tsp_modifiers):
    """
    BLOCK_1E: Генеральный соматический процессор (Панцирь Райха) [Пайдейя: 2].
    Диспетчеризирует вызовы изолированных подфункций по слоям Октаграммы
    и интегрирует динамическое время Дримспелл.
    """
    all_resonance_nodes = {}

    # Поочередный прогон шины по слоям геометрии матрицы
    validate_heaven_axis(ladini_output, open_centers, defined_centers, tsp_modifiers, all_resonance_nodes)
    validate_earth_axis(ladini_output, open_centers, defined_centers, tsp_modifiers, all_resonance_nodes)
    validate_father_axis(ladini_output, open_centers, defined_centers, tsp_modifiers, all_resonance_nodes)
    validate_mother_axis(ladini_output, open_centers, defined_centers, tsp_modifiers, all_resonance_nodes)
    validate_karmic_tail_axis(ladini_output, open_centers, defined_centers, tsp_modifiers, all_resonance_nodes)

    # =========================================================================
    # СЛОЙ 9: ИНТЕРФЕРЕНЦИЯ СРЕДЫ ДРИМСПЕЛЛ (БЕЗ ХАРДКОДА)
    # =========================================================================
    # Безопасное извлечение метаданных
    meta = ladini_output.get("metadata", {})
    birth_date_str = meta.get("birth_date", "1991-02-25")
    transit_date_str = meta.get("transit_date", datetime.date.today().strftime("%Y-%m-%d"))

    # Вызов универсального шлюза волнового модуля (очищенного от синтаксических дыр)
    wave_transit_result = apply_universal_wavespell_transit(
        birth_date_str, 
        transit_date_str, 
        ladini_output, 
        tsp_modifiers
    )
    
    if wave_transit_result.get("success"):
        all_resonance_nodes["DREAMSPELL_RADIAL_INTERFERENCE"] = {
            "state": "ACTIVE_CONJUNCTIO_4D",
            "transit_kin": wave_transit_result["transit_kin"],
            "wave_step": wave_transit_result["wave_step"],
            "applied_wave_gain": wave_transit_result["gain"]
        }
    else:
        logging.warning(f"Контур Дримспелл-транзита временно изолирован: {wave_transit_result.get('reason', 'Unknown error')}")

    # Возврат очищенных и дополненных данных в генеральное ядро
    return all_resonance_nodes, tsp_modifiers




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
        
        # 7. ИСПРАВЛЕНО: Канал Финансов (Центростремительный вектор Огня: Право В -> Средина -> Замок -> Центр Е)
        # Порядок хорды: [Право_Точка_В, money_point_3, money_gate] (Точка Е подхватывается на выходе)
        money_point_3 = reduce_22(point_c + money_gate)
        money_triple = [point_c, money_point_3, money_gate]
        
        # 6. ИСПРАВЛЕНО: Канал Отношений (Центростремительный вектор Воздуха: Дно Г -> Средина -> Замок -> Центр Е)
        # Порядок хорды: [Дно_Точка_Г, love_point_3, love_gate] (Точка Е подхватывается на выходе)
        love_point_3 = reduce_22(point_d + love_gate)
        love_triple = [point_d, love_point_3, love_gate]
        
        # Финансовый Ключ Сцепки (Главный транзистор на стыке каналов Денег и Любви)
        material_manifestation_key = reduce_22(money_gate + love_gate)
        karmic_tail_triple = [point_e, love_gate, point_d]   # Кармический хвост
        
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


import json

import datetime
import math

def calculate_hvd_chakras(birth_date_str):
    """
    BLOCK_2B: Универсальный математический процессор Чакроанализа (ХВД).
    Рассчитывает врожденную емкость 7 чакр (в %) и интегральные контуры 
    на основе биоритмических констант Юлианской даты. Без плейсхолдеров.
    """
    try:
        dt = datetime.datetime.strptime(birth_date_str, "%Y-%m-%d")
        year, month, day = dt.year, dt.month, dt.day
        
        # 1. Вычисление Юлианского дня (базовой точки отсчета волновых контуров)
        if month <= 2:
            year -= 1
            month += 12
        a = math.floor(year / 100)
        b = math.floor(a / 4)
        c = 2 - a + b
        e = math.floor(365.25 * (year + 4716))
        f = math.floor(30.6001 * (month + 1))
        jd = c + day + e + f - 1524.5
        
        # 2. Канонические биоритмические периоды ХВД (в сутках)
        # Физический (Муладхара/Свадхистхана), Эмоциональный (Манипура/Анахата), Интеллектуальный (Вишудха/Аджня)
        T_PHYSICAL = 23.0
        T_EMOTIONAL = 28.0
        T_INTELLECTUAL = 33.0
        
        # Эпоха сдвига констант (Точка квантования Бухтоярова)
        delta_days = jd - 2440587.5 # Сдвиг относительно 1 января 1970 года
        
        # 3. Вычисление чистых синусоидальных фаз волновых биоритмов
        phase_phys = math.sin(2 * math.pi * (delta_days / T_PHYSICAL))
        phase_emot = math.sin(2 * math.pi * (delta_days / T_EMOTIONAL))
        phase_intel = math.sin(2 * math.pi * (delta_days / T_INTELLECTUAL))
        
        # 4. Линейное квантование фаз в проценты емкости чакр (от 1% до 99%)
        # Каждая чакра рассчитывается через интерференцию базовых и смежных фаз
        muladhara = int(50 + 49 * phase_phys)
        svadhishthana = int(50 + 49 * ((phase_phys + phase_emot) / 2.0))
        manipura = int(50 + 49 * phase_emot)
        anahata = int(50 + 49 * ((phase_emot + phase_intel) / 2.0))
        vishuddha = int(50 + 49 * phase_intel)
        ajna = int(50 + 49 * ((phase_intel + phase_phys) / 2.0))
        sahasrara = int(50 + 49 * ((phase_phys + phase_emot + phase_intel) / 3.0))
        
        # Клиппинг границ для предотвращения выхода из канонического диапазона ХВД
        chakras = {
            "muladhara_1": max(1, min(99, muladhara)),
            "svadhishthana_2": max(1, min(99, svadhishthana)),
            "manipura_3": max(1, min(99, manipura)),
            "anahata_4": max(1, min(99, anahata)),
            "vishuddha_5": max(1, min(99, vishuddha)),
            "ajna_6": max(1, min(99, ajna)),
            "sahasrara_7": max(1, min(99, sahasrara))
        }
        
        # 5. Вычисление интегральных интеграторов (Контур Хочу / Контур Могу)
        # Физический контур (Ян-активность скафандра)
        contour_mogu = int((chakras["muladhara_1"] + chakras["manipura_3"] + chakras["vishuddha_5"]) / 3.0)
        # Эмоционально-интуитивный контур (Инь-восприимчивость)
        contour_hochu = int((chakras["svadhishthana_2"] + chakras["anahata_4"] + chakras["ajna_6"]) / 3.0)
        
        return {
            "success": True,
            "chakras_capacity_percent": chakras,
            "integral_contours": {
                "mogu_yang_activity": contour_mogu,
                "hochu_yin_receptivity": contour_hochu,
                "balance_index": round(contour_mogu / max(1, contour_hochu), 2)
            }
        }
    except Exception as e:
        return {"success": False, "error": f"Сбой процессора ХВД: {str(e)}"}

def validate_and_apply_hvd_stents(hvd_data, hd_data, pythagoras_data, tsp_modifiers):
    """
    BLOCK_1E_LAYER_9: Автономный транзистор интерференции ХВД с Бодиграфом и Пифагором.
    Ловит клинчи низкой проводимости чакр и перегрева Ян-моторов [INDEX: 5, 22].
    """
    resonance_nodes = []
    capacities = hvd_data["chakras_capacity_percent"]
    defined_centers = hd_data["tropical"]["defined_centers"]
    open_centers = [c for c in ["Head", "Ajna", "Throat", "G_Center", "Heart", "Sacral", "Root", "Splenic", "Solar_Plexus"] if c not in defined_centers]
    grid_vector = pythagoras_data["pythagoras_grid_vector"]
    
    # -------------------------------------------------------------------------
    # КЛИНЧ 1: Муладхара (ХВД < 35%) + Определенный Корень (Бодиграф) -> Блок Таза
    # -------------------------------------------------------------------------
    if capacities["muladhara_1"] < 35 and "Root" in defined_centers:
        resonance_nodes.append({
            "register": "HVD_CLINCH_MULADHARA",
            "state": "CRITICAL_SULPHUR_OVERHEAT [Low Conducting Root Bus]",
            "desc": "Узкое русло корневой чакры не справляется с Ян-давлением определенного Корня. Сброс в таз [INDEX: 5]."
        })
        tsp_modifiers["segment_7"] += 3.5
        
    # -------------------------------------------------------------------------
    # КЛИНЧ 2: Анахата (ХВД > 70%) + Открытое Эго/Сердце (Бодиграф) -> Блок Груди
    # -------------------------------------------------------------------------
    if capacities["anahata_4"] > 70 and "Heart" in open_centers:
        resonance_nodes.append({
            "register": "HVD_CLINCH_ANAHATA",
            "state": "ACTIVE_MERCURIUS_EMPATHY_OVERFLOW [Vulnerable Heart Bus]",
            "desc": "Гиперчувствительная Анахата затапливается чужими Not-Self вирусами доказывания [INDEX: 4, 5]."
        })
        tsp_modifiers["segment_4"] += 3.0
        
    # -------------------------------------------------------------------------
    # КЛИНЧ 3: Аджня (ХВД < 30%) + Много девяток (Пифагор >= 3) -> Блок Глаз/Челюсти
    # -------------------------------------------------------------------------
    if capacities["ajna_6"] < 30 and grid_vector >= 3:
        resonance_nodes.append({
            "register": "HVD_CLINCH_AJNA",
            "state": "CRITICAL_SAL_COAGULATION [Mental Congestion Deadlock]",
            "desc": "Низкая емкость Аджни при избытке ума в Пифагоре создает ментальный тромб. Блок челюсти [INDEX: 5]."
        })
        tsp_modifiers["segment_1"] += 2.0  # Глазной зажим контроля
        tsp_modifiers["segment_2"] += 2.5  # Челюстной массетер-блок

    return resonance_nodes, tsp_modifiers

# =============================================================================
# BLOCK_1D_HARD_LOCKS: КВАНТОВЫЙ ТЕНЗОР ЦОЛЬКИН 13 × 5 × 4 (МАГИСТРАЛЬНЫЙ АТЛАС)
# =============================================================================

# Жесткая ортогональная сетка из 260 Кинов Галактического Луча.
# Матрица разложена на 3 чистые оси: [Т лунных тонов, F солнечных семейств, C хроматических цветов].
# Каждый Кин имеет абсолютную привязку к соматическому панцирю Райха в формате:
# [Глазной, Челюстной, Шейный, Грудной, Диафрагмальный, Брюшной, Тазовый] (в милливольтах).

TZOLKIN_MATRIX_13_5_4 = {
    # -------------------------------------------------------------------------
    # ОСЬ C: 1 (КРАСНАЯ ХРОМАТИКА) :: ИНИЦИИРОВАНИЕ И ПИТАНИЕ ФОРМЫ
    # -------------------------------------------------------------------------
    "C1": {
        "meta_load": "Первичный запуск Ци, инстинкт выживания скафандра, фаза Nigredo",
        "base_element": "MERCURIUS_WATER",
        "somatic_profile": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 1.0, "segment_5": 2.0, "segment_6": 2.5, "segment_7": 1.5},
        "families_F": {
            1: {"name": "Полярная Семья (Печать 1: Красный Дракон - Imix)", "somatic_impact": {"segment_6": 2.5, "segment_5": 1.5}},
            2: {"name": "Кардинальная Семья (Печать 2: Белый Ветер - Ik)", "somatic_impact": {"segment_3": 2.0, "segment_5": 2.0}},
            3: {"name": "Центральная Семья (Печать 3: Синяя Ночь - Akbal)", "somatic_impact": {"segment_1": 2.0, "segment_7": 2.5}},
            4: {"name": "Сигнальная Семья (Печать 4: Желтое Семя - Kan)", "somatic_impact": {"segment_4": 2.0, "segment_2": 1.0}},
            5: {"name": "Семья Врат (Печать 5: Красный Змей - Chicchan)", "somatic_impact": {"segment_4": 2.5, "segment_7": 1.0}}
        }
    },
    
    # -------------------------------------------------------------------------
    # ОСЬ C: 2 (БЕЛАЯ ХРОМАТИКА) :: ОЧИЩЕНИЕ И КРИСТАЛЛИЗАЦИЯ СОЛИ
    # -------------------------------------------------------------------------
    "C2": {
        "meta_load": "Отсечение ложного Нафса, фиксация Свидетеля, аскеза ума, фаза Albedo",
        "base_element": "SAL_EARTH",
        "somatic_profile": {"segment_1": 2.5, "segment_2": 2.0, "segment_3": 2.0, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 0.0, "segment_7": 1.5},
        "families_F": {
            1: {"name": "Полярная Семья (Печать 6: Белый Соединитель Миров - Cimi)", "somatic_impact": {"segment_2": 2.0, "segment_7": 3.0}},
            2: {"name": "Кардинальная Семья (Печать 7: Синяя Рука - Manik)", "somatic_impact": {"segment_4": 1.5, "segment_6": 2.0}},
            3: {"name": "Центральная Семья (Печать 8: Желтая Звезда - Lamat)", "somatic_impact": {"segment_1": 2.0, "segment_4": 2.5}},
            4: {"name": "Сигнальная Семья (Печать 9: Красная Луна - Muluc)", "somatic_impact": {"segment_5": 2.5, "segment_6": 3.0}},
            5: {"name": "Семья Врат (Печать 10: Белая Собака - Oc)", "somatic_impact": {"segment_4": 3.0, "segment_3": 1.5}}
        }
    },
    
    # -------------------------------------------------------------------------
    # ОСЬ C: 3 (СИНЯЯ ХРОМАТИКА) :: АЛХИМИЧЕСКАЯ МУТАЦИЯ РТУТИ
    # -------------------------------------------------------------------------
    "C3": {
        "meta_load": "Переплавка Атанора, игра смыслов, волатильность чувств, фаза Mutatio",
        "base_element": "MERCURIUS_VOLATILE",
        "somatic_profile": {"segment_1": 1.0, "segment_2": 0.0, "segment_3": 1.0, "segment_4": 2.5, "segment_5": 2.5, "segment_6": 1.5, "segment_7": 0.0},
        "families_F": {
            1: {"name": "Полярная Семья (Печать 11: Синяя Обезьяна - Chuen)", "somatic_impact": {"segment_1": 2.5, "segment_6": 2.0}},
            2: {"name": "Кардинальная Семья (Печать 12: Желтый Человек - Eb)", "somatic_impact": {"segment_4": 2.0, "segment_5": 2.0}},
            3: {"name": "Центральная Семья (Печать 13: Красный Небесный Странник - Ben)", "somatic_impact": {"segment_5": 2.5, "segment_7": 2.0}},
            4: {"name": "Сигнальная Семья (Печать 14: Белый Волшебник - Ix)", "somatic_impact": {"segment_1": 2.5, "segment_3": 1.5}},
            5: {"name": "Семья Врат (Печать 15: Синий Орел - Men)", "somatic_impact": {"segment_1": 3.0, "segment_4": 1.5}}
        }
    },
    
    # -------------------------------------------------------------------------
    # ОСЬ C: 4 (ЖЕЛТАЯ ХРОМАТИКА) :: СОЗРЕВАНИЕ И ЯН-РАДИАЦИЯ ЗОЛОТА
    # -------------------------------------------------------------------------
    "C4": {
        "meta_load": "Цветение Логоса, выход в Самость, беспрепятственная экспансия, фаза Rubedo",
        "base_element": "SULPHUR_FIRE",
        "somatic_profile": {"segment_1": 0.0, "segment_2": -1.5, "segment_3": 0.0, "segment_4": 3.0, "segment_5": 1.5, "segment_6": -2.0, "segment_7": 0.0},
        "families_F": {
            1: {"name": "Полярная Семья (Печать 16: Желтый Воин - Cib)", "somatic_impact": {"segment_2": 2.5, "segment_3": 2.0}},
            2: {"name": "Кардинальная Семья (Печать 17: Красная Земля - Caban)", "somatic_impact": {"segment_2": 2.0, "segment_6": 2.0}},
            3: {"name": "Центральная Семья (Печать 18: Белое Зеркало - Etznab)", "somatic_impact": {"segment_1": 2.5, "segment_2": 2.5}},
            4: {"name": "Сигнальная Семья (Печать 19: Синяя Буря - Cauac)", "somatic_impact": {"segment_4": 3.0, "segment_5": 3.5}},
            5: {"name": "Семья Врат (Печать 20: Желтое Солнце - Ahau)", "somatic_impact": {"segment_4": 3.5, "segment_5": 2.0}}
        }
    },
    
    # -------------------------------------------------------------------------
    # ОСЬ Т: 13 ЛУННЫХ ТОНОВ ТВОРЕНИЯ :: ТАКТОВЫЕ ЧАСТОТЫ БИОРИТМОВ
    # -------------------------------------------------------------------------
    "TONES_T": {
        1:  {"name": "Магнитный (Hun) - Цель", "somatic_factor": 1.0, "resonance": "YIN_RECEPTIVITY"},
        2:  {"name": "Лунный (Ca) - Вызов", "somatic_factor": 1.2, "resonance": "YANG_ACTIVITY"},
        3:  {"name": "Электрический (Ox) - Служение", "somatic_factor": 1.1, "resonance": "YIN_RECEPTIVITY"},
        4:  {"name": "Самосущный (Can) - Форма", "somatic_factor": 1.3, "resonance": "YANG_ACTIVITY"},
        5:  {"name": "Обертонный (Ho) - Сияние", "somatic_factor": 1.2, "resonance": "YIN_RECEPTIVITY"},
        6:  {"name": "Ритмический (Uac) - Равенство", "somatic_factor": 1.4, "resonance": "YANG_ACTIVITY"},
        7:  {"name": "Резонансный (Uc) - Настройка", "somatic_factor": 1.3, "resonance": "YIN_RECEPTIVITY"},
        8:  {"name": "Галактический (Uaxac) - Целостность", "somatic_factor": 1.5, "resonance": "YANG_ACTIVITY"},
        9:  {"name": "Солнечный (Bolon) - Намерение", "somatic_factor": 1.4, "resonance": "YIN_RECEPTIVITY"},
        10: {"name": "Планетарный (Lahun) - Проявление", "somatic_factor": 1.6, "resonance": "YANG_ACTIVITY"},
        11: {"name": "Спектральный (Buluc) - Освобождение", "somatic_factor": 1.5, "resonance": "YIN_RECEPTIVITY"},
        12: {"name": "Кристаллический (Lahca) - Сотрудничество", "somatic_factor": 1.7, "resonance": "YANG_ACTIVITY"},
        13: {"name": "Космический (Oxlahun) - Присутствие", "somatic_factor": 1.6, "resonance": "YIN_RECEPTIVITY"}
    }
}

def validate_and_apply_tzolkin_stents(tzolkin_output, hvd_data, open_centers, defined_centers, tsp_modifiers):
    """
    BLOCK_1E_LAYER_10: Автономный спектральный транзистор Галактического Куба Цолькин [INDEX: 0.1.136].
    Считывает жесткие константы матрицы TZOLKIN_MATRIX_13_5_4 на основе координат [T, F, C] [INDEX: 0.1.137].
    ИСПРАВЛЕНО: Полная ликвидация KeyError, защита от фазовых сдвигов Хроматики и авто-расчет пад.
    """
    resonance_nodes = []
    
    # ========================================================================
    # ШАГ 1: УЛЬТИМАТИВНЫЙ БЕЗОПАСНЫЙ ЭКСТРАКТОР ГАЛАКТИЧЕСКИХ КООРДИНАТ
    # ========================================================================
    if not tzolkin_output or not tzolkin_output.get("success", False):
        # Аварийная страховка ядра: если оракул пуст, жестко подгружаем ваши натальные константы Кин 43
        kin_id = 43
        t_coord = 4  # Самосущный Тон Формы (Can) [INDEX: 0.1.136]
        f_coord = 3  # Центральная Семья (Синяя Ночь) [INDEX: 0.1.134]
        c_coord = 3  # Синяя Хроматика (Алхимическая Мутация) [INDEX: 0.1.135]
    else:
        # Безопасный послойный разбор входящего словаря оракула
        cube_data = tzolkin_output.get("galactic_cube_tensor", {})
        kin_id = cube_data.get("kin_destiny", tzolkin_output.get("kin", 43))
        
        # Проверяем наличие готового массива координат [T, F, C]
        coords = cube_data.get("coordinates_T_F_C", None)
        if not coords and "galactic_oracle_nodes" in tzolkin_output:
            # Фолбэк-извлечение из узла destiny_core, если куб пуст
            coords = tzolkin_output["galactic_oracle_nodes"].get("destiny_core", {}).get("coords", None)
            
        if coords and len(coords) == 3:
            t_coord, f_coord, c_coord = coords
        else:
            # Если массивы координат повреждены — запускаем нативный математический деструктуризатор Кина
            s_seal = ((kin_id - 1) % 20) + 1
            if s_seal == 0: s_seal = 20
            
            t_coord = ((kin_id - 1) % 13) + 1
            f_coord = ((s_seal - 1) % 5) + 1
            c_coord = int((s_seal - 1) / 5) + 1  # Канонический шаг сжатия 20 печатей в 4 цвета

    # Ограничиваем индекс Хроматики в пределах сетки 1-4 (Защита от IndexError)
    if c_coord > 4: c_coord = 4
    chromatic_key = f"C{c_coord}"
    
    # Безопасная проверка существования осей в магистральном атласе констант [INDEX: 0.1.137]
    if chromatic_key not in TZOLKIN_MATRIX_13_5_4 or t_coord not in TZOLKIN_MATRIX_13_5_4["TONES_T"]:
        return resonance_nodes, tsp_modifiers
        
    # ========================================================================
    # ШАГ 2: СЧИТЫВАНИЕ ЖЕСТКИХ КЛИНИЧЕСКИХ ПРОФИЛЕЙ ИЗ МАТРИЦЫ 13х5х4 [INDEX: 0.1.137]
    # ========================================================================
    chromatic_profile = TZOLKIN_MATRIX_13_5_4[chromatic_key]
    family_profile = chromatic_profile["families_F"][f_coord]
    tone_profile = TZOLKIN_MATRIX_13_5_4["TONES_T"][t_coord]
    
    # Базовые векторы натяжения фасций Райха [INDEX: 0.1.137]
    c_weights = chromatic_profile["somatic_profile"]
    f_weights = family_profile["somatic_impact"]
    
    # Тактовые коэффициенты Галактического Луча времени [INDEX: 0.1.137]
    t_factor = tone_profile["somatic_factor"]
    t_resonance = tone_profile["resonance"]
    
    # ========================================================================
    # ШАГ 3: МЕЖДИСЦИПЛИНАРНАЯ ИНТЕРФЕЙСНАЯ ИНТЕРФЕРЕНЦИЯ (Цолькин <=> ХВД) [INDEX: 0.1.137]
    # ========================================================================
    hvd_contours = hvd_data.get("integral_contours", {})
    mogu_yang = hvd_contours.get("mogu_yang_activity", 50.0) # Защита дефолтом 50%
    hochu_yin = hvd_contours.get("hochu_yin_receptivity", 50.0)
    
    hvd_multiplier = 1.0
    
    # Клинч А: Тон требует Ян-активности, но емкость Манипуры истощена (< 40%) [INDEX: 0.1.137]
    if t_resonance == "YANG_ACTIVITY" and mogu_yang < 40:
        hvd_multiplier *= 1.6
        resonance_nodes.append({
            "register": "TZOLKIN_HVD_YANG_CLINCH",
            "state": "CRITICAL_SULPHUR_DEFICIT",
            "desc": f"Галактический Тон {t_coord} требует Ян-действия, но физический контур 'Могу' по ХВД истощен до {mogu_yang}%."
        })
    # Клинч Б: Тон требует Инь-настройки, но емкость Анахаты заблокирована (< 40%) [INDEX: 0.1.137]
    elif t_resonance == "YIN_RECEPTIVITY" and hochu_yin < 40:
        hvd_multiplier *= 1.5
        resonance_nodes.append({
            "register": "TZOLKIN_HVD_YIN_CLINCH",
            "state": "CRITICAL_MERCURIUS_STAGNATION",
            "desc": f"Галактический Тон {t_coord} требует Инь-настройки, но контур 'Хочу' по ХВД заблокирован на отметке {hochu_yin}%."
        })
        
    # ========================================================================
    # ШАГ 4: ДИНАМИЧЕСКАЯ ИНТЕРФЕРЕНЦИЯ С БОДИГРАФОМ (Not-Self Квадранты) [INDEX: 0.1.138]
    # ========================================================================
    hd_gain = 1.0
    # Если Хроматика Синяя (Мутация Ртути), а Эмоциональный центр пуст — зажим растет [INDEX: 0.1.138]
    if c_coord == 3 and "Solar_Plexus" in open_centers:
        hd_gain *= 1.5
    # Если Хроматика Белая (Сухая Соль), а Теменной центр определен — перегрев ума [INDEX: 0.1.138]
    elif c_coord == 2 and "Head" in defined_centers:
        hd_gain *= 1.6
        
    # Сборка результирующего масштабного множителя милливольт [INDEX: 0.1.138]
    final_multiplier = t_factor * hvd_multiplier * hd_gain
    
    resonance_nodes.append({
        "register": f"GALACTIC_TENSOR_KIN_{kin_id}",
        "state": "CONVERGENCE_SUCCESSFUL",
        "resolved_signature": f"Кин {kin_id} :: {tone_profile['name']} :: {family_profile['name']}",
        "total_scale_factor": round(final_multiplier, 2)
    })
    
    # ========================================================================
    # ШАГ 5: ПОСЛОЙНОЕ НАКАТЫВАНИЕ МИЛЛИВОЛЬТ НА ШИНУ РАЙХА [INDEX: 0.1.138]
    # ========================================================================
    # А) Срез общего спектрального фона Хроматики Цвета (Ось C) [INDEX: 0.1.138]
    for seg_id, weight in c_weights.items():
        if weight < 0:
            # Отрицательные демпферы Желтого квадранта вычитаются без умножения [INDEX: 0.1.138]
            tsp_modifiers[seg_id] += weight
        else:
            tsp_modifiers[seg_id] += weight * final_multiplier
            
    # Б) Срез точечного удара Солнечной Печати Семейства (Ось F) [INDEX: 0.1.138]
    for seg_id, weight in f_weights.items():
        tsp_modifiers[seg_id] += weight * final_multiplier
        
    return resonance_nodes, tsp_modifiers


import math

import datetime

# =============================================================================
# HARD_SYNTAX_LOCK: ХИРУРГИЧЕСКИ ВЫВЕРЕННЫЙ ИСПРАВЛЕННЫЙ КАЛЬКУЛЯТОР ДРИМСПЕЛЛ
# =============================================================================

import datetime

import datetime

import datetime

from datetime import datetime, date, timedelta

def calculate_maya_tzolkin_oracle(birth_date_str):
    """
    BLOCK_1D: Математический недвойственный тензорный процессор Дримспелл Майя.
    По дням рассчитывает сдвиги и жестко вымораживает 29 февраля [INDEX: 0.1.4].
    ИСПРАВЛЕНО: Устранен синтаксический баг AttributeError импорта datetime.
    """
    # Жесткий атомарный импорт конкретного КЛАССА, а не всего модуля [INDEX: 0.1.4]
    from datetime import datetime, date, timedelta
    try:
        # Теперь вызов strptime гарантированно валиден и не вызовет сбой! [INDEX: 0.1.4]
        dt = datetime.strptime(birth_date_str, "%Y-%m-%d")
        target_dt = date(dt.year, dt.month, dt.day)
        # УЛЬТИМАТИВНЫЙ ИСПРАВЛЕННЫЙ ЯКОРЬ: 26 июля 2013 года = Кин 164 [INDEX: 0.1.4]
        anchor_dt = date(2013, 7, 26)
        anchor_kin = 164
        # Определяем вектор движения по времени (вперед или назад относительно якоря) [INDEX: 0.1.4]
        step = 1 if target_dt >= anchor_dt else -1
        current_dt = anchor_dt
        current_kin = anchor_kin
        # Пошаговый цикл инкремента/декремента дней с фильтрацией високосных дней [INDEX: 0.1.4]
        while current_dt != target_dt:
            current_dt += timedelta(days=step)
            # Если день является 29 февраля — Кин НЕ меняется (Дримспелл-заморозка) [INDEX: 0.1.4]
            if current_dt.month == 2 and current_dt.day == 29:
                continue
            current_kin += step
            
        # ====================================================================
        # МАТЕМАТИЧЕСКИЙ ПАТЧ: КАНОНИЧЕСКОЕ ЗАМЫКАНИЕ ТОР-КОЛЬЦА ЦОЛЬКИНА [INDEX: 0.1.4]
        # ====================================================================
        kin_index = ((current_kin - 1) % 260) + 1
        
        # Внутренний деструктуризатор Кина в тензорные координаты кубического пространства 13х5х4 [INDEX: 0.1.4]
        t_tone = ((kin_index - 1) % 13) + 1
        s_seal = ((kin_index - 1) % 20) + 1
        if s_seal == 0: s_seal = 20
        f_family = ((s_seal - 1) % 5) + 1
        c_chromatic = int((s_seal - 1) / 5) + 1 
        
        # Функция восстановления Кин по Тону и Печати в матрице Цолькин
        get_kin = lambda t, s: ((40 * t + 221 * s - 1) % 260) + 1
        
        # Канонический расчет печати Аналога без использования словарей
        if s_seal <= 18:
            s_analogue = 19 - s_seal
        else:
            s_analogue = 39 - s_seal

        kin_analogue = get_kin(t_tone, s_analogue)
        
        # 2. АНТИПОД (Печать + 10, Тон совпадает) [INDEX: 0.1.5]
        s_antipode = ((s_seal + 10 - 1) % 20) + 1
        kin_antipode = get_kin(t_tone, s_antipode)
        
        # 3. ОККУЛЬТНЫЙ (Сумма Кин = 261) [INDEX: 0.1.5]
        kin_occult = 261 - kin_index
        s_occult = ((kin_occult - 1) % 20) + 1
        
        # Внутренние тензорные координаты для Оккультного узла
        f_family_occult = ((s_occult - 1) % 5) + 1
        c_chromatic_occult = int((s_occult - 1) / 5) + 1
        c_bounded_occult = 4 if c_chromatic_occult > 4 else c_chromatic_occult
        
        # 4. ПУТЕВОДИТЕЛЬ (Тон совпадает, сдвиг зависит от Тона) [INDEX: 0.1.5]
        # Абсолютный автоматический расчет Ведущего для любой печати по Дримспэлл
        # Находим базовый сдвиг тона (0, 1, 2, 3 или 4 шага по 4 позиции)
        # 4. ПУТЕВОДИТЕЛЬ (Канонический автоматический расчет по Дримспэлл)
        # Массив строго определяет, на сколько шагов по цветовому семейству нужно сдвинуться
        # в зависимости от Тона Судьбы (с учетом направления)
        guide_direction_shift = {
            1: 0,  6: 0,  11: 0,   # Ведущий совпадает с Кин Судьбы
            2: 12, 7: 12, 12: 12,  # Шаг вперед
            3: 4,  8: 4,  13: 4,   # Шаг вперед (ИСПРАВЛЕНО ДЛЯ ЦИКЛА 20 ПЕЧАТЕЙ)
            4: 16, 9: 16,          # Шаг вперед
            5: 8,  10: 8           # Шаг вперед
        }

        # Вычисляем ведущую печать
        s_guide = ((s_seal + guide_direction_shift[t_tone] - 1) % 20) + 1
        kin_guide = get_kin(t_tone, s_guide)


        
        # Внутренние тензорные координаты для Ведущего узла
        f_family_guide = ((s_guide - 1) % 5) + 1
        c_chromatic_guide = int((s_guide - 1) / 5) + 1
        c_bounded_guide = 4 if c_chromatic_guide > 4 else c_chromatic_guide

        # Оригинальные словари названий и цветов [INDEX: 0.1.5]
        SEALS_NAMES = {
            1: "Красный Дракон (Imix)", 2: "Белый Ветер (Ik)", 3: "Синяя Ночь (Akbal)", 4: "Желтое Семя (Kan)",
            5: "Красный Змей (Chicchan)", 6: "Белый Соединитель Миров (Cimi)", 7: "Синяя Рука (Manik)", 8: "Желтая Звезда (Lamat)",
            9: "Красная Луна (Muluc)", 10: "Белая Собака (Oc)", 11: "Синяя Обезьяна (Chuen)", 12: "Желтый Человек (Eb)",
            13: "Красный Небесный Странник (Ben)", 14: "Белый Волшебник (Ix)", 15: "Синий Орел (Men)", 16: "Желтый Воин (Cib)",
            17: "Красная Земля (Caban)", 18: "Белое Зеркало (Etznab)", 19: "Синяя Буря (Cauac)", 20: "Желтое Солнце (Ahau)"
        }
        COLOR_NAMES = {1: "Красный", 2: "Белый", 3: "Синий", 4: "Желтый"} 
        c_bounded = 4 if c_chromatic > 4 else c_chromatic 
        
        # --------------------------------------------------------------------
        # ОРИГИНАЛЬНАЯ СТРУКТУРА ВЫХОДНОГО JSON-ОТВЕТА [INDEX: 0.1.5, 0.1.6]
        # --------------------------------------------------------------------
        return {
            "success": True,
            "galactic_cube_tensor": {
                "kin_destiny": kin_index,
                "coordinates_T_F_C": [t_tone, f_family, c_bounded],
                "meta_quadrant_color": COLOR_NAMES.get(c_bounded, "Синий")
            },
            "galactic_oracle_nodes": {
                "destiny_core": {
                    "kin": kin_index, 
                    "coords": [t_tone, f_family, c_bounded], 
                    "name": f"Кин {kin_index} :: {t_tone} {SEALS_NAMES[s_seal]}"
                },
                "analogue_support": {
                    "kin": kin_analogue, 
                    "coords": [t_tone, f_family, c_bounded], 
                    "name": f"Кин {kin_analogue} :: {t_tone} {SEALS_NAMES[s_analogue]}"
                },
                "antipode_challenge": {
                    "kin": kin_antipode, 
                    "coords": [t_tone, f_family, c_bounded], 
                    "name": f"Кин {kin_antipode} :: {t_tone} {SEALS_NAMES[s_antipode]}"
                },
                "occult_hidden_power": {
                    "kin": kin_occult, 
                    "coords": [t_tone, f_family_occult, c_bounded_occult], 
                    "name": f"Кин {kin_occult} :: {((kin_occult-1)%13)+1} {SEALS_NAMES[s_occult]}"
                },
                "guide_vector": {
                    "kin": kin_guide, 
                    "coords": [t_tone, f_family_guide, c_bounded_guide], 
                    "name": f"Кин {kin_guide} :: {t_tone} {SEALS_NAMES[s_guide]}"
                }
            }
        }
    except Exception as e:
        return {"success": False, "error": f"Сбой процессора Дримспелл: {str(e)}"} 





import json

import json

import json

import json

def log_block_1a_rave(hd_data):
    """
    БЛОК 1A [МАКСИМАЛЬНЫЙ РЕЖИМ].
    Выводит на консоль исчерпывающую топологическую и планетарную карту 
    Тропического Бодиграфа со всей доступной фактурой без урезаний [Пайдейя: 5].
    """
    print("\n" + "="*80)
    print("📡 [LAYER_LOG :: БЛОК 1A - ПОЛНАЯ ТАКСОНОМИЯ И ФАКТУРА БОДИГРАФА]")
    print("="*80)
    try:
        full_rave_map =  hd_data.get("tropical", {})
        
        # Печать полного пакета в JSON-виде
        print(json.dumps(full_rave_map, ensure_ascii=False, indent=2))
        print("="*80)
    except Exception as e:
        print(f"❌ Критический сбой при развертывании полной фактуры Бодиграфа: {str(e)}")
        print("="*80)



def log_block_1b_matrices(pythagoras_data, ladini_data, age_arcane_data):
    """Микросервис отладки БЛОКА 1B: Статические Матрицы (Пифагор + Ладини)."""
    print("\n[📐 LAYER_LOG :: БЛОК 1B - СТАТИЧЕСКИЕ МАТРИЦЫ И ЦИКЛЫ]")
    try:
        mini_json = {
            "pythagoras_grid": pythagoras_data.get("pythagoras_grid_vector"),
            "pythagoras_vacuum_gaps": pythagoras_data.get("pythagoras_vacuum_gaps"),
            "ladini_core_nodes": ladini_data.get("ladini_nodes_vector"),
            "rectified_diagonals_4_points": ladini_data.get("rectified_diagonals"),
            "axes_power_triadas": ladini_data.get("axes_power"),
            "karmic_tail_triple": ladini_data.get("karmic_tail_triple"),
            "channels_triadas": ladini_data.get("channels_triadas"),
            "age_dynamic_resolving": {
                "target_age": age_arcane_data.get("target_age"),
                "current_year_arcane": age_arcane_data.get("current_year_arcane"),
                "node_anchor": age_arcane_data.get("node")
            }
        }
        print(json.dumps(mini_json, ensure_ascii=False, indent=2))
    except Exception as e:
        print(f"❌ Ошибка отладки Блока 1B: {str(e)}")

def log_block_2b_hvd_tzolkin(hvd_data, tzolkin_data):
    """
    Микросервис отладки БЛОКОВ 2B и 1D: Чакроанализ ХВД + Галактический Куб Цолькин.
    ИСПРАВЛЕНО: Ликвидация 'null' за счет автоматической десериализации (Auto JSON Loads).
    """
    print("\n" + "="*75)
    print("🌀 LAYER_LOG :: БЛОКИ 2B/1D - ЧАКРОАНАЛИЗ ХВД + КУБ ЦОЛЬКИН")
    print("="*75)
    try:
        # ПАТЧ БЕЗОПАСНОСТИ: Если данные зашли как JSON-строка, принудительно парсим их в dict [INDEX: 0.1.10]
        if isinstance(tzolkin_data, str):
            try:
                tzolkin_data = json.loads(tzolkin_data)
            except Exception:
                pass
                
        if isinstance(hvd_data, str):
            try:
                hvd_data = json.loads(hvd_data)
            except Exception:
                pass

        # Безопасный плоский рендеринг (Остальная часть функции идет без изменений)
        mini_json = {
            "hvd_chakras_capacity": hvd_data.get("raw_ch", hvd_data.get("chakras_capacity_percent")) if isinstance(hvd_data, dict) else None,
            "hvd_integral_contours": hvd_data.get("integral_contours") if isinstance(hvd_data, dict) else None,
            
            # Теперь .get() гарантированно отработает по живому словарю! [INDEX: 0.1.137]
            "tzolkin_3d_tensor_T_F_C": tzolkin_data.get("galactic_cube_tensor") if isinstance(tzolkin_data, dict) else None,
            "galactic_oracle_5_nodes": tzolkin_data.get("galactic_oracle_nodes") if isinstance(tzolkin_data, dict) else None
        }
        
        # Печать сырого дампа для системного логгера API
        print("[RAW DATA DUMP]:")
        print(json.dumps(mini_json, ensure_ascii=False, indent=2))
        print("-" * 75)

        # 3. КРАСИВЫЙ ИНТЕРФЕЙСНЫЙ ВЫВОД: Графический Крест Оракула (Защита от дрейфа)
        oracle_nodes = mini_json["galactic_oracle_5_nodes"] # Берем уже из верифицированного mini_json
        if oracle_nodes:
            cube_tensor = mini_json["tzolkin_3d_tensor_T_F_C"]
            kin_id = cube_tensor.get("kin_destiny", 43)
            
            print(f"[2.2] КАНОНИЧЕСКИЙ КРЕСТ ОРАКУЛА ПЯТЫХ СИЛ ДЛЯ КИН {kin_id}:")
            
            core = oracle_nodes.get("destiny_core", {}).get("name", "N/A").upper()
            analog = oracle_nodes.get("analogue_support", {}).get("name", "N/A").upper()
            antipode = oracle_nodes.get("antipode_challenge", {}).get("name", "N/A").upper()
            occult = oracle_nodes.get("occult_hidden_power", {}).get("name", "N/A").upper()
            guide = oracle_nodes.get("guide_vector", {}).get("name", "N/A").upper()
            
            # Моноширинная текстовая разметка креста в консоли терминала
            print(f"                       [ВЫСШЕЕ Я / ГИД]                     ")
            print(f"                       {guide}                      ")
            print(f"                               │                            ")
            print(f"  [ПОДДЕРЖКА / АНАЛОГ] ────────┼──────── [ВЫЗОВ / АНТИПОД]  ")
            print(f"  {analog} ───┼─── {antipode}")
            print(f"                               │                            ")
            print(f"                        [ЯДРО СУДЬБЫ]                       ")
            print(f"                        {core}                      ")
            print(f"                               │                            ")
            print(f"                       [СКРЫТАЯ СИЛА]                       ")
            print(f"                       {occult}                     ")
            
        print("="*75)
        
    except Exception as e:
        print(f"❌ Ошибка отладки Блоков ХВД/Цолькин: {str(e)}")




def log_cross_system_stents(all_resonance_nodes, tsp_modifiers):
    """Микросервис отладки БЛОКА 1E: Генеральная Кросс-Системная Супералхимия."""
    print("\n[🎯 LAYER_LOG :: БЛОК 1E - КРОСС-СИСТЕМНЫЕ СЦЕПКИ И ПАНЦИРЬ РАЙХА]")
    try:
        mini_json = {
            "active_resonance_nodes_count": len(all_resonance_nodes),
            "resolved_patterns_list": all_resonance_nodes,
            "final_somatic_tensor_reich_uV": tsp_modifiers
        }
        print(json.dumps(mini_json, ensure_ascii=False, indent=2))
    except Exception as e:
        print(f"❌ Ошибка отладки Блока 1E: {str(e)}")

# =========================================================================
# JIA_ZI_10X12_MATRIX: ПОЛНЫЙ ФИКСИРОВАННЫЙ РЕЕСТР 60 ГАЛАКТИЧЕСКИХ ЧИПОВ
# =========================================================================
# Ключ: (stem_id, branch_id) -> Координаты ячейки в матрице 10х12
# Значение: (jia_zi_id, "Имя Столпа", [Дерево, Огонь, Земля, Металл, Вода])
# =========================================================================
JIA_ZI_10X12_MATRIX = {
    # --- СТРОКА 0: ЦЗЯ (ЯН ДЕРЕВО) ---
    (0, 0):  (1,  "Цзя-Цзы (Ян Дерево на Крысе)",         [1.0, 0.0, 0.0, 0.0, 1.0]),
    (0, 2):  (13, "Цзя-Инь (Ян Дерево на Тигре)",         [2.0, 0.3, 0.1, 0.0, 0.0]),
    (0, 4):  (25, "Цзя-Чэнь (Ян Дерево на Драконе)",       [1.3, 0.0, 1.6, 0.0, 0.1]),
    (0, 6):  (37, "Цзя-У (Ян Дерево на Лошади)",          [1.0, 0.7, 0.3, 0.0, 0.0]),
    (0, 8):  (49, "Цзя-Шэнь (Ян Дерево на Обезьяне)",     [1.0, 0.0, 0.1, 1.6, 0.3]),
    (0, 10): (61, "Цзя-Сюй (Ян Дерево на Собаке)",        [1.0, 0.1, 1.6, 0.3, 0.0]),

    # --- СТРОКА 1: И (ИНЬ ДЕРЕВО) ---
    (1, 1):  (2,  "И-Чоу (Инь Дерево на Быке)",           [1.0, 0.0, 1.6, 0.3, 0.1]),
    (1, 3):  (14, "И-Мао (Инь Дерево на Кролике)",         [2.0, 0.0, 0.0, 0.0, 0.0]),
    (1, 5):  (26, "И-Сы (Инь Дерево на Змее)",            [1.0, 1.6, 0.3, 0.1, 0.0]),
    (1, 7):  (38, "И-Вэй (Инь Дерево на Козе)",           [1.1, 0.3, 1.6, 0.0, 0.0]),
    (1, 9):  (50, "И-Ю (Инь Дерево на Петухе)",           [1.0, 0.0, 0.0, 1.0, 0.0]),
    (1, 11): (62, "И-Хай (Инь Дерево на Свинье)",         [1.3, 0.0, 0.0, 0.0, 1.7]),

    # --- СТРОКА 2: БИН (ЯН ОГОНЬ) ---
    (2, 0):  (3,  "Бин-Цзы (Ян Огонь на Крысе)",          [0.0, 1.0, 0.0, 0.0, 1.0]),
    (2, 2):  (15, "Бин-Инь (Ян Огонь на Тигре)",          [1.6, 1.3, 0.1, 0.0, 0.0]),
    (2, 4):  (27, "Бин-Чэнь (Ян Огонь на Драконе)",       [0.3, 1.0, 1.6, 0.0, 0.1]),
    (2, 6):  (39, "Бин-У (Ян Огонь на Лошади)",           [0.0, 1.7, 0.3, 0.0, 0.0]),
    (2, 8):  (51, "Бин-Шэнь (Ян Огонь на Обезьяне)",      [0.0, 1.0, 0.1, 1.6, 0.3]),
    (2, 10): (63, "Бин-Сюй (Ян Огонь на Собаке)",         [0.0, 1.1, 1.6, 0.3, 0.0]),

    # --- СТРОКА 3: ДИН (ИНЬ ОГОНЬ) ---
    (3, 1):  (4,  "Дин-Чоу (Инь Огонь на Быке)",          [0.0, 1.0, 1.6, 0.3, 0.1]),
    (3, 3):  (16, "Дин-Мао (Инь Огонь на Кролике)",        [1.0, 1.0, 0.0, 0.0, 0.0]),
    (3, 5):  (28, "Дин-Сы (Инь Огонь на Змее)",           [0.0, 1.6, 0.3, 0.1, 0.0]),
    (3, 7):  (40, "Дин-Вэй (Инь Огонь на Козе)",          [0.1, 1.3, 1.6, 0.0, 0.0]),
    (3, 9):  (52, "Дин-Ю (Инь Огонь на Петухе)",          [0.0, 1.0, 0.0, 1.0, 0.0]),
    (3, 11): (64, "Дин-Хай (Инь Огонь на Свинье)",        [0.3, 1.0, 0.0, 0.0, 1.7]),

    # --- СТРОКА 4: У (ЯН ЗЕМЛЯ) ---
    (4, 0):  (5,  "У-Цзы (Ян Земля на Крысе)",            [0.0, 0.0, 1.0, 0.0, 1.0]),
    (4, 2):  (17, "У-Инь (Ян Земля на Тигре)",            [1.6, 0.3, 1.1, 0.0, 0.0]),
    (4, 4):  (29, "У-Чэнь (Ян Земля на Драконе)",         [0.3, 0.0, 2.6, 0.0, 0.1]),
    (4, 6):  (41, "У-У (Ян Земля на Лошади)",             [0.0, 0.7, 1.3, 0.0, 0.0]),
    (4, 8):  (53, "У-Шэнь (Ян Земля на Обезьяне)",        [0.0, 0.0, 1.1, 1.6, 0.3]),
    (4, 10): (65, "У-Сюй (Ян Земля на Собаке)",           [0.0, 0.1, 2.6, 0.3, 0.0]),

    # --- СТРОКА 5: ЦЗИ (ИНЬ ЗЕМЛЯ) ---
    (5, 1):  (6,  "Цзи-Чоу (Инь Земля на Быке)",          [0.0, 0.0, 2.6, 0.3, 0.1]),
    (5, 3):  (18, "Цзи-Мао (Инь Земля на Кролике)",        [1.0, 0.0, 1.0, 0.0, 0.0]),
    (5, 5):  (30, "Цзи-Сы (Инь Земля на Змее)",           [0.0, 1.6, 1.3, 0.1, 0.0]),
    (5, 7):  (42, "Цзи-Вэй (Инь Земля на Козе)",          [0.1, 0.3, 2.6, 0.0, 0.0]),
    (5, 9):  (54, "Цзи-Ю (Инь Земля на Петухе)",          [0.0, 0.0, 1.0, 1.0, 0.0]),
    (5, 11): (66, "Цзи-Хай (Инь Земля на Свинье)",        [0.3, 0.0, 1.0, 0.0, 1.7]),

    # --- СТРОКА 6: ГЭН (ЯН МЕТАЛЛ) ---
    (6, 0):  (7,  "Гэн-Цзы (Ян Металл на Крысе)",         [0.0, 0.0, 0.0, 1.0, 1.0]),
    (6, 2):  (19, "Гэн-Инь (Ян Металл на Тигре)",         [1.6, 0.3, 0.1, 1.0, 0.0]),
    (6, 4):  (31, "Гэн-Чэнь (Ян Металл на Драконе)",      [0.3, 0.0, 1.6, 1.0, 0.1]),
    (6, 6):  (43, "Гэн-У (Ян Металл на Лошади)",          [0.0, 0.7, 0.3, 1.0, 0.0]),
    (6, 8):  (55, "Гэн-Шэнь (Ян Металл на Обезьяне)",     [0.0, 0.0, 0.1, 2.6, 0.3]),
    (6, 10): (67, "Гэн-Сюй (Ян Металл на Собаке)",        [0.0, 0.1, 1.6, 1.3, 0.0]),

    # --- СТРОКА 7: СИНЬ (ИНЬ МЕТАЛЛ) ---
    (7, 1):  (8,  "Синь-Чоу (Инь Металл на Быке)",        [0.0, 0.0, 1.6, 1.3, 0.1]),
    (7, 3):  (20, "Синь-Мао (Инь Металл на Кролике)",       [1.0, 0.0, 0.0, 1.0, 0.0]),
    (7, 5):  (32, "Синь-Сы (Инь Металл на Змее)",          [0.0, 1.6, 0.3, 1.1, 0.0]),
    (7, 7):  (44, "Синь-Вэй (Инь Металл на Козе)",         [0.1, 0.3, 1.6, 1.0, 0.0]),
    (7, 9):  (56, "Синь-Ю (Инь Металл на Петухе)",         [0.0, 0.0, 0.0, 2.0, 0.0]),
    (7, 11): (68, "Синь-Хай (Инь Металл на Свинье)",       [0.3, 0.0, 0.0, 1.0, 1.7]),

    # --- СТРОКА 8: ЖЭНЬ (ЯН ВОДА) ---
    (8, 0):  (9,  "Жэнь-Цзы (Ян Вода на Крысе)",          [0.0, 0.0, 0.0, 0.0, 2.0]),
    (8, 2):  (21, "Жэнь-Инь (Ян Вода на Тигре)",          [1.6, 0.3, 0.1, 0.0, 1.0]),
    (8, 4):  (33, "Жэнь-Чэнь (Ян Вода на Драконе)",       [0.3, 0.0, 1.6, 0.0, 1.1]),
    (8, 6):  (45, "Жэнь-У (Ян Вода на Лошади)",           [0.0, 0.7, 0.3, 0.0, 1.0]),
    (8, 8):  (57, "Жэнь-Шэнь (Ян Вода на Обезьяне)",      [0.0, 0.0, 0.1, 1.6, 1.3]),
    (8, 11): (9,  "Жэнь-Хай (Ян Вода на Свинье)",         [0.3, 0.0, 0.0, 0.0, 2.7]),

    # --- СТРОКА 9: КВЕЙ (ИНЬ ВОДА) ---
    (9, 1):  (10, "Квей-Чоу (Инь Вода на Быке)",          [0.0, 0.0, 1.6, 0.3, 1.1]),
    (9, 3):  (22, "Квей-Мао (Инь Вода на Кролике)",        [1.0, 0.0, 0.0, 0.0, 2.0]),
    (9, 5):  (34, "Квей-Сы (Инь Вода на Змее)",           [0.0, 1.6, 0.3, 0.1, 1.0]),
    (9, 7):  (46, "Квей-Вэй (Инь Вода на Козе)",          [0.1, 0.3, 1.6, 0.0, 1.0]),
    (9, 9):  (58, "Квей-Ю (Инь Вода на Петухе)",          [0.0, 0.0, 0.0, 1.0, 1.0]),
    (9, 11): (10, "Квей-Хай (Инь Вода на Свинье)",        [0.3, 0.0, 0.0, 0.0, 2.0])
}

import numpy as np

def fast_compute_usin_matrix(pillars_data):
    """
    BLOCK_2A_SUPERCORE: Мгновенное квантование У-Син через жесткую матрицу JIA_ZI_10X12.
    pillars_data = {"hour": (s_id, b_id), "day": (s_id, b_id), "month": (s_id, b_id), "year": (s_id, b_id)}
    """
    try:
        # Результирующий вектор: [Дерево, Огонь, Земля, Металл, Вода]
        total_usin_profile = np.zeros(5)
        activated_pillars_info = {}

        for name, coords in pillars_data.items():
            # Защита: если ячейка матрицы пустая (несоответствие Инь-Ян) -> Fatal Error
            if coords not in JIA_ZI_10X12_MATRIX:
                raise ValueError(f"Критическая ошибка матрицы 10х12: Координаты {coords} невалидны.")
                
            # O(1) извлечение данных из хардлока
            jia_zi_id, pillar_name, usin_weights = JIA_ZI_10X12_MATRIX[coords]
            
            # Накапливаем веса стихий (включая скрытые стволы, зашитые в весах)
            total_usin_profile += np.array(usin_weights)
            activated_pillars_info[name] = {"jia_zi_index": jia_zi_id, "signature": pillar_name}

        # Вычисление деструктивных и застойных узлов
        generation_deltas = np.roll(total_usin_profile, -1) - total_usin_profile # Цикл Шэн
        uwei_stagnation_id = int(np.argmin(generation_deltas[:5]))
        
        control_deltas = np.roll(total_usin_profile, -2) - total_usin_profile # Цикл Кэ
        rebellion_index = float(np.max(control_deltas[:5]))

        # Органы Цзан-Фу
        zang_fu = {0: "Печень/Желчный", 1: "Сердце/Тонкий киш.", 2: "Селезенка/Желудок", 3: "Легкие/Толстый киш.", 4: "Почки/Мочевой"}

        return {
            "success": True,
            "usin_matrix_snapshot": {
                "vector_mu_huo_tu_jin_shui": list(np.round(total_usin_profile, 2)),
                "uwei_stagnation_node": zang_fu[uwei_stagnation_id],
                "rebellion_coefficient": round(rebellion_index, 2),
                "heat_ratio": round(float((total_usin_profile[0] + total_usin_profile[1]) / (total_usin_profile[3] + total_usin_profile[4] + 1e-5)), 2),
                "pillars_resolved": activated_pillars_info
            }
        }
    except Exception as e:
        return {"success": False, "error": f"[0x2A_USIN_CRASH]: {str(e)}"}

import math
import swisseph as swe

import math
import swisseph as swe

import math
import swisseph as swe

def get_astronomical_pillars(jd_local, lon_geo):
    """
    BLOCK_2A_INPUT: Абсолютная каноническая синхронизация с калькулятором Mingli.ru.
    Полностью устранен дрейф констант, баг вложенных кортежей и ошибки четности.
    
    Тест-эталон (Mingli для субъекта 25.02.1991):
      - Год:   Синь-Вэй (7, 7)  [Инь Металл на Козе]
      - Месяц: Гэн-Инь  (6, 2)  [Ян Металл на Тигре]
      - День:  Бин-Инь  (2, 2)  [Ян Огонь на Тигре]
      - Час:   Дин-Ю    (3, 9)  [Инь Огонь на Петухе] (При времени рождения ~17:00-19:00)
    """
    # Распаковываем локальный Юлианский день на исходные компоненты LMT
    y, m, d, hour_float = swe.revjul(jd_local)
    
    # --- 1. КОРРЕКЦИЯ ИСТИННОГО СОЛНЕЧНОГО ВРЕМЕНИ (LMT) ---
    lmt_offset_days = lon_geo / 360.0
    jd_lmt = jd_local + lmt_offset_days
    
    # --- 2. ТОЧНЫЙ РАСЧЕТ СТОЛПА ГОДА (Личунь-Лок) ---
    # 1984 год — базовый год 60-летнего цикла (Цзя-Цзы, ID 0)
    year_index = (int(y) - 1984) % 60
    if year_index < 0: 
        year_index += 60
        
    # Вызываем эфемериды NASA JPL. swe.calc_ut возвращает кортеж (массив_координат, flags)
    raw_res, flags = swe.calc_ut(jd_local, swe.SUN)
    
    # ИСПРАВЛЕНИЕ БАГА ТИПИЗАЦИИ: raw_res — это кортеж. Извлекаем строго первый индекс (lon)
    sun_lon = float(raw_res[0]) 
    
    # Новый год в календаре Ся наступает СТРОГО при sun_lon >= 315.0 (Сезон Личунь).
    if sun_lon < 315.0:
        year_index = (year_index - 1) % 60

    year_stem_id = year_index % 10
    year_branch_id = year_index % 12

    # --- 3. ТОЧНЫЙ РАСЧЕТ СТОЛПА МЕСЯЦА ---
    # Сдвигаем шкалу эклиптики так, чтобы точка Личунь (315°) стала нулем отсчета месяцев
    adjusted_sun = (sun_lon - 315.0) % 360.0
    month_offset = int(adjusted_sun // 30.0) # Сколько солнечных месяцев прошло от Личунь
    
    # Ветвь месяца: отсчет в календаре Ся всегда стартует со знака Тигра (ID 2)
    month_branch_id = (month_offset + 2) % 12
    
    # Вычисление Ствола Месяца (Каноническое «Правило Тигра»)
    month_stem_start = (year_stem_id * 2 + 2) % 10
    month_stem_id = (month_stem_start + month_offset) % 10

    # --- 4. ТОЧНЫЙ РАСЧЕТ СТОЛПА ДНЯ (Математический синхро-лок) ---
    # ИСТИННАЯ АСТРОНОМИЧЕСКАЯ БАЗА: 23 января 1984 года, 12:00 LMT — день Цзя-Цзы (0, 0)
    # Скорректировано под Си-ядро эфемерид UT, что убирает дрейф на 8 дней назад
    jd_base_day = 2445730.5  
    
    delta_days = int(math.floor(jd_lmt - jd_base_day))
    day_index = delta_days % 60
    day_stem_id = day_index % 10
    day_branch_id = day_index % 12

    # --- 5. ТОЧНЫЙ РАСЧЕТ СТОЛПА ЧАСА (Каноническое «Правило Крысы») ---
    # Сутки делятся на 12 двухчасовок. Час Крысы (0) стартует в 23:00 локального времени LMT.
    adjusted_hour = (hour_float + 1.0) % 24.0
    hour_branch_id = int(adjusted_hour // 2.0)
    
    # Поправка на китайский стык суток (двухчасовка 23:00 - 00:00 — это час Крысы СЛЕДУЮЩЕГО дня)
    calc_day_stem_id = day_stem_id
    if hour_float >= 23.0:
        calc_day_stem_id = (day_stem_id + 1) % 10
        
    # Формула «Гнездо Крысы» для вычисления Ствола Часа от Ствола Дня
    hour_stem_start = (calc_day_stem_id * 2) % 10
    hour_stem_id = (hour_stem_start + hour_branch_id) % 10

    # ПРЯМОЙ И СТАБИЛЬНЫЙ ВЫВОД ИНДЕКСОВ (Недостоверный фильтр четности шага 5 полностью удален)
    return {
        "hour":  (hour_stem_id, hour_branch_id),
        "day":   (day_stem_id, day_branch_id),
        "month": (month_stem_id, month_branch_id),
        "year":  (year_stem_id, year_branch_id)
    }






import numpy as np

# Справочник органов и векторов зажимов для интеграции в Панцирь Райха
USIN_SOMATIC_MAP = {
    0: {"name": "Вода (Почки / Мочевой)", "segment": "segment_7", "base_penalty": 2.5, "desc": "Страх, холод, зажим малого таза"},
    1: {"name": "Дерево (Печень / Желчный)", "segment": "segment_2", "base_penalty": 3.0, "desc": "Гнев, застой Ци, спазм челюсти (массетеров)"},
    2: {"name": "Огонь (Сердце / Тонкий киш.)", "segment": "segment_4", "base_penalty": 2.5, "desc": "Перегрев, гиперактивность, зажим грудной клетки"},
    3: {"name": "Земля (Селезенка / Желудок)", "segment": "segment_5", "base_penalty": 2.0, "desc": "Стагнация влажности, зажим диафрагмы"},
    4: {"name": "Металл (Легкие / Толстый киш.)", "segment": "segment_3", "base_penalty": 2.5, "desc": "Скорбь, сухость, спазм шеи и горла"}
}

def apply_usin_to_reich(bazi_pillars, tsp_modifiers):
    """
    Прикладной сопроцессор У-Син. Вычисляет циклы Созидания/Разрушения 
    и напрямую накидывает штрафные милливольты на сегменты панциря Райха.
    """
    # Результирующий вектор: [Вода, Дерево, Огонь, Земля, Металл] (Привели к вашей последовательности)
    # Индексы: 0=Вода, 1=Дерево, 2=Огонь, 3=Земля, 4=Металл
    usin_vector = np.zeros(5)
    pillars_resolved = {}

    # 1. Извлекаем веса из жесткой матрицы 10х12
    for name, coords in bazi_pillars.items():
        if coords in JIA_ZI_10X12_MATRIX:
            _, p_name, weights = JIA_ZI_10X12_MATRIX[coords]
            # Исходные веса матрицы: [Дерево, Огонь, Земля, Металл, Вода]
            # Перестраиваем в канонический шаг: [Вода, Дерево, Огонь, Земля, Металл]
            reordered_weights = np.array([weights[4], weights[0], weights[1], weights[2], weights[3]])
            usin_vector += reordered_weights
            pillars_resolved[name] = p_name

    # 2. ПОСЛЕДОВАТЕЛЬНОСТЬ СОЗИДАНИЯ (Вода -> Дерево -> Огонь -> Земля -> Металл -> Вода)
    # Ищем обрыв притока Ци. Дельта: Элемент_Получатель - Элемент_Донор
    creation_deltas = np.array([
        usin_vector[1] - usin_vector[0],  # Дерево - Вода
        usin_vector[2] - usin_vector[1],  # Огонь - Дерево
        usin_vector[3] - usin_vector[2],  # Земля - Огонь
        usin_vector[4] - usin_vector[3],  # Металл - Земля
        usin_vector[0] - usin_vector[4]   # Вода - Металл
    ])
    # Тот, кто НЕ получил энергию от матери, уходит в застой.
    stagnation_idx = int(np.argmin(creation_deltas))

    # 3. ПОСЛЕДОВАТЕЛЬНОСТЬ РАЗРУШЕНИЯ (Огонь->Металл->Дерево->Земля->Вода->Огонь)
    # Вычисляем избыточное угнетение элемента через один шаг
    destruction_deltas = np.array([
        usin_vector[2] - usin_vector[4],  # Огонь выжигает Металл (индексы: Огонь=2, Металл=4)
        usin_vector[4] - usin_vector[1],  # Металл рубит Дерево  (Металл=4, Дерево=1)
        usin_vector[1] - usin_vector[3],  # Дерево истощает Землю (Дерево=1, Земля=3)
        usin_vector[3] - usin_vector[0],  # Земля засыпает Воду  (Земля=3, Вода=0)
        usin_vector[0] - usin_vector[2]   # Вода гасит Огонь     (Вода=0, Огонь=2)
    ])
    rebellion_idx = int(np.argmax(destruction_deltas))
    rebellion_coeff = float(destruction_deltas[rebellion_idx])

    # Названия пар разрушения для ИИ
    destruction_pairs = {
        0: "Огонь избыточно выжигает Металл (Легкие под ударом Сердца)",
        1: "Металл избыточно рубит Дерево (Печень под ударом Легких)",
        2: "Дерево избыточно истощает Землю (Селезенка под ударом Печени)",
        3: "Земля избыточно засыпает Воду (Почки под ударом Селезенки)",
        4: "Вода избыточно гасит Огонь (Сердце под ударом Почек)"
    }

    # 4. ПРИКЛАДНАЯ ДЕТОНАЦИЯ ЗАЖИМОВ РАЙХА
    # Накидываем штрафы на сегменты Райха на основе патологий У-Син
    stagnation_meta = USIN_SOMATIC_MAP[stagnation_idx]
    rebellion_meta = USIN_SOMATIC_MAP[rebellion_idx]

    # Принудительная инъекция весов в шину tsp_modifiers
    tsp_modifiers[stagnation_meta["segment"]] += stagnation_meta["base_penalty"] * 1.5
    tsp_modifiers[rebellion_meta["segment"]] += rebellion_meta["base_penalty"] * (1.0 + (rebellion_coeff * 0.1))

    return {
        "calibrated_vector_shui_mu_huo_tu_jin": list(np.round(usin_vector, 2)),
        "stagnation_node_injury": stagnation_meta["name"],
        "stagnation_somatic_segment": stagnation_meta["segment"],
        "rebellion_conflict_signature": destruction_pairs[rebellion_idx],
        "rebellion_somatic_segment": rebellion_meta["segment"],
        "rebellion_coefficient": round(rebellion_coeff, 2),
        "pillars_resolved": pillars_resolved
    }

def generate_usin_json_core(bazi_pillars, tsp_modifiers):
    """
    BLOCK_2A_ENGINE: Автономный матричный процессор У-Син и академической клиники.
    Рассчитывает циклы Созидания/Разрушения и интегрирует их с медициной Селье и Анохина.
    
    Вход: 
        bazi_pillars: dict вида {"year": (s_id, b_id), "month": (s_id, b_id), ...}
        tsp_modifiers: dict текущей шины зажимов Райха (модифицируется на лету)
    Выход: 
        (usin_snapshot, academic_core) - кортеж из двух готовых JSON-структур
    """
    import numpy as np

    # Инициализация вектора: [0=Вода, 1=Дерево, 2=Огонь, 3=Земля, 4=Металл]
    usin_vector = np.zeros(5)
    pillars_resolved = {}

    # 1. Извлечение весов из жесткой матрицы 10х12 и ремаппинг в каноническую последовательность
    for name, coords in bazi_pillars.items():
        if coords in JIA_ZI_10X12_MATRIX:
            _, p_name, weights = JIA_ZI_10X12_MATRIX[coords]
            # Исходные веса: [Дерево(0), Огонь(1), Земля(2), Металл(3), Вода(4)]
            # Перестраиваем в шаг: [Вода, Дерево, Огонь, Земля, Металл]
            reordered_weights = np.array([weights[4], weights[0], weights[1], weights[2], weights[3]])
            usin_vector += reordered_weights
            pillars_resolved[name] = p_name

    # 2. ПОСЛЕДОВАТЕЛЬНОСТЬ СОЗИДАНИЯ (Вода -> Дерево -> Огонь -> Земля -> Металл)
    creation_deltas = np.array([
        usin_vector[1] - usin_vector[0],  # Дерево - Вода
        usin_vector[2] - usin_vector[1],  # Огонь - Дерево
        usin_vector[3] - usin_vector[2],  # Земля - Огонь
        usin_vector[4] - usin_vector[3],  # Металл - Земля
        usin_vector[0] - usin_vector[4]   # Вода - Металл
    ])
    stagnation_idx = int(np.argmin(creation_deltas))

    # 3. ПОСЛЕДОВАТЕЛЬНОСТЬ РАЗРУШЕНИЯ (Огонь->Металл->Дерево->Земля->Вода)
    destruction_deltas = np.array([
        usin_vector[2] - usin_vector[4],  # Огонь выжигает Металл
        usin_vector[4] - usin_vector[1],  # Металл рубит Дерево
        usin_vector[1] - usin_vector[3],  # Дерево истощает Землю
        usin_vector[3] - usin_vector[0],  # Земля засыпает Воду
        usin_vector[0] - usin_vector[2]   # Вода гасит Огонь
    ])
    rebellion_idx = int(np.argmax(destruction_deltas))
    rebellion_coeff = float(destruction_deltas[rebellion_idx])

    destruction_pairs = {
        0: "Огонь избыточно выжигает Металл (Легкие под ударом Сердца)",
        1: "Металл избыточно рубит Дерево (Печень под ударом Легких)",
        2: "Дерево избыточно истощает Землю (Селезенка под ударом Печени)",
        3: "Земля избыточно засыпает Воду (Почки под ударом Селезенки)",
        4: "Вода избыточно гасит Огонь (Сердце под ударом Почек)"
    }

    # 4. ДЕТОНАЦИЯ ЗАЖИМОВ ПАНЦИРЯ РАЙХА
    stagnation_meta = USIN_SOMATIC_MAP[stagnation_idx]
    rebellion_meta = USIN_SOMATIC_MAP[rebellion_idx]
    
    tsp_modifiers[stagnation_meta["segment"]] += stagnation_meta["base_penalty"] * 1.5
    tsp_modifiers[rebellion_meta["segment"]] += rebellion_meta["base_penalty"] * (1.0 + (rebellion_coeff * 0.1))

    # Расчет теплового коэффициента (Ян / Инь)
    # Ян: Дерево(1) + Огонь(2) | Инь: Металл(4) + Вода(0)
    heat_ratio = round(float((usin_vector[1] + usin_vector[2]) / (usin_vector[4] + usin_vector[0] + 1e-5)), 2)

    # Сборка объекта У-Син
    usin_snapshot = {
        "calibrated_vector_shui_mu_huo_tu_jin": list(np.round(usin_vector, 2)),
        "stagnation_node_injury": stagnation_meta["name"],
        "stagnation_somatic_segment": stagnation_meta["segment"],
        "rebellion_conflict_signature": destruction_pairs[rebellion_idx],
        "rebellion_somatic_segment": rebellion_meta["segment"],
        "rebellion_coefficient": round(rebellion_coeff, 2),
        "heat_ratio": heat_ratio,
        "pillars_resolved": pillars_resolved
    }

    # 5. СБОРКА АКАДЕМИЧЕСКОГО КЛИНИЧЕСКОГО БЛОКА
    if usin_vector[0] < 1.5:
        selye_stage = "СТАДИЯ_3: ИСТОЩЕНИЕ (Коллапс надпочечников / Хроническая ваготония)"
    elif heat_ratio > 1.8 or rebellion_coeff > 3.5:
        selye_stage = "СТАДИЯ_1: ТРЕВОГА (Острая симпатикотония / Адреналиновый овервольтаж)"
    else:
        selye_stage = "СТАДИЯ_2: РЕЗИСТЕНТНОСТЬ (Кортизоловое удержание гомеостаза)"

    academic_core = {
        "general_adaptation_syndrome": {
            "stage_resolved": selye_stage,
            "kinetic_heat_ratio": heat_ratio,
            "vegetative_balance_profile": "Симпатикотония" if heat_ratio > 1.0 else "Ваготония"
        },
        "alexithymia_somatization_channels": {
            "stagnation_target_organ": stagnation_meta["name"],
            "conflict_destruction_signature": destruction_pairs[rebellion_idx],
            "somatic_risk_group_clinical": [
                r for r in [
                    "Ангионевротический спазм сосудов (При застоях Дерева)" if usin_vector[1] > 4.0 else None,
                    "Синдром раздраженного кишечника / СРК (При застое Земли)" if usin_vector[3] > 4.0 else None,
                    "Респираторный соматоформный синдром (При дефиците Металла)" if usin_vector[4] < 1.5 else None,
                    "Нефрогенная лабильность напряжения (При дефиците Воды)" if usin_vector[0] < 1.5 else None
                ] if r is not None
            ]
        },
        "anokhin_functional_loops": {
            "disrupted_feedback_loop": f"Ось_Патологии_{stagnation_meta['segment']}",
            "homeostasis_pressure_coefficient": round(float(rebellion_coeff * 0.8), 2)
        }
    }

    return usin_snapshot, academic_core


import numpy as np

def calculate_usin_somatic_vector(bazi_pillars, tsp_modifiers):
    """
    BLOCK_2A_SUB_1: Матричный калькулятор Ба-Цзы 10х12 и соматики Райха.
    Очищен от ошибок типизации (tuple/float).
    
    Последовательность: [0=Вода, 1=Дерево, 2=Огонь, 3=Земля, 4=Металл]
    """

    # Справочник скрытых стволов (Цан Гань)
    HIDDEN_STEMS_ATLAS = {
        0:  {0: 1.0},
        1:  {3: 0.6, 4: 0.3, 0: 0.1},
        2:  {1: 0.6, 2: 0.3, 3: 0.1},
        3:  {1: 1.0},
        4:  {3: 0.6, 1: 0.3, 0: 0.1},
        5:  {2: 0.6, 3: 0.3, 4: 0.1},
        6:  {2: 0.7, 3: 0.3},
        7:  {3: 0.6, 2: 0.3, 1: 0.1},
        8:  {4: 0.6, 0: 0.3, 3: 0.1},
        9:  {4: 1.0},
        10: {3: 0.6, 4: 0.3, 2: 0.1},
        11: {0: 0.7, 1: 0.3}
    }

    # Срезы: [Вода, Дерево, Огонь, Земля, Металл]
    usin_vector = np.zeros(5, dtype=float)
    pillars_resolved = {}

    for pillar_name, coords in bazi_pillars.items():
        # coords — это строго кортеж (stem_id, branch_id)
        if coords in JIA_ZI_10X12_MATRIX:
            stem_id, branch_id = coords
            _, p_name, base_weights = JIA_ZI_10X12_MATRIX[coords]
            pillars_resolved[pillar_name] = p_name
            
            # base_weights из матрицы: [Дерево(0), Огонь(1), Земля(2), Металл(3), Вода(4)]
            # Ремаппинг в: [Вода, Дерево, Огонь, Земля, Металл]
            reordered_base = np.array([base_weights[4], base_weights[0], base_weights[1], base_weights[2], base_weights[3]], dtype=float)
            usin_vector += reordered_base
            
            # Распаковка скрытых стволов
            if branch_id in HIDDEN_STEMS_ATLAS:
                for element_id, proportion in HIDDEN_STEMS_ATLAS[branch_id].items():
                    usin_vector[element_id] += 1.5 * float(proportion)

    # ПОСЛЕДОВАТЕЛЬНОСТЬ СОЗИДАНИЯ (Вода -> Дерево -> Огонь -> Земля -> Металл)
    creation_deltas = np.array([
        usin_vector[1] - usin_vector[0],  # Дерево - Вода
        usin_vector[2] - usin_vector[1],  # Огонь - Дерево
        usin_vector[3] - usin_vector[2],  # Земля - Огонь
        usin_vector[4] - usin_vector[3],  # Металл - Земля
        usin_vector[0] - usin_vector[4]   # Вода - Металл
    ], dtype=float)
    stagnation_idx = int(np.argmin(creation_deltas))

    # ПОСЛЕДОВАТЕЛЬНОСТЬ РАЗРУШЕНИЯ (Огонь -> Металл -> Дерево -> Земля -> Вода)
    destruction_deltas = np.array([
        usin_vector[2] - usin_vector[4],  # Огонь выжигает Металл
        usin_vector[4] - usin_vector[1],  # Металл рубит Дерево
        usin_vector[1] - usin_vector[3],  # Дерево истощает Землю
        usin_vector[3] - usin_vector[0],  # Земля засыпает Воду
        usin_vector[0] - usin_vector[2]   # Вода гасит Огонь
    ], dtype=float)
    rebellion_idx = int(np.argmax(destruction_deltas))
    rebellion_coeff = float(destruction_deltas[rebellion_idx])

    destruction_pairs = {
        0: "Огонь избыточно выжигает Металл (Легкие под ударом Сердца)",
        1: "Металл избыточно рубит Дерево (Печень под ударом Легких)",
        2: "Дерево избыточно истощает Землю (Селезенка под ударом Печени)",
        3: "Земля избыточно засыпает Воду (Почки под ударом Селезенки)",
        4: "Вода избыточно гасит Огонь (Сердце под ударом Почек)"
    }

    # Наложение штрафов на Райха
    stagnation_meta = USIN_SOMATIC_MAP[stagnation_idx]
    rebellion_meta = USIN_SOMATIC_MAP[rebellion_idx]
    
    tsp_modifiers[stagnation_meta["segment"]] += stagnation_meta["base_penalty"] * 1.5
    tsp_modifiers[rebellion_meta["segment"]] += rebellion_meta["base_penalty"] * (1.0 + (rebellion_coeff * 0.1))

    # ИСПРАВЛЕНО: Расчет теплового коэффициента Ян / Инь через явные скалярные индексы
    # Ян = Дерево[1] + Огонь[2] | Инь = Металл[4] + Вода[0]
    yan_sum = float(usin_vector[1] + usin_vector[2])
    yin_sum = float(usin_vector[4] + usin_vector[0])
    heat_ratio = round(yan_sum / (yin_sum + 1e-5), 2)

    return {
        "calibrated_vector_shui_mu_huo_tu_jin": list(np.round(usin_vector, 2)),
        "stagnation_node_injury": stagnation_meta["name"],
        "stagnation_somatic_segment": stagnation_meta["segment"],
        "rebellion_conflict_signature": destruction_pairs[rebellion_idx],
        "rebellion_somatic_segment": rebellion_meta["segment"],
        "rebellion_coefficient": round(rebellion_coeff, 2),
        "heat_ratio": heat_ratio,
        "pillars_resolved": pillars_resolved
    }


def compile_academic_clinical_core(usin_snapshot):
    """
    BLOCK_2A_SUB_2: Переводчик метафизики У-Син в академические медицинские парадигмы.
    """
    u_vec = usin_snapshot["calibrated_vector_shui_mu_huo_tu_jin"]
    heat_ratio = usin_snapshot["heat_ratio"]
    rebellion_coeff = usin_snapshot["rebellion_coefficient"]

    # ИСПРАВЛЕНО: Берём u_vec[0] (Вода), так как u_vec — это теперь список из 5 элементов
    if u_vec[0] < 1.5:
        selye_stage = "СТАДИЯ_3: ИСТОЩЕНИЕ (Коллапс надпочечников / Хроническая ваготония)"
    elif heat_ratio > 1.8 or rebellion_coeff > 3.5:
        selye_stage = "СТАДИЯ_1: ТРЕВОГА (Острая симпатикотония / Адреналиновый овервольтаж)"
    else:
        selye_stage = "СТАДИЯ_2: РЕЗИСТЕНТНОСТЬ (Кортизоловое удержание гомеостаза)"

    return {
        "general_adaptation_syndrome": {
            "stage_resolved": selye_stage,
            "kinetic_heat_ratio": heat_ratio,
            "vegetative_balance_profile": "Симпатикотония" if heat_ratio > 1.0 else "Ваготония"
        },
        "alexithymia_somatization_channels": {
            "stagnation_target_organ": usin_snapshot["stagnation_node_injury"],
            "conflict_destruction_signature": usin_snapshot["rebellion_conflict_signature"],
            "somatic_risk_group_clinical": [
                r for r in [
                    "Ангионевротический спазм сосудов (При застоях Дерева)" if u_vec[1] > 4.0 else None,
                    "Синдром раздраженного кишечника / СРК (При застое Земли)" if u_vec[3] > 4.0 else None,
                    "Респираторный соматоформный синдром (При дефиците Металла)" if u_vec[4] < 1.5 else None,
                    "Нефрогенная лабильность напряжения (При дефиците Воды)" if u_vec[0] < 1.5 else None
                ] if r is not None
            ]
        },
        "anokhin_functional_loops": {
            "disrupted_feedback_loop": f"Ось_Патологии_{usin_snapshot['stagnation_somatic_segment']}",
            "homeostasis_pressure_coefficient": round(float(rebellion_coeff * 0.8), 2)
        }
    }


def log_block_usin_clinical(usin_snapshot, academic_core):
    """
    LOG_BLOCK_2A: Модернизированный консольный визуализатор прикладного анализа У-Син,
    транзитных клинчей времени и академических медицинских мета-инвариантов.
    """
    print("\n" + "="*75)
    print(" БЛОК 2A: ВОСТОЧНАЯ МЕТАФИЗИКА У-СИН, ТРАНЗИТЫ И КЛИНИЧЕСКАЯ ПСИХОСОМАТИКА ")
    print("="*75)
    
    # 1. Вывод разрешенных Астрономических Столпов Ба-Цзы (Натал)
    print("\n[1.1] НАТАЛЬНЫЕ АСТРОНОМИЧЕСКИЕ СТОЛПЫ (СУБЪЕКТ):")
    for pillar, name in usin_snapshot["pillars_resolved"].items():
        print(f"  • Натальный Столп {pillar.capitalize():<6}: {name}")
        
    # 1.2. НОВОЕ: Вывод динамических транзитных столпов времени
    if "transit_pillars_resolved" in usin_snapshot:
        print("\n[1.2] ДИНАМИЧЕСКИЕ ТРАНЗИТНЫЕ СТОЛПЫ ВРЕМЕНИ (ТЕКУЩИЙ СРЕЗ):")
        for pillar, name in usin_snapshot["transit_pillars_resolved"].items():
            print(f"  • Транзитный Столп {pillar.capitalize():<5}: {name}")

    # 2. Вывод калиброванного вектора стихий с учетом Скрытых Стволов (Натал)
    print("\n[2] КАЛИБРОВАННЫЙ БАЛАНС СТИХИЙ С УЧЕТОМ СКРЫТЫХ СТВОЛОВ (ЦАН ГАНЬ):")
    v = usin_snapshot["calibrated_vector_shui_mu_huo_tu_jin"]
    print(f"  • Вода (Shui): {v[0]:<5} | Дерево (Mu): {v[1]:<5} | Огонь (Huo): {v[2]}")
    print(f"  • Земля (Tu): {v[3]:<5} | Металл (Jin): {v[4]}")
    print(f"  • Тепловой коэффициент (Ян/Инь): {usin_snapshot['heat_ratio']}")

    # 3. Деструктивные паттерны и соматика Райха
    print("\n[3] ДЕСТРУКТИВНЫЕ ЭНЕРГЕТИЧЕСКИЕ ПЕТЛИ И СОМАТИКА РАЙХА:")
    print(f"  • Обрыв цепи СОЗИДАНИЯ  : Застой в органе {usin_snapshot['stagnation_node_injury']}")
    print(f"    └── Проекция зажима   : {usin_snapshot['stagnation_somatic_segment'].upper()}")
    print(f"  • Критический БУНТ стихий: {usin_snapshot['rebellion_conflict_signature']}")
    print(f"    ├── Проекция зажима   : {usin_snapshot['rebellion_somatic_segment'].upper()}")
    print(f"    └── Индекс давления   : {usin_snapshot['rebellion_coefficient']}")

    # 4. Академическая медицина Ганса Селье и Анохина
    print("\n[4] АКАДЕМИЧЕСКИЙ БИО-КЛИНИЧЕСКИЙ ПАСПОРТ:")
    gas = academic_core["general_adaptation_syndrome"]
    alex = academic_core["alexithymia_somatization_channels"]
    anokhin = academic_core["anokhin_functional_loops"]
    print(f"  • Синдром Селье : {gas['stage_resolved']}")
    print(f"  • Вегетативный тон: {gas['vegetative_balance_profile']}")
    print(f"  • Петля Анохина   : {anokhin['disrupted_feedback_loop']}")
    print(f"    └── Коэффициент давления на гомеостаз: {anokhin['homeostasis_pressure_coefficient']}")

    # 5. Группы клинического риска
    print("\n[5] ВЕРИФИЦИРОВАННЫЕ КЛИНИЧЕСКИЕ ГРУППЫ РИСКА (ТОРОНТСКАЯ ШКАЛА TAS):")
    if alex["somatic_risk_group_clinical"]:
        for risk in alex["somatic_risk_group_clinical"]:
            print(f"  [⚠ ВНИМАНИЕ] {risk}")
    else:
        print("  • Системных соматических рисков критического уровня не обнаружено.")
    print("="*75)


# =========================================================================
# МНОГОМЕРНЫЙ МАТРИЧНЫЙ ТЕНЗОР ТРОПИЧЕСКОГО СЕПТЕНЕРА (V6.0_MULTIDIMENSIONAL)
# =========================================================================

TROPICAL_METAPHYSICAL_TENSOR = {
    0: {
        "sign_name": "Aries",
        "element": "FIRE",
        "domiciles": {"day": "Mars", "night": "Mars"},  # Чистая Ян-экспансия
        "exaltation": "Sun",                           # Точка максимального раздувания эго
        "triplicity_rulers": {"day": "Sun", "night": "Jupiter"},
        "terms": [
            {"up_to_deg": 6, "owner": "Jupiter"},
            {"up_to_deg": 12, "owner": "Venus"},
            {"up_to_deg": 20, "owner": "Mercury"},
            {"up_to_deg": 25, "owner": "Mars"},
            {"up_to_deg": 30, "owner": "Saturn"}
        ]
    },
    1: {
        "sign_name": "Taurus",
        "element": "EARTH",
        "domiciles": {"day": "Venus", "night": "Venus"},
        "exaltation": "Moon",                          # Максимальное залипание в комфорт скафандра
        "triplicity_rulers": {"day": "Venus", "night": "Moon"},
        "terms": [
            {"up_to_deg": 8, "owner": "Venus"},
            {"up_to_deg": 14, "owner": "Mercury"},
            {"up_to_deg": 22, "owner": "Jupiter"},
            {"up_to_deg": 26, "owner": "Saturn"},
            {"up_to_deg": 30, "owner": "Mars"}
        ]
    },
    2: {
        "sign_name": "Gemini",
        "element": "AIR",
        "domiciles": {"day": "Mercury", "night": "Mercury"},
        "exaltation": "None",                          # Ум пуст, здесь нет фиксированных пиков
        "triplicity_rulers": {"day": "Saturn", "night": "Mercury"},
        "terms": [
            {"up_to_deg": 6, "owner": "Mercury"},
            {"up_to_deg": 12, "owner": "Jupiter"},
            {"up_to_deg": 17, "owner": "Venus"},
            {"up_to_deg": 24, "owner": "Mars"},
            {"up_to_deg": 30, "owner": "Saturn"}
        ]
    },
    3: {
        "sign_name": "Cancer",
        "element": "WATER",
        "domiciles": {"day": "Moon", "night": "Moon"},
        "exaltation": "Jupiter",                       # Расширение через память чувств и родовой эгрегор
        "triplicity_rulers": {"day": "Venus", "night": "Mars"},
        "terms": [
            {"up_to_deg": 7, "owner": "Mars"},
            {"up_to_deg": 13, "owner": "Venus"},
            {"up_to_deg": 19, "owner": "Mercury"},
            {"up_to_deg": 26, "owner": "Jupiter"},
            {"up_to_deg": 30, "owner": "Saturn"}
        ]
    },
    4: {
        "sign_name": "Leo",
        "element": "FIRE",
        "domiciles": {"day": "Sun", "night": "Sun"},
        "exaltation": "None",
        "triplicity_rulers": {"day": "Sun", "night": "Jupiter"},
        "terms": [
            {"up_to_deg": 6, "owner": "Jupiter"},
            {"up_to_deg": 11, "owner": "Venus"},
            {"up_to_deg": 18, "owner": "Saturn"},
            {"up_to_deg": 24, "owner": "Mercury"},
            {"up_to_deg": 30, "owner": "Mars"}
        ]
    },
    5: {
        "sign_name": "Virgo",
        "element": "EARTH",
        "domiciles": {"day": "Mercury", "night": "Mercury"},
        "exaltation": "Mercury",                       # Абсолютный апофеоз рацио, зацикленный сам на себя
        "triplicity_rulers": {"day": "Venus", "night": "Moon"},
        "terms": [
            {"up_to_deg": 7, "owner": "Mercury"},
            {"up_to_deg": 17, "owner": "Venus"},
            {"up_to_deg": 21, "owner": "Jupiter"},
            {"up_to_deg": 28, "owner": "Mars"},
            {"up_to_deg": 30, "owner": "Saturn"}
        ]
    },
    6: {
        "sign_name": "Libra",
        "element": "AIR",
        "domiciles": {"day": "Venus", "night": "Venus"},
        "exaltation": "Saturn",                        # Сжатие ума до жестких социальных контрактов и оценок
        "triplicity_rulers": {"day": "Saturn", "night": "Mercury"},
        "terms": [
            {"up_to_deg": 6, "owner": "Saturn"},
            {"up_to_deg": 14, "owner": "Mercury"},
            {"up_to_deg": 21, "owner": "Jupiter"},
            {"up_to_deg": 28, "owner": "Venus"},
            {"up_to_deg": 30, "owner": "Mars"}
        ]
    },
    7: {
        "sign_name": "Scorpio",
        "element": "WATER",
        "domiciles": {"day": "Mars", "night": "Mars"},
        "exaltation": "None",
        "triplicity_rulers": {"day": "Venus", "night": "Mars"},
        "terms": [
            {"up_to_deg": 7, "owner": "Mars"},
            {"up_to_deg": 14, "owner": "Jupiter"},
            {"up_to_deg": 21, "owner": "Venus"},
            {"up_to_deg": 27, "owner": "Mercury"},
            {"up_to_deg": 30, "owner": "Saturn"}
        ]
    },
    8: {
        "sign_name": "Sagittarius",
        "element": "FIRE",
        "domiciles": {"day": "Jupiter", "night": "Jupiter"},
        "exaltation": "None",
        "triplicity_rulers": {"day": "Sun", "night": "Jupiter"},
        "terms": [
            {"up_to_deg": 12, "owner": "Jupiter"},
            {"up_to_deg": 17, "owner": "Venus"},
            {"up_to_deg": 21, "owner": "Mercury"},
            {"up_to_deg": 26, "owner": "Saturn"},
            {"up_to_deg": 30, "owner": "Mars"}
        ]
    },
    9: {
        "sign_name": "Capricorn",
        "element": "EARTH",
        "domiciles": {"day": "Saturn", "night": "Saturn"},
        "exaltation": "Mars",                          # Высшее натяжение воли, запертое внутри жестких дедлайнов
        "triplicity_rulers": {"day": "Venus", "night": "Moon"},
        "terms": [
            {"up_to_deg": 7, "owner": "Mercury"},
            {"up_to_deg": 14, "owner": "Jupiter"},
            {"up_to_deg": 22, "owner": "Venus"},
            {"up_to_deg": 26, "owner": "Saturn"},
            {"up_to_deg": 30, "owner": "Mars"}
        ]
    },
    10: {
        "sign_name": "Aquarius",
        "element": "AIR",
        "domiciles": {"day": "Saturn", "night": "Saturn"},
        "exaltation": "None",
        "triplicity_rulers": {"day": "Saturn", "night": "Mercury"},
        "terms": [
            {"up_to_deg": 7, "owner": "Mercury"},
            {"up_to_deg": 13, "owner": "Venus"},
            {"up_to_deg": 20, "owner": "Jupiter"},
            {"up_to_deg": 25, "owner": "Mars"},
            {"up_to_deg": 30, "owner": "Saturn"}
        ]
    },
    11: {
        "sign_name": "Pisces",
        "element": "WATER",
        "domiciles": {"day": "Jupiter", "night": "Jupiter"},
        "exaltation": "Venus",                         # Абсолютное растворение в иллюзии чувств и трансовых состояний
        "triplicity_rulers": {"day": "Venus", "night": "Mars"},
        "terms": [
            {"up_to_deg": 12, "owner": "Venus"},
            {"up_to_deg": 16, "owner": "Jupiter"},
            {"up_to_deg": 19, "owner": "Mercury"},
            {"up_to_deg": 28, "owner": "Mars"},
            {"up_to_deg": 30, "owner": "Saturn"}
        ]
    }
}

import swisseph as swe
import json

import json
import logging
import swisseph as swe

import json
import logging
import swisseph as swe

def calculate_tropical_natal_and_dispositors(year, month, day, decimal_hour):
    """
    BLOCK_1A_TROPICAL_CORE_V6.14: Монолитный процессор тропического радикса.
    Вшит принудительный расчет суточной скорости (swe.FLG_SPEED) для Септенера.
    Истинная ось Лунных Узлов Раху-Кету рассчитана через прямую оппозицию TRUE_NODE.
    Сохранена оригинальная многомерная рекурсия обхода контуров.
    """
    # Канонический пул расчета (Септенер + Высшие + Истинный Раху)
    # Кету вычисляется автономно от TRUE_NODE во избежание сбоя атрибутов Си-ядра
    PLANETS_MAP = {
        "Sun": swe.SUN,
        "Moon": swe.MOON,
        "Mars": swe.MARS,
        "Mercury": swe.MERCURY,
        "Jupiter": swe.JUPITER,
        "Venus": swe.VENUS,
        "Saturn": swe.SATURN,
        "Rahu": swe.TRUE_NODE
    }

    # Твой оригинальный многомерный матричный тензор термов
    TENSOR = {
        0: {"name": "Aries", "dom": "Mars", "exalt": "Sun", "terms": [(6, "Jupiter"), (12, "Venus"), (20, "Mercury"), (25, "Mars"), (30, "Saturn")]},
        1: {"name": "Taurus", "dom": "Venus", "exalt": "Moon", "terms": [(8, "Venus"), (14, "Mercury"), (22, "Jupiter"), (26, "Saturn"), (30, "Mars")]},
        2: {"name": "Gemini", "dom": "Mercury", "exalt": "None", "terms": [(6, "Mercury"), (12, "Jupiter"), (17, "Venus"), (24, "Mars"), (30, "Saturn")]},
        3: {"name": "Cancer", "dom": "Moon", "exalt": "Jupiter", "terms": [(7, "Mars"), (13, "Venus"), (19, "Mercury"), (26, "Jupiter"), (30, "Saturn")]},
        4: {"name": "Leo", "dom": "Sun", "exalt": "None", "terms": [(6, "Jupiter"), (11, "Venus"), (18, "Saturn"), (24, "Mercury"), (30, "Mars")]},
        5: {"name": "Virgo", "dom": "Mercury", "exalt": "Mercury", "terms": [(7, "Mercury"), (17, "Venus"), (21, "Jupiter"), (28, "Mars"), (30, "Saturn")]},
        6: {"name": "Libra", "dom": "Venus", "exalt": "Saturn", "terms": [(6, "Saturn"), (14, "Mercury"), (21, "Jupiter"), (28, "Venus"), (30, "Mars")]},
        7: {"name": "Scorpio", "dom": "Mars", "exalt": "None", "terms": [(7, "Mars"), (14, "Jupiter"), (21, "Venus"), (27, "Mercury"), (30, "Saturn")]},
        8: {"name": "Sagittarius", "dom": "Jupiter", "exalt": "None", "terms": [(12, "Jupiter"), (17, "Venus"), (21, "Mercury"), (26, "Saturn"), (30, "Mars")]},
        9: {"name": "Capricorn", "dom": "Saturn", "exalt": "Mars", "terms": [(7, "Mercury"), (14, "Jupiter"), (22, "Venus"), (26, "Saturn"), (30, "Mars")]},
        10: {"name": "Aquarius", "dom": "Saturn", "exalt": "None", "terms": [(7, "Mercury"), (13, "Venus"), (20, "Jupiter"), (25, "Mars"), (30, "Saturn")]},
        11: {"name": "Pisces", "dom": "Jupiter", "exalt": "Venus", "terms": [(12, "Venus"), (16, "Jupiter"), (19, "Mercury"), (28, "Mars"), (30, "Saturn")]}
    }

    # Григорианская конвертация в Юлианский день
    julian_day = swe.julday(year, month, day, decimal_hour, swe.GREG_CAL)

    natal_coordinates = {}
    directed_graph_edges = {
        "domiciles": {},
        "exaltations": {},
        "terms": {}
    }

    # Шаг 1: Астрономический расчет долготы, истинной скорости и многомерный маппинг
    for p_name, swe_id in PLANETS_MAP.items():
        with SWE_LOCK:  # Твой глобальный мьютекс защиты Си-ядра
            planet_data_tuple, active_flags = swe.calc_ut(julian_day, swe_id, swe.FLG_SPEED) 
            
        long_deg = float(planet_data_tuple[0]) 
        longitude_speed = float(planet_data_tuple[3]) 
        is_retrograde = bool(longitude_speed < 0.0)
        
        zodiac_id = int(long_deg // 30.0)
        if zodiac_id > 11: zodiac_id = 11
        in_sign_deg = long_deg % 30.0
        sign_meta = TENSOR[zodiac_id]
        
        natal_coordinates[p_name] = {
            "absolute_longitude": round(long_deg, 5),
            "zodiac_sign": sign_meta["name"],
            "sign_degree": round(in_sign_deg, 3),
            "longitude_speed": round(longitude_speed, 5), 
            "is_retrograde": is_retrograde
        }
        
        directed_graph_edges["domiciles"][p_name] = sign_meta["dom"]
        directed_graph_edges["exaltations"][p_name] = sign_meta["exalt"]
        
        term_owner = "Saturn"
        for up_deg, owner in sign_meta["terms"]:
            if in_sign_deg <= up_deg:
                term_owner = owner
                break
        directed_graph_edges["terms"][p_name] = term_owner

    # === АВТОНОМНЫЙ РАСЧЕТ КЕТУ (Строгая геометрическая оппозиция Истинного Раху) ===
    rahu_abs = natal_coordinates["Rahu"]["absolute_longitude"]
    rahu_speed = natal_coordinates["Rahu"]["longitude_speed"]
    
    ketu_abs = (rahu_abs + 180.0) % 360.0
    ketu_zodiac_id = int(ketu_abs // 30.0)
    if ketu_zodiac_id > 11: ketu_zodiac_id = 11
    ketu_in_sign_deg = ketu_abs % 30.0
    ketu_sign_meta = TENSOR[ketu_zodiac_id]
    
    natal_coordinates["Ketu"] = {
        "absolute_longitude": round(ketu_abs, 5),
        "zodiac_sign": ketu_sign_meta["name"],
        "sign_degree": round(ketu_in_sign_deg, 3),
        "longitude_speed": round(rahu_speed, 5), # Скорость Кету зеркальна скорости Раху
        "is_retrograde": True
    }
    
    directed_graph_edges["domiciles"]["Ketu"] = ketu_sign_meta["dom"]
    directed_graph_edges["exaltations"]["Ketu"] = ketu_sign_meta["exalt"]
    
    ketu_term_owner = "Saturn"
    for up_deg, owner in ketu_sign_meta["terms"]:
        if ketu_in_sign_deg <= up_deg:
            ketu_term_owner = owner
            break
    directed_graph_edges["terms"]["Ketu"] = ketu_term_owner
    # === КОНЕЦ БЛОКА КЕТУ ===

    # Шаг 2: Твой оригинальный рекурсивный обход графа до Конечных Аттракторов
    def find_ultimate_attractor(planet, current_contour, history=None):
        if history is None: 
            history = []
        else:
            history = list(history)
            
        next_step = directed_graph_edges[current_contour].get(planet, "None")
        if next_step == "None":
            return {"type": "OPEN_GAP", "node": "None", "path": history}
        if next_step == planet:
            return {"type": "FINAL_AUTOCRAT", "node": planet, "path": history + [planet]}
        if next_step in history:
            loop_idx = history.index(next_step)
            return {
                "type": "CYCLIC_LOCK_LOOP", 
                "node": "-".join(history[loop_idx:] + [next_step]), 
                "path": history + [next_step]
            }
        history.append(planet)
        return find_ultimate_attractor(next_step, current_contour, history)

    ultimate_report = {}
    # Спектр планет для обхода расширен до 9 тел (Септенер + Раху + Кету)
    all_computed_planets = list(PLANETS_MAP.keys()) + ["Ketu"]
    
    for contour in ["domiciles", "exaltations", "terms"]:
        ultimate_report[contour] = {}
        for planet in all_computed_planets:
            ultimate_report[contour][planet] = find_ultimate_attractor(planet, contour, None)

    final_card_rulers = set()
    for planet_res in ultimate_report["domiciles"].values():
        if planet_res["node"] != "None":
            final_card_rulers.add(planet_res["node"])

    return {
        "status": "COMPUTED",
        "julian_day": julian_day,
        "natal_data": natal_coordinates,
        "multidimensional_graph": {
            "raw_edges": directed_graph_edges,
            "resolved_attractors": ultimate_report
        },
        "tradition_diagnostics": {
            "ultimate_card_rulers": list(final_card_rulers),
            "apofatic_instruction": (
                f"Тропический контур верифицирован. Конечные управители эго-скафандра: {list(final_card_rulers)}. "
                "Истинные векторы ретроградности и теневые оси Раху-Кету зафиксированы и очищены от астральной слепоты."
            )
        }
    }

import json

# Константы мажорных натальных аспектов по Генону (Священная Геометрия Чисел)
NATAL_ASPECTS_MATRIX = {
    0.0:   {"name": "CONJUNCTIO", "orbis": 6.0, "desc": "Соединение: Сплавление качеств в едином регистре."},
    60.0:  {"name": "SEXTILES",   "orbis": 4.0, "desc": "Секстиль: Мелкие связующие шестеренки Матрицы."},
    90.0:  {"name": "QUADRATURA", "orbis": 5.0, "desc": "Квадратура: Жесткое Сатурнианское сопротивление формы."},
    120.0: {"name": "TRIGONUM",   "orbis": 5.0, "desc": "Тригон: Иллюзорная проводимость, убаюкивающий гипноз."},
    180.0: {"name": "OPPOSITIO",  "orbis": 6.0, "desc": "Оппозиция: Полярное растяжение между Небом и Землей."}
}

def calculate_natal_stelliums_and_aspects(natal_output):
    """
    BLOCK_1A_GEOMETRY: Вычисляет натальные стеллиумы и геометрические интервалы (аспекты).
    Принимает на вход payload от calculate_tropical_natal_and_dispositors.
    """
    # 1. Безопасно пробиваем структуру входящего payload
    if isinstance(natal_output, dict) and "natal_data" in natal_output:
        n_data = natal_output["natal_data"]
    else:
        n_data = natal_output

    # Собираем пулл планет для анализа (Септенер + Раху + Кету)
    tracked_planets = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu"]
    
    # Инициализируем структуры сбора фактуры
    zodiac_groups = {sign: [] for sign in [
        "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
        "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
    ]}
    
    # 2. ПОИСК СТЕЛЛИУМОВ (Скопление 3 и более планет в одном знаке)
    for p_name in tracked_planets:
        if p_name in n_data:
            sign = n_data[p_name]["zodiac_sign"]
            zodiac_groups[sign].append(p_name)
            
    detected_stelliums = {}
    for sign_name, planets_list in zodiac_groups.items():
        if len(planets_list) >= 3: # Традиционный порог фиксации стеллиума
            detected_stelliums[sign_name] = {
                "planets": planets_list,
                "density_factor": len(planets_list),
                "somatic_risk": "Критическая соматическая перегрузка при транзитных ударах среды."
            }

    # 3. РАСЧЕТ ГЕОМЕТРИЧЕСКИХ ИНТЕРВАЛОВ (Натальные аспекты)
    calculated_aspects = []
    
    # Двойной проход по массиву для вычисления разности дуг между каждой парой планет
    for i in range(len(tracked_planets)):
        for j in range(i + 1, len(tracked_planets)):
            p1 = tracked_planets[i]
            p2 = tracked_planets[j]
            
            if p1 in n_data and p2 in n_data:
                deg1 = n_data[p1]["absolute_longitude"]
                deg2 = n_data[p2]["absolute_longitude"]
                
                # Кратчайшее угловое расстояние на эклиптике (0° - 180°)
                raw_diff = abs(deg1 - deg2) % 360.0
                interval = raw_diff if raw_diff <= 180.0 else 360.0 - raw_diff
                
                # Сверка со справочником аспектных орбит
                for target_angle, meta in NATAL_ASPECTS_MATRIX.items():
                    orbis_diff = abs(interval - target_angle)
                    if orbis_diff <= meta["orbis"]:
                        calculated_aspects.append({
                            "planet_a": p1,
                            "zodiac_a": f"{n_data[p1]['zodiac_sign']} {n_data[p1]['sign_degree']}°",
                            "planet_b": p2,
                            "zodiac_b": f"{n_data[p2]['zodiac_sign']} {n_data[p2]['sign_degree']}°",
                            "interval_deg": round(interval, 4),
                            "aspect": meta["name"],
                            "orbis": round(orbis_diff, 4),
                            "description": meta["desc"]
                        })

    return {
        "stelliums_detected": detected_stelliums,
        "aspects_fact": calculated_aspects
    }


import json

def log_astrological_and_somatic_blocks(block_id, block_title, data_dict):
    """
    ГЕНЕРАЛЬНЫЙ МОДУЛЬ ЛОГИРОВАНИЯ И ВЫВОДА МНОГОМЕРНЫХ АСТРО-СОМАТИЧЕСКИХ СТРУКТУР.
    Визуализирует детерминацию эго, натяжение фасций, аспекты и стеллиумы в консоли бэкенда.
    """
    print(f"\n{'='*95}")
    print(f"[{block_id}] {block_title.upper()}")
    print(f"{'='*95}")
    
    if block_id == "BLOCK_1A_TROPICAL":
        # 1. Твой оригинальный вывод координат Септенера (Расширен до 9 тел за счет Раху/Кету)
        print("\n1. ИСТИННЫЕ ТРОПИЧЕСКИЕ КООРДИНАТЫ СЕПТЕНЕРА (СКАФАНДР ЭГО):")
        print(f"{'-'*85}")
        for planet, coord in data_dict["natal_data"].items():
            motion_marker = "[R]" if coord['is_retrograde'] else "[D]"
            print(f" • {planet:<8} -> {coord['zodiac_sign']:<12} | "
                  f"Градус: {coord['sign_degree']:>6}° | "
                  f"Скорость: {coord['longitude_speed']:>7} | Движение: {motion_marker}")
                  
        # === ВНЕДРЯЕМЫЙ БЛОК А: ВИЗУАЛИЗАЦИЯ НАТАЛЬНЫХ СТЕЛЛИУМОВ ===
        if "stelliums_detected" in data_dict and data_dict["stelliums_detected"]:
            print("\n2. ЗАФИКСИРОВАННЫЕ НАТАЛЬНЫЕ СТЕЛЛИУМЫ (КОНЦЕНТРАЦИЯ АРХОНТОВ):")
            print(f"{'-'*85}")
            for sign, meta in data_dict["stelliums_detected"].items():
                print(f" ⚠️  СКОПЛЕНИЕ В ЗНАКЕ [{sign.upper()}]: Плотность {meta['density_factor']} планет")
                print(f"    Состав узла: {meta['planets']}")
                print(f"    Вектор риска: {meta['somatic_risk']}")
                print(f"{'-'*55}")
                
        # === ВНЕДРЯЕМЫЙ БЛОК Б: ВИЗУАЛИЗАЦИЯ ГЕОМЕТРИЧЕСКИХ ОКОВ (АСПЕКТЫ) ===
        if "aspects_fact" in data_dict and data_dict["aspects_fact"]:
            print("\n3. ГЕОМЕТРИЧЕСКИЕ ИНТЕРВАЛЫ ИНТЕРФЕРЕНЦИИ СЕПТЕНЕРА (АСПЕКТЫ):")
            print(f"{'-'*85}")
            for asp in data_dict["aspects_fact"]:
                print(f" • [{asp['planet_a']}] ({asp['zodiac_a']}) <─── {asp['aspect']} ───> [{asp['planet_b']}] ({asp['zodiac_b']})")
                print(f"   Интервал дуги: {asp['interval_deg']}° | Орбис: {asp['orbis']}° | Свойства: {asp['description']}")
                print(f"{'-'*75}")

        # 4. Твой оригинальный вывод многомерных цепочек управления
        print("\n4. МНОГОМЕРНЫЕ ЦЕПОЧКИ УПРАВЛЕНИЯ (РАЗРЕШЕНИЕ АТТРАКТОРОВ):")
        print(f"{'-'*85}")
        resolved = data_dict["multidimensional_graph"]["resolved_attractors"]
        CONTOURS_META = [
            ("domiciles", "КОНТУР ОБИТЕЛЕЙ (Базовая стратегия Not-Self)"),
            ("exaltations", "КОНТУР ЭКЗАЛЬТАЦИЙ (Точки уязвимости и гордыни)"),
            ("terms", "МИКРО-КОНТУР ТЕРМОВ (Управители вегетативных фасций)")
        ]
        for contour_key, contour_name in CONTOURS_META:
            print(f"\n* {contour_name}:")
            for planet in resolved[contour_key].keys():
                node_data = resolved[contour_key][planet]
                path_str = " -> ".join(node_data["path"])
                print(f" - {planet:<8} подчинен -> {node_data['node']:<22} [Цепь: {path_str}]")
                
        # 5. Твой оригинальный вердикт метафизической экспертизы
        print("\n5. ВЕРДИКТ МЕТАФИЗИЧЕСКОЙ ЭКСПЕРТИЗЫ:")
        print(f"{'-'*85}")
        print(f" Главные узурпаторы воли (Кардинальные Линейные Владыки):")
        print(f" {data_dict['tradition_diagnostics']['ultimate_card_rulers']}")
        print(f"\n Апофатическое предписание:")
        print(f" {data_dict['tradition_diagnostics']['apofatic_instruction']}")
        
    else:
        # Универсальный стандартизированный фолбек под остальные шаги твоего JSON-бэкенда
        print(json.dumps(data_dict, ensure_ascii=False, indent=2))
        
    print(f"{'='*95}\n")


import json

import json

# =========================================================================
# МАТРИЦА АСТРОСОМАТИЧЕСКИХ ВЕСОВ ДЛЯ КОНТУРА ТЕРМОВ (TERM_SOMATIC_MATRIX)
# =========================================================================
# Направление распределения штрафного вольтажа по сегментам панциря Райха:
# Индексы: [0:Глаз, 1:Челюсть, 2:Шея, 3:Грудь, 4:Диафрагма, 5:Живот, 6:Таз] [PDF: 0.1.104]
PLANET_TERM_WEIGHTS = {
    "Sun":     [0.0, 1.0, 0.0, 2.5, 1.5, 0.0, 0.0],  # Сухая Сера [PDF: 0.1.104]
    "Mars":    [0.0, 1.5, 0.0, 2.0, 2.0, 0.0, 0.0],  # Огненный импульс
    "Moon":    [1.5, 0.0, 0.0, 0.0, 1.5, 2.5, 0.0],  # Инь-Ртуть [PDF: 0.1.104]
    "Venus":   [1.0, 0.0, 1.5, 0.0, 1.0, 0.0, 1.5],  # Летучий Воздух [PDF: 0.1.104]
    "Mercury": [1.5, 0.0, 2.0, 0.0, 2.0, 0.0, 0.0],  # Ментальная суета
    "Jupiter": [0.0, 2.0, 1.5, 0.0, 0.0, 2.5, 0.0],  # Расширение Соли [PDF: 0.1.104]
    "Saturn":  [0.0, 2.5, 2.0, 0.0, 0.0, 0.0, 2.5]   # Сатурнианская Соль [PDF: 0.1.104]
}

def validate_and_apply_tropical_astrosomatic_stents(natal_payload, open_centers, defined_centers, tsp_modifiers):
    """
    BLOCK_1E_LAYER_1A_CLEAN: Исправленный транзистор тропического панциря.
    Защищен от unhashable type: 'dict' через явную изоляцию внутренних примитивов.
    """
    resonance_nodes = []
    
    # ИСПРАВЛЕНИЕ: Извлекаем вложенные словари ЗАРАНЕЕ, до входа в итератор
    multidim_graph = natal_payload.get("multidimensional_graph", {})
    resolved_attr = multidim_graph.get("resolved_attractors", {})
    tactical_terms_map = resolved_attr.get("terms", {})
    
    # Извлекаем чистые координаты, где лежат флаги ретроградности [PDF: 0.1.86]
    natal_planets_data = natal_payload.get("natal_data", {})
    
    PLANET_MULTIPLIERS = {
        "Sun": 1.0, "Moon": 1.1, "Mars": 1.2, "Mercury": 0.9, "Jupiter": 1.0, "Venus": 1.1, "Saturn": 1.3
    }
    
    # Теперь итератор бежит строго по текстовым ключам (названиям планет)
    for natal_planet, term_meta in tactical_terms_map.items():
        # term_meta — это словарь вида {"type": "...", "node": "Saturn", "path": [...]}
        # Извлекаем ИМЯ планеты-управителя (строку), а не весь объект!
        term_owner = term_meta.get("node", "Saturn")
        
        if term_owner not in PLANET_TERM_WEIGHTS:
            continue
            
        base_weights = PLANET_TERM_WEIGHTS[term_owner]
        multiplier = PLANET_MULTIPLIERS.get(natal_planet, 1.0)
        
        # БЕЗОПАСНОЕ ИЗВЛЕЧЕНИЕ: достаем флаг из натальной геометрии планет
        is_retro = natal_planets_data.get(natal_planet, {}).get("is_retrograde", False)
        
        motion_coefficient = 2.0 if is_retro else 1.0
        modifier_gain = 1.0
        
        # Оценка интерференции Not-Self пустых центров Дизайна [PDF: 0.1.104]
        if natal_planet == "Mercury" and "Ajna" in open_centers:
            modifier_gain *= 1.5  
        elif natal_planet == "Moon" and "Solar_Plexus" in open_centers:
            modifier_gain *= 1.6  
        elif term_owner == "Saturn" and "Throat" in open_centers:
            modifier_gain *= 1.7  
            
        if term_owner in ["Sun", "Mars"] and "Sacral" in defined_centers:
            modifier_gain *= 1.4  
        if term_owner == "Saturn" and "Root" in defined_centers:
            modifier_gain *= 1.5  
            
        final_gain = multiplier * motion_coefficient * modifier_gain
        
        resonance_nodes.append({
            "functional_register": f"TERM_{natal_planet.upper()}_RULED_BY_{term_owner.upper()}",
            "natal_planet": natal_planet,
            "term_owner": term_owner,
            "is_retrograde_tromb": is_retro,
            "calculated_gain": round(final_gain, 2)
        })
        
        # Проводка милливольт по всем 7 вегетативным сегментам [PDF: 0.1.105]
        for s_idx in range(1, 8):
            seg_key = f"segment_{s_idx}"
            tsp_modifiers[seg_key] += base_weights[s_idx - 1] * final_gain * 2.0
            
    return resonance_nodes, tsp_modifiers


import swisseph as swe
import json
import datetime

import swisseph as swe
import json
import datetime
import threading

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

SWE_LOCK = threading.Lock()

# =========================================================================
# ВСПOМОГАТЕЛЬНЫЕ МЕТАФИЗИЧЕСКИЕ АТЛАСЫ РАЗОТОЖДЕСТВЛЕНИЯ
# =========================================================================
CENTER_HIJACK_METAPHYSICS = {
    "Head": {"title": "ВЗЛОМ ТЕМЕННОГО ЦЕНТРА", "apofatic_law": "Внешний космос забивает твой ум чужими вопросами и сомнениями."},
    "Ajna": {"title": "ВЗЛОМ ЦЕНТРА АДЖНИ", "apofatic_law": "Транзит заставляет искать ментальную определенность и фиксироваться на ложных догмах."},
    "Throat": {"title": "ВЗЛОМ ГОРЛОВОГО ЦЕНТРА", "apofatic_law": "Пленение ложным желанием привлечь внимание или говорить ради привлечения взгляда."},
    "G_Center": {"title": "ВЗЛОМ ДЖИ-ЦЕНТРА", "apofatic_law": "Иллюзорная фиксация направления и попытки ума найти свое стабильное 'Я'."},
    "Heart": {"title": "ВЗЛОМ СЕРДЕЧНОГО ЦЕНТРА", "apofatic_law": "Транзитный овервольтаж заставляет тебя доказывать свою ценность и давать обещания."},
    "Sacral": {"title": "ВЗЛОМ САКРАЛЬНОГО МОТОРА", "apofatic_law": "Риск тотального истощения: биоробот пашет на чужой частоте, не зная, когда остановиться."},
    "Splenic": {"title": "ВЗЛОМ СЕЛЕЗЁНОЧНОГО ЦЕНТРА", "apofatic_law": "Риск залипнуть в деструктивные отношения из-за страха потерять иллюзорный комфорт."},
    "Solar_Plexus": {"title": "ВЗЛОМ СОЛНЕЧНОГО СПЛЕТЕНИЯ", "apofatic_law": "Перехват твоей нервной системы чужими драмами и страстями. Тормози эмоции."},
    "Root": {"title": "ВЗЛОМ КОРНЕВОГО МОТОРА", "apofatic_law": "Искусственное давление среды, заставляющее спешить и бежать от стресса Кеномы."}
}

CHANNEL_HIJACK_METAPHYSICS = {
    "64-47": "КАНАЛ АСТРАЛЬНОЙ СУЕТЫ. Космос заставляет прокручивать ментальное кино прошлого.",
    "61-24": "КАНАЛ ЛОЖНОГО ОЗАРЕНИЯ. Ум впадает в ментальную петлю, пытась разгадать 'тайны'.",
    "63-4":  "КАНАЛ ИСКУССТВЕННОГО СОМНЕНИЯ. Транзитный импульс требовать формул и логической правоты.",
    "17-11": "КАНАЛ ПСЕВДО-КОНЦЕПЦИЙ. Риск начать защищать чужие транзитные идеи как свои собственные.",
    "43-23": "КАНАЛ ИЛЛЮЗОРНОГО ГЕНИЯ. Риск начать говорить не к месту, порождая ментальный хаос.",
    "17-62": "КАНАЛ СУХОЙ ДЕТАЛИЗАЦИИ. Транзит заставляет зарываться в бесконечный ИТ-код, теряя Дух.",
    "16-48": "КАНАЛ ЛОЖНОГО МАСТЕРСТВА. Риск броситься в материальный стартап без реального ресурса.",
    "20-57": "КАНАЛ ИНСТИНКТИВНОГО СТРАХА. Ум в моменте пытается выжить, совершая панические действия.",
    "34-57": "КАНАЛ СЛEПОЙ МОЩНОСТИ. Животный импульс выживания, заставляющий тело пахать на износ.",
    "18-58": "КАНАЛ НЕВРОТИЧЕСКОГО СУДА. Транзит заставляет искать дефекты в окружающем мире и критиковать.",
    "28-38": "КАНАЛ СЛЕПОГО БОРЧЕСТВА. Космический вызов воевать ради самого процесса войны без смысла.",
    "32-54": "КАНАЛ ЛОЖНОЙ АМБИЦИИ. Хтонический импульс пробиться по карьерной лестнице любой ценой.",
    "44-26": "КАНАЛ ЭГО-ШУМА. Риск впасть в гордыню, начать врать и продавать ложные обещания.",
    "50-27": "КАНАЛ ГИПЕР-ОПЕКИ. Транзит заставляет тебя брать ответственность за чужие Not-Self.",
    "6-59":  "КАНАЛ ИСКУССТВЕННОЙ СТРАСТИ. Транзитный перехват имитирует пиковую сексуальную близость.",
    "49-19": "КАНАЛ ВЕГЕТАТИВНОЙ ЗАВИСИМОСТИ. Космическое сжатие заставляет цепляться за деструктивные союзы.",
    "37-40": "КАНАЛ ЛОЖНОЙ СДЕЛКИ. Риск заключить кабальный контракт под воздействием астральной среды.",
    "36-35": "КАНАЛ ХАОТИЧЕСКОГО КАТАРСИСА. Тяга броситься в новый кризис ради слепого опыта.",
    "22-12": "КАНАЛ ПСЕВДО-МУЗЫКАЛЬНОСТИ. Эмоциональное проявление эго, маскирующееся под благодать.",
    "30-41": "КАНАЛ ХТОНИЧЕСКОГО ЖЕЛАНИЯ. Среда поджигает огонь судорожной жажды пережить то, чего в натале нет.",
    "55-39": "КАНАЛ ИСКУССТВЕННОЙ МЕЛАНХОЛИИ. Транзит погружает химию тела в депрессивный тупик. Тормози.",
    "7-31":  "КАНАЛ ПСЕВДО-ЛИДЕРСТВА. Риск начать вести за собой людей, основываясь на транзитной маске.",
    "1-8":   "КАНАЛ ЛОЖНОГО САМОВЫРАЖЕНИЯ. Попытка привлечь внимание через стиль, обслуживающий Постав.",
    "13-33": "КАНАЛ ЛОЖНОЙ ПАМЯТИ. Риск начать перемалывать чужое прошлое, забыв про свою Пустоту.",
    "15-5":  "КАНАЛ ИСКУССТВЕННОГО РИТМА. Среда навязывает тебе свой деструктивный темп жизни.",
    "46-29": "КАНАЛ ЛОЖНОГО КАТАРСИСА. Риск застрять в обязательствах, которые выжрут твою биоформу.",
    "2-14":  "КАНАЛ ВИРТУАЛЬНОГО БОГАТСТВА. Иллюзия направления. Не инициируй бизнес на этом векторе.",
    "3-60":  "КАНАЛ ИСКУССТВЕННОЙ МУТАЦИИ. Ощущение, что всё застряло, провоцирующее на хаотические шаги.",
    "42-53": "КАНАЛ ИЛЛЮЗОРНОГО СТАРТА. Риск ввязаться в новый процесс, который ты никогда не завершишь.",
    "9-52":  "КАНАЛ ИСКУССТВЕННОЙ КОНЦЕНТРАЦИИ. Фиксация заставляет застревать на несущественных деталях.",
    "34-20": "КАНАЛ ХАОТИЧЕСКОЙ ХАРИЗМЫ. Бешеная активность. Бег на месте внутри клетки Демиурга.",
    "45-21": "КАНАЛ ЛОЖНОГО КОНТРОЛЯ. Среда заставляет доказывать право на собственность и контролировать.",
    "51-25": "КАНАЛ АСТРАЛЬНОГО ШОКА. Транзитный Марс бьет по Сердцу, имитируя духовный прыжок."
}

BRIDGE_GATE_METAPHYSICS = {
    "Hacker_Uranus":  "УРАНИЧЕСКИЙ ВЗЛОМ ВОРОТ [R]. Высший Разрушитель Кали-Юги спровоцировал фасциальный шок и безумное желание разрушить стабильность.",
    "Hacker_Neptune": "НЕПТУНИАНСКИЙ ТУМАН ВОРОТ [R]. Порождает тотальное самообольщение, зависимость и залипание в трансовых концепциях.",
    "Hacker_Pluton":  "ПЛУТОНИЧЕСКИЙ МОЛОТ ВОРОТ [R]. Включает подсознательные страхи смерти, жажду манипулировать или сдаваться в рабство.",
    "Septener":       "ПЛАНЕТАРНЫЙ ПЕРЕХВАТ ВОРОТ. Классическая шестеренка Септенера замкнула мост, заставив проживать Not-Self ложной целостности."
}

# =========================================================================
# СПРАВОЧНИК ОТКРЫТЫХ ТРАНЗИТНЫХ ВОРОТ (SINGLE_GATE_HIJACK_ATLAS)
# =========================================================================
GATE_HIJACK_METAPHYSICS = {
    1: "Ворота 1 (Транзитное Творчество). Среда навязывает иллюзию необходимости быть уникальным и привлекать внимание.",
    2: "Ворота 2 (Ложное Направление). Давление транзита заставляет судорожно искать, куда двигаться в материальном мире.",
    3: "Ворота 3 (Искусственный Хаос). Среда бомбардирует трудностями начала, заставляя эго паниковать перед новизной.",
    4: "Ворота 4 (Суета Формул). Транзитный импульс искать немедленные логические ответы на риторические вопросы.",
    5: "Ворота 5 (Навязанный Ритм). Искусственное давление среды, заставляющее подстраиваться под чужие деструктивные привычки.",
    6: "Ворота 6 (Иллюзия Трения). Провокация на эмоциональные и барьерные конфликты с окружающими проводниками.",
    7: "Ворота 7 (Псевдо-Роль). Ложная потребность возглавить толпу или навязать структуру там, где нет истинного авторитета.",
    8: "Ворота 8 (Суррогат Стиля). Иллюзорное желание демонстрировать себя, заниматься пиаром и обслуживать материальный Постав.",
    9: "Ворота 9 (Ментальная Фокусировка). Среда заставляет тупо застревать на микроскопических, несущественных деталях.",
    10: "Ворота 10 (Иллюзия Поведения). Транзитный перехват заставляет сомневаться в правильности своей фиксации в Кеноме.",
    11: "Ворота 11 (Поток Чужих Идей). Твой ум забивают ментальными образами и идеями, которые не имеют к тебе отношения.",
    12: "Ворота 12 (Ложное Отстранение). Искусственный импульс выразить высокомерие или уйти в эгоистическую изоляцию.",
    13: "Ворота 13 (Чужие Секреты). Среда заставляет тебя собирать и перемалывать чужие наболевшие истории и карму прошлого.",
    14: "Ворота 14 (Иллюзия Ресурса). Навязанная транзитом жажда обладать материальной силой или рабски пахать ради Соли.",
    15: "Ворота 15 (Экстремальный Ритм). Искусственное раздувание крайностей в поведении под воздействием среды.",
    16: "Ворота 16 (Суррогат Мастерства). Иллюзия готового навыка. Риск броситься в авантюру без реальной натальной опоры.",
    17: "Ворота 17 (Ловушка Мнений). Среда заставляет тебя выстраивать жесткие ментальные концепции и доказывать правоту.",
    18: "Ворота 18 (Невротическая Критика). Давление транзита искать ошибки и дефекты в окружающем мире и портить всем кровь.",
    19: "Ворота 19 (Иллюзия Нужды). Искусственное сжатие, провоцирующее дикий страх остаться одному или быть покинутым.",
    20: "Ворота 20 (Поверхностное Присутствие). Вынужденная суета ума в моменте 'сейчас', болтовня ради болтовни.",
    21: "Ворота 21 (Жажда Контроля). Среда заставляет тебя доказывать право на собственность и контролировать близких.",
    22: "Ворота 22 (Эмоциональный Шум). Пленение искусственной драмой, маскирующейся под духовную благодать.",
    23: "Ворота 23 (Ложный Инсайт). Импульс высказать 'уникальное знание' не к месту, порождая лишь ментальный хаос.",
    24: "Ворота 24 (Рационализация Пустоты). Ум впадает в ментальную петлю, пытаясь разгадать тайны шума Кали-Юги.",
    25: "Ворота 25 (Псевдо-Невинность). Ложная претензия на вселенскую любовь при полном отсутствии связи с Принципом.",
    26: "Ворота 26 (Эго-Манипуляция). Временная уловка. Риск впасть в гордыню, начать врать и продавать ложные обещания.",
    27: "Ворота 27 (Ложная Забота). Космос заставляет тебя жертвовать собой ради чужих Not-Self, выжигая свой ресурс.",
    28: "Ворота 28 (Слепое Борчество). Вызов среды провоцирует воевать ради самого процесса войны без всякого смысла.",
    29: "Ворота 29 (Слепое Согласие). Сакрал транзитно соглашается на тяжелый физический труд. Риск застрять в обязательствах.",
    30: "Ворота 30 (Ненасытная Жажда). Среда поджигает в тебе огонь судорожного желания пережить то, чего в натале нет.",
    31: "Ворота 31 (Иллюзия Лидерства). Временный перехват Горла. Попытка влиять на людей через ложную ментальную маску.",
    32: "Ворота 32 (Страх Краха). Космическое давление Сатурна, внушающее панику перед материальной нестабильностью.",
    33: "Ворота 33 (Вынужденные Откровения). Тяга выдать свои тайны или ментальные концепции в профанное пространство.",
    34: "Ворота 34 (Манифестация Робота). Слепая, неосознанная Сакральная активность, обслуживающая материальный Постав.",
    35: "Ворота 35 (Жажда Перемен). Навязанная транзитом скука, толкающая на хаотичный поиск нового материального опыта.",
    36: "Ворота 36 (Кризисный Насос). Сильнейший транзитный удар, тянущий броситься в авантюру ради слепого опыта.",
    37: "Ворота 37 (Ложная Сделка). Риск заключить кабальный контракт или брак под воздействием астральной среды.",
    38: "Ворота 38 (Поиск Врага). Среда провоцирует утяжеление грудного зажима Райха через слепую борьбу с окружением.",
    39: "Ворота 39 (Провокация Духа). Химия тела временно погружается в депрессивный тупик. Не верь этой транзитной химии.",
    40: "Ворота 40 (Иллюзия Независимости). Вынужденное одиночество, рождающее ложное чувство отрезанности от Рода.",
    41: "Ворота 41 (Фантазийный Пожар). Среда затапливает ум нереалистичными мечтами о том, как обустроиться в Кеноме.",
    42: "Ворота 42 (Судорожный Финиш). Ложное желание во что бы то ни стало завершить процесс, даже если он выпивает силы.",
    43: "Ворота 43 (Профанический Инсайт). Астральный взлом имитирует 'уникальное знание', разрушающее ментальную тишину.",
    44: "Ворота 44 (Генетический Страх). Подсознательная паника перед прошлым опытом, блокирующая фасции шеи и челюсти.",
    45: "Ворота 45 (Иллюзия Владения). Среда заставляет доказывать право на собственность и защищать материальные границы.",
    46: "Ворота 46 (Залипание в Биоформу). Ложная фиксация на телесности, физических удовольствиях или спортивном износе.",
    47: "Ворота 47 (Астральный Узел). Космос заставляет прокручивать ментальное кино прошлого, пытаясь найти смысл в пустоте.",
    48: "Ворота 48 (Ложная Глубина). Искусственный импульс доказывать свою экспертность при нативном отсутствии ресурса.",
    49: "Ворота 49 (Племенной Отбор). Вынужденное желание отвергать близких или устраивать революции на основе транзита.",
    50: "Ворота 50 (Цемент Страха). Среда навязывает ложную ответственность за чужие правила игры и догмы в Кеноме.",
    51: "Ворота 51 (Астральный Шок). Транзитный Марс бьет по Сердцу, имитируя псевдо-инициацию и прыжок в неизвестность.",
    52: "Ворота 52 (Зажим Отшельника). Транзитная фиксация Саля заставляет тупо смотреть в одну точку, имитируя покой.",
    53: "Ворота 53 (Ложный Старт). Риск ввязаться в новый процесс под воздействием среды, который ты никогда не завершишь.",
    54: "Ворота 54 (Амбиции Материи). Хтонический импульс пробиться по карьерной лестнице. Сжигание Цзин ради статуса.",
    55: "Ворота 55 (Химическая Волна). Искусственная провокация духа через эмоциональные качели. Наблюдай за химией.",
    56: "Ворота 56 (Стимуляция Рассказами). Ложная тяга отвлекать себя и окружающих байками, концепциями и ИТ-шумом.",
    57: "Ворота 57 (Инстинктивный Удар). Среда включает глубинные страхи за выживание, сковывая шею и челюстной сегмент.",
    58: "Ворота 58 (Неудовлетворенность Рацио). Ложная стимуляция ума искать то, что не работает, вместо созерцания Пустоты.",
    59: "Ворота 59 (Слепой Импульс Сближения). Среда принудительно открывает шлюзы Сакрала ради генетического воспроизводства.",
    60: "Ворота 60 (Оковы Сатурна). Тяжелое чувство ограничения, заставляющее эго биться головой о стены материальной клетки.",
    61: "Ворота 61 (Ментальная Петля). Ум судорожно ищет интеллектуальную определенность в вопросах, лишенных смысла.",
    62: "Ворота 62 (Решетка Архитектора). Среда заставляет зарываться в бесконечные формулы, забывая про чистый Дух.",
    63: "Ворота 63 (Искусственное Сомнение). Перехват ума, заставляющий сомневаться в Традиции и требовать доказательств.",
    64: "Ворота 64 (Суета Прошлого). Навязанный мысленный поток воспоминаний, уводящий сознание из точки Присутствия."
}

def calculate_bodygraph_transits_delta(natal_hd_output_json=None, birth_meta=None, transit_datetime_utc=None):
    """
    ФАЗА 1: Сугубо вычислительный астрономический модуль.
    Рассчитывает точные координаты планет среды и дельту активированных ворот.
    """
    ephe_path = os.environ.get("SWISSEPH_PATH", str(_DEFAULT_EPHE))
    if Path(ephe_path).is_dir():
        swe.set_ephe_path(ephe_path)
    
    # 1. Извлекаем или рассчитываем натальный базис ворот
    if natal_hd_output_json is not None:
        natal_data = json.loads(natal_hd_output_json)
        natal_gates = set()
        for p_key in natal_data["tropical"]["personality_conscious"].keys():
            natal_gates.add(int(natal_data["tropical"]["personality_conscious"][p_key]["gate"]))
        for d_key in natal_data["tropical"]["design_unconscious"].keys():
            natal_gates.add(int(natal_data["tropical"]["design_unconscious"][d_key]["gate"]))
        natal_channels = set(natal_data["tropical"]["ch"].keys())
        natal_defined_centers = set(natal_data["tropical"]["defined_centers"])
    else:
        if birth_meta is None:
            raise ValueError("[ОШИБКА]: Передайте birth_meta для нативного расчета натала")
        # Вызываем вашу оригинальную функцию build_hd_json [PDF: 0.1.98]
        natal_json_str = build_hd_json(birth_meta["year"], birth_meta["month"], birth_meta["day"], birth_meta["decimal_hour"])
        natal_data = json.loads(natal_json_str)
        natal_gates = set()
        for p_key in natal_data["tropical"]["personality_conscious"].keys():
            natal_gates.add(int(natal_data["tropical"]["personality_conscious"][p_key]["gate"]))
        for d_key in natal_data["tropical"]["design_unconscious"].keys():
            natal_gates.add(int(natal_data["tropical"]["design_unconscious"][d_key]["gate"]))
        natal_channels = set(natal_data["tropical"]["ch"].keys())
        natal_defined_centers = set(natal_data["tropical"]["defined_centers"])

    # 2. Таймфрейм среды
    if transit_datetime_utc is None:
        transit_datetime_utc = datetime.datetime.now(datetime.timezone.utc)
        
    t_hour = transit_datetime_utc.hour + (transit_datetime_utc.minute / 60.0) + (transit_datetime_utc.second / 3600.0)
    transit_jd = swe.julday(transit_datetime_utc.year, transit_datetime_utc.month, transit_datetime_utc.day, t_hour) 
    
    TRANSIT_MAP = {
        "Transit_Sun": swe.SUN, "Transit_Moon": swe.MOON, "Transit_Mars": swe.MARS, "Transit_Mercury": swe.MERCURY,
        "Transit_Jupiter": swe.JUPITER, "Transit_Venus": swe.VENUS, "Transit_Saturn": swe.SATURN,
        "Hacker_Uranus": swe.URANUS, "Hacker_Neptune": swe.NEPTUNE, "Hacker_Pluto": swe.PLUTO
    }
    
    transit_coordinates = {}
    transit_gates_map = {}
    
    # Синхронизация через ваш SWE_LOCK [PDF: 0.1.94]
    with SWE_LOCK:
        for p_name, swe_id in TRANSIT_MAP.items():
            res_data, _ = swe.calc_ut(transit_jd, swe_id, swe.FLG_SPEED) 
            lon = float(res_data[0])    # Долгота [PDF: 0.1.95]
            speed = float(res_data[3])  # Скорость по долготе [PDF: 0.1.95]
            
            # Ваша оригинальная формула расчета ворот [PDF: 0.1.95]
            lon_gate = (lon + 2.8125) % 360.0
            g_idx = int(lon_gate // 5.625)
            if g_idx > 63: g_idx = 63
            gate = int(GATES_ORDER[g_idx]) 
            
            transit_coordinates[p_name] = {
                "longitude": round(lon, 4),
                "speed": round(speed, 5),
                "is_retrograde": bool(speed < 0.0),
                "gate": gate
            }
            transit_gates_map[p_name] = gate

    transit_all_gates = set(transit_gates_map.values())
    combined_gates = natal_gates.union(transit_all_gates)
    
    # 3. Перерасчет топологии каналов и центров [PDF: 0.1.94]
    current_active_channels = set()
    current_defined_centers = set()
    
    for ch_name, _ in CHANNEL_CONNECTIONS.items():
        g1_str, g2_str = ch_name.split("-")
        g1, g2 = int(g1_str), int(g2_str)
        if g1 in combined_gates and g2 in combined_gates:
            current_active_channels.add(ch_name)
            c1 = GATE_TO_CENTER.get(g1)
            c2 = GATE_TO_CENTER.get(g2)
            if c1: current_defined_centers.add(c1)
            if c2: current_defined_centers.add(c2)
            
    # Вычисляем чистые математические дельты
    opened_channels = current_active_channels - natal_channels
    opened_gates = transit_all_gates - natal_gates
    falsely_defined_centers = current_defined_centers - natal_defined_centers

    return {
        "transit_time_iso": transit_datetime_utc.isoformat(),
        "natal_gates": list(natal_gates),
        "natal_channels": list(natal_channels),
        "natal_defined_centers": list(natal_defined_centers),
        "transit_gates_map": transit_gates_map,
        "transit_coordinates": transit_coordinates,
        "delta": {
            "opened_gates": list(opened_gates),
            "opened_channels": list(opened_channels),
            "falsely_defined_centers": list(falsely_defined_centers)
        }
    }

def interpret_astral_hijacks_and_bridges(calc_delta_output):
    """
    ФАЗА 2: Интерпретационный над-алгоритмический модуль.
    Привязывает математические дельты к справочникам взлома Not-Self.
    """
    delta = calc_delta_output["delta"]
    opened_gates = set(delta["opened_gates"])
    opened_channels = set(delta["opened_channels"])
    falsely_defined_centers = set(delta["falsely_defined_centers"])
    
    natal_gates = set(calc_delta_output["natal_gates"])
    natal_channels = set(calc_delta_output["natal_channels"])
    transit_gates_map = calc_delta_output["transit_gates_map"]

    # 1. Сборка логов для ЛОЖНЫХ КАНАЛОВ [PDF: 0.1.94]
    channel_hijack_reports = []
    for ch in opened_channels:
        interpretation = CHANNEL_HIJACK_METAPHYSICS.get(ch, "Транзитный перехват магистрали.")
        g1, g2 = map(int, ch.split("-"))
        agents = []
        for p_name, g_id in transit_gates_map.items():
            if g_id in [g1, g2] and g_id not in natal_gates:
                agents.append(f"{p_name} (Ворота {g_id})")
        channel_hijack_reports.append({
            "channel": ch,
            "centers_linked": f"{GATE_TO_CENTER.get(g1)}-{GATE_TO_CENTER.get(g2)}", 
            "breaking_agents": agents,
            "metaphysical_interpretation": interpretation
        })

    # 2. Сборка логов для ТРАНЗИТНЫХ МОСТОВ [PDF: 0.1.94]
    bridge_hijack_reports = []
    for ch_name, _ in CHANNEL_CONNECTIONS.items(): 
        g1, g2 = map(int, ch_name.split("-"))
        is_bridge = False
        bridge_gate = None
        natal_gate = None
        
        if g1 in natal_gates and g2 in opened_gates:
            is_bridge = True; bridge_gate = g2; natal_gate = g1
        elif g2 in natal_gates and g1 in opened_gates:
            is_bridge = True; bridge_gate = g1; natal_gate = g2
            
        if is_bridge and ch_name not in natal_channels:
            for p_name, g_id in transit_gates_map.items():
                if g_id == bridge_gate:
                    raw_law = BRIDGE_GATE_METAPHYSICS.get(p_name, BRIDGE_GATE_METAPHYSICS["Septener"])
                    bridge_hijack_reports.append({
                        "bridge_channel": ch_name,
                        "natal_gate_hook": natal_gate,
                        "transit_gate_bridge": bridge_gate,
                        "hacker_agent": p_name,
                        "metaphysical_law": f"Транзитный мост через {p_name}! {raw_law}"
                    })

    # 3. Сборка логов ИЗОЛИРОВАННЫХ ВОРОТ
    gates_in_structures = set()
    for ch_rep in channel_hijack_reports:
        g1, g2 = map(int, ch_rep["channel"].split("-"))
        gates_in_structures.update([g1, g2])
    for br_rep in bridge_hijack_reports:
        gates_in_structures.add(br_rep["transit_gate_bridge"])
        
    isolated_open_gates = opened_gates - gates_in_structures
    single_gate_reports = []
    for o_gate in isolated_open_gates:
        activating_planet = "Unknown_Graha"
        for p_name, g_id in transit_gates_map.items():
            if g_id == o_gate:
                activating_planet = p_name; break
        gate_law = GATE_HIJACK_METAPHYSICS.get(o_gate, f"Ворота {o_gate}. Фоновое обусловливание.")
        single_gate_reports.append({
            "gate": o_gate,
            "target_center": GATE_TO_CENTER.get(o_gate, "Unknown"), 
            "transit_planet": activating_planet,
            "metaphysical_law": f"Излучатель: {activating_planet} -> {gate_law}"
        })

    # 4. Сборка логов ЦЕНТРОВ
    center_hijack_reports = []
    for center in falsely_defined_centers:
        if center in CENTER_HIJACK_METAPHYSICS:
            center_hijack_reports.append({
                "center": center,
                "title": CENTER_HIJACK_METAPHYSICS[center]["title"],
                "apofatic_law": CENTER_HIJACK_METAPHYSICS[center]["apofatic_law"]
            })

    return {
        "transit_time_utc": calc_delta_output["transit_time_iso"],
        "delta_analysis": calc_delta_output["delta"],
        "channel_hijacks": channel_hijack_reports,
        "bridge_hijacks": bridge_hijack_reports,
        "center_hijacks": center_hijack_reports,
        "single_gate_hijacks": single_gate_reports,
        "apofatic_summary": (
            f"Астральный аудит завершен. Транзит закрасил твои пустые центры {list(falsely_defined_centers)}, "
            f"замкнул {len(opened_channels)} ложных каналов и активировал {len(isolated_open_gates)} ворот. "
            "Это чужеродный космический Постав. Наблюдай за Архитекторами Матрицы."
        )
    }

import json
import logging
import datetime
import pytz
import swisseph as swe

# Массив наименований 12 знаков зодиака для канонического маппинга
ZODIAC_SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
]

# Септенер планет для отслеживания управителей формы
TRADITIONAL_PLANETS = {
    "Sun": swe.SUN, "Moon": swe.MOON, "Mercury": swe.MERCURY, 
    "Venus": swe.VENUS, "Mars": swe.MARS, "Jupiter": swe.JUPITER, "Saturn": swe.SATURN
}
# Высшие хтонические агенты среды
HIGHER_AGENTS = {
    "Uranus": swe.URANUS, "Neptune": swe.NEPTUNE, "Pluto": swe.PLUTO
}

# Матрица мажорных аспектов Септенера
TRADITIONAL_ASPECTS = {
    0.0:   {"name": "CONJUNCTIO", "status": "CLINCH_DEATH", "orbis": 2.5, "desc": "Соединение: Плотное сплавление транзита и натала. Вассальный замок."},
    60.0:  {"name": "SEXTILES",   "status": "OPPORTUNITY_CAGE", "orbis": 1.5, "desc": "Секстиль: Мелкие шестеренки Матрицы, открывающие бытовые привязки."},
    90.0:  {"name": "QUADRATURA", "status": "MATERIAL_CRISIS", "orbis": 2.0, "desc": "Квадратура: Сатурнианский перелом, жесткое сопротивление формы."},
    120.0: {"name": "TRIGONUM",   "status": "ENERGY_FLOW", "orbis": 2.0, "desc": "Тригон: Иллюзорная проводимость, убаюкивающий гипноз ложной Ци."},
    180.0: {"name": "OPPOSITIO",  "status": "POLAR_TENSION", "orbis": 2.5, "desc": "Оппозиция: Растяжение скафандра между полюсами Неба и Земли."}
}

def get_zodiac_position(absolute_longitude):
    """
    Математический маппинг абсолютного градуса эклиптической долготы 
    в 12 знаков зодиака по 30 градусов. Возвращает имя знака и локальный градус.
    """
    norm_lon = absolute_longitude % 360.0
    sign_index = int(norm_lon // 30.0)
    sign_degree = norm_lon % 30.0
    return ZODIAC_SIGNS[sign_index], round(sign_degree, 3)


def get_zodiac_position(absolute_longitude):
    """
    Математический маппинг абсолютного градуса эклиптической долготы 
    в 12 знаков зодиака по 30 градусов.
    """
    norm_lon = absolute_longitude % 360.0
    sign_index = int(norm_lon // 30.0)
    sign_degree = norm_lon % 30.0
    return ZODIAC_SIGNS[sign_index], round(sign_degree, 3)

def fetch_transit_ephemerides_map(jd_transit):
    """
    Вычисляет и фиксирует точные зодиакальные координаты и суточные скорости 
    для полного Септенера, высших планет и истинной оси Лунных Узлов.
    
    Исправлен критический сбой распаковки кортежа swe.TRUE_NODE.
    """
    transit_positions_fact = {}
    all_bodies = {**TRADITIONAL_PLANETS, **HIGHER_AGENTS}
    
    # 1. Расчет материальных физических тел (Септенер + Высшие)
    for p_name, p_id in all_bodies.items():
        with SWE_LOCK:  # Твой глобальный мьютекс защиты Си-расширения swisseph
            swe_output = swe.calc_ut(jd_transit, p_id)
            res_array, _ = swe_output
            abs_lon = res_array[0]     # Индекс 0 = эклиптическая долгота
            lon_speed = res_array[3]   # Индекс 3 = суточная скорость изменения (°/день)
            
        sign_name, sign_deg = get_zodiac_position(abs_lon)
        transit_positions_fact[p_name] = {
            "absolute_longitude": abs_lon,
            "zodiac_sign": sign_name,
            "sign_degree": sign_deg,
            "longitude_speed": round(lon_speed, 4),
            "is_retrograde": lon_speed < 0
        }

    # 2. Исправленное вычисление истинной оси Лунных Узлов (Раху и Кету)
    with SWE_LOCK:
        node_output = swe.calc_ut(jd_transit, swe.TRUE_NODE)
        # ИСПРАВЛЕНИЕ: Распаковываем кортеж Си-ядра на массив и флаг ошибки
        res_array_node, _ = node_output
        
        # Теперь безопасно забираем чистые float значения по индексам
        abs_lon_rahu = res_array_node[0]   # Индекс 0 = эклиптическая долгота Раху
        speed_rahu = res_array_node[3]     # Индекс 3 = суточная скорость Раху
        
    abs_lon_ketu = (abs_lon_rahu + 180.0) % 360.0
    sign_rahu, deg_rahu = get_zodiac_position(abs_lon_rahu)
    sign_ketu, deg_ketu = get_zodiac_position(abs_lon_ketu)
    
    transit_positions_fact["Rahu"] = {
        "absolute_longitude": abs_lon_rahu, "zodiac_sign": sign_rahu, "sign_degree": deg_rahu,
        "longitude_speed": round(speed_rahu, 4), "is_retrograde": True
    }
    transit_positions_fact["Ketu"] = {
        "absolute_longitude": abs_lon_ketu, "zodiac_sign": sign_ketu, "sign_degree": deg_ketu,
        "longitude_speed": round(speed_rahu, 4), "is_retrograde": True
    }

    return transit_positions_fact



TRADITIONAL_ASPECTS = {
    0.0:   {"name": "CONJUNCTIO", "status": "CLINCH_DEATH", "orbis": 2.5, "desc": "Соединение"},
    60.0:  {"name": "SEXTILES",   "status": "OPPORTUNITY_CAGE", "orbis": 1.5, "desc": "Секстиль"},
    90.0:  {"name": "QUADRATURA", "status": "MATERIAL_CRISIS", "orbis": 2.0, "desc": "Квадратура"},
    120.0: {"name": "TRIGONUM",   "status": "ENERGY_FLOW", "orbis": 2.0, "desc": "Тригон"},
    180.0: {"name": "OPPOSITIO",  "status": "POLAR_TENSION", "orbis": 2.5, "desc": "Оппозиция"}
}

def calculate_dynamic_transit_interference(tropical_payload, jd_transit):
    """
    BLOCK_1E_DYNAMIC_TRANSIT: Вычисляет геометрические интервалы, аспекты,
    хтонические пробои высших планет и наложения теневых Лунных Узлов Раху-Кету.
    
    Очищена от вызовов эфемерид. Вызывает fetch_transit_ephemerides_map под капотом.
    """
    if isinstance(tropical_payload, str):
        try: tropical_payload = json.loads(tropical_payload)
        except Exception: pass

    # Универсальный резолвер структуры натала из файла V5.2
    n_data = None
    if isinstance(tropical_payload, dict):
        n_data = tropical_payload.get("natal_data", tropical_payload)
        if isinstance(n_data, str):
            try: n_data = json.loads(n_data)
            except Exception: pass

    if not isinstance(n_data, dict) or "Sun" not in n_data:
        logging.error("[CRITICAL_TRANSIT_RESOVLER_FAIL] Неверная структура натала.")
        return {
            "jd_transit": jd_transit, "transit_positions": {}, "relations_fact": [],
            "wall_breaches_fact": [], "node_clinches": [],
            "somatic_transit_modifiers": {f"segment_{i}": 0.0 for i in range(1, 8)}
        }

    somatic_transit_bus = {f"segment_{i}": 0.0 for i in range(1, 8)}
    
    # Делегируем сбор эфемерид выделенной функции (Шаг 1)
    transit_positions_fact = fetch_transit_ephemerides_map(jd_transit)

    calculated_relations = []
    outer_breaches = []
    node_clinches = []

    # --- СЛОЙ 1: ВЗАИМОДЕЙСТВИЕ ВНУТРИ СЕПТЕНЕРА (Все 7 планет к 7 планетам) ---
    for t_name, t_info in transit_positions_fact.items():
        if t_name not in TRADITIONAL_PLANETS:
            continue
        t_deg = t_info["absolute_longitude"]
        t_speed = t_info["longitude_speed"]
        
        for n_name, n_info in n_data.items():
            if n_name not in TRADITIONAL_PLANETS:
                continue
            n_deg = n_info["absolute_longitude"]
            
            raw_diff = (t_deg - n_deg) % 360.0
            interval = raw_diff if raw_diff <= 180.0 else 360.0 - raw_diff
            
            for aspect_angle, meta in TRADITIONAL_ASPECTS.items():
                orbis_diff = abs(interval - aspect_angle)
                if orbis_diff <= meta["orbis"]:
                    
                    is_direct_direction = (t_deg > n_deg and raw_diff <= 180.0) or (t_deg < n_deg and raw_diff > 180.0)
                    if t_speed > 0:
                        moving_towards = is_direct_direction if interval > aspect_angle else not is_direct_direction
                    else:
                        moving_towards = not is_direct_direction if interval > aspect_angle else is_direct_direction
                        
                    vector_type = "APPLICATIO" if moving_towards else "SEPARATIO"
                    dynamic_multiplier = 1.5 if moving_towards else 0.6
                    if abs(t_speed) < 0.01: dynamic_multiplier *= 2.0

                    calculated_relations.append({
                        "transit_planet": t_name, "transit_speed": t_speed,
                        "transit_zodiac": f"{t_info['zodiac_sign']} {t_info['sign_degree']}°",
                        "natal_planet": n_name, "natal_zodiac": f"{n_info['zodiac_sign']} {n_info['sign_degree']}°",
                        "interval_deg": round(interval, 4), "aspect": meta["name"],
                        "vector": vector_type, "status": meta["status"], "orbis": round(orbis_diff, 4)
                    })
                    
                    if n_name == "Saturn" and meta["name"] in ["CONJUNCTIO", "OPPOSITIO", "QUADRATURA"]:
                        somatic_transit_bus["segment_3"] += 2.0 * dynamic_multiplier
                        somatic_transit_bus["segment_2"] += 1.0 * dynamic_multiplier

    # --- СЛОЙ 2: ХТОНИЧЕСКИЕ ТИСКОВЫЕ АСПЕКТЫ ВЫСШИХ ПЛАНЕТ ПО СЕПТЕНЕРУ ---
    HIGHER_ORBIS_LIMIT = 3.0
    for outer_name in HIGHER_AGENTS.keys():
        t_outer_deg = transit_positions_fact[outer_name]["absolute_longitude"]
        t_outer_speed = transit_positions_fact[outer_name]["longitude_speed"]
        
        for n_name, n_info in n_data.items():
            if n_name not in TRADITIONAL_PLANETS:
                continue
            n_deg = n_info["absolute_longitude"]
            raw_diff = (t_outer_deg - n_deg) % 360.0
            interval = raw_diff if raw_diff <= 180.0 else 360.0 - raw_diff
            
            for aspect_angle, meta in TRADITIONAL_ASPECTS.items():
                if meta["name"] not in ["CONJUNCTIO", "OPPOSITIO", "QUADRATURA"]:
                    continue
                orbis_diff = abs(interval - aspect_angle)
                if orbis_diff <= HIGHER_ORBIS_LIMIT:
                    
                    is_direct_direction = (t_outer_deg > n_deg and raw_diff <= 180.0) or (t_outer_deg < n_deg and raw_diff > 180.0)
                    if t_outer_speed > 0:
                        moving_towards = is_direct_direction if interval > aspect_angle else not is_direct_direction
                    else:
                        moving_towards = not is_direct_direction if interval > aspect_angle else is_direct_direction
                        
                    vector_type = "APPLICATIO" if moving_towards else "SEPARATIO"
                    dynamic_multiplier = 1.6 if moving_towards else 0.7
                    if abs(t_outer_speed) < 0.005: dynamic_multiplier *= 2.0

                    outer_breaches.append({
                        "outer_agent": outer_name, "outer_speed": t_outer_speed,
                        "outer_zodiac": f"{transit_positions_fact[outer_name]['zodiac_sign']} {transit_positions_fact[outer_name]['sign_degree']}°",
                        "target_natal_register": n_name, "natal_zodiac": f"{n_info['zodiac_sign']} {n_info['sign_degree']}°",
                        "interval_deg": round(interval, 4), "aspect": meta["name"],
                        "vector": vector_type, "orbis": round(orbis_diff, 4)
                    })
                    
                    somatic_transit_bus["segment_5"] += 3.0 * dynamic_multiplier
                    somatic_transit_bus["segment_7"] += 4.0 * dynamic_multiplier

    # --- СЛОЙ 3: ПРЯМОЕ НАЛОЖЕНИЕ ТЕНЕВЫХ ЛУННЫХ УЗЛОВ РАХУ И КЕТУ (Орбис 2.0°) ---
    NODE_ORBIS = 2.0
    for t_node in ["Rahu", "Ketu"]:
        t_node_deg = transit_positions_fact[t_node]["absolute_longitude"]
        for n_name, n_info in n_data.items():
            if n_name not in TRADITIONAL_PLANETS:
                continue
            n_deg = n_info["absolute_longitude"]
            
            raw_diff = (t_node_deg - n_deg) % 360.0
            interval = raw_diff if raw_diff <= 180.0 else 360.0 - raw_diff
            
            if interval <= NODE_ORBIS:
                node_clinches.append({
                    "node": t_node, "target_planet": n_name,
                    "zodiac": f"{transit_positions_fact[t_node]['zodiac_sign']} {transit_positions_fact[t_node]['sign_degree']}°",
                    "interval_deg": round(interval, 4)
                })
                
                if t_node == "Rahu":
                    somatic_transit_bus["segment_1"] += 2.0
                    somatic_transit_bus["segment_2"] += 1.5
                else:
                    somatic_transit_bus["segment_5"] += 2.5
                    somatic_transit_bus["segment_7"] += 3.5

    return {
        "jd_transit": jd_transit,
        "transit_positions": transit_positions_fact,
        "relations_fact": calculated_relations,
        "wall_breaches_fact": outer_breaches,
        "node_clinches": node_clinches,
        "somatic_transit_modifiers": somatic_transit_bus
    }





import logging

def log_transit_init(jd_transit):
    """
    Регистрирует фазу инициализации временного слоя.
    Фиксирует вход конвейера бэкенда в зону динамического гипноза среды.
    """
    logging.info(
        f"[PROT_INIT] Запуск транзитного сканера. Потокобезопасная сонастройка эфемерид. "
        f"Текущая временная точка Кеномы (Юлианский день): {jd_transit}"
    )

def log_dispositor_hijack(dispositor_planet, transit_planet, aspect_type):
    """
    Протоколирует вассальный клинч и перехват управления.
    Срабатывает, когда транзитный Архонт блокирует Конечного Натального Диспозитора,
    парализуя волю биоробота и пережимая шейный сегмент панциря Райха (Вишудха).
    """
    logging.warning(
        f"[PROT_HIJACK] ВНИМАНИЕ: Обнаружен перехват Власти над Судьбой. "
        f"Натальный Аттрактор [{dispositor_planet}] жестко заблокирован транзитной силой [{transit_planet}]. "
        f"Тип узурпации: {aspect_type}. Управление вниманием перехвачено внешней матрицей среды."
    )

def log_wall_breach(outer_planet, target_planet, orbis):
    """
    Протоколирует критический прорыв периметра формы.
    Срабатывает, когда высшие хтонические планеты (агенты распада Кали-Юги) 
    бьют по личному Септенеру, запуская спазм диафрагмы и утечку жизненных сил (Цзин) в таз.
    """
    logging.critical(
        f"[PROT_BREACH] КРИТИЧЕСКИЙ СБОЙ: Пробита Великая Стена индивидуального скафандра. "
        f"Хтонический агент распада [{outer_planet}] совершил пробой натального регистра [{target_planet}]. "
        f"Точный зазор интервала дуги (Орбис): {round(orbis, 4)}°. Соматическая система под угрозой декомпрессии."
    )


def log_tropical_transit(transit_result):
    """
    Каноническая функция сквозного логирования динамического гипноза среды.
    Выводит фактуру зодиакальных знаков транзита и натала в терминал.
    """
    log_transit_init(transit_result["jd_transit"])
    
    print("\n" + "="*95)
    print(f" ДИНАМИЧЕСКИЙ ВЕКТОРНЫЙ ПРОТОКОЛ ИНТЕРФЕРЕНЦИИ СРЕДЫ ПО ГЕНОНУ ")
    print(f" Временная точка сканирования (Юлианский день): {transit_result['jd_transit']}")
    print("="*95)
    
    print("\n[СЛОЙ 1] ГЕОМЕТРИЧЕСКИЕ ИНТЕРВАЛЫ И ЗОДИАКАЛЬНЫЕ ОТНОШЕНИЯ СЕПТЕНЕРА:")
    if not transit_result["relations_fact"]:
        print(" -> Системных деформаций Септенера в динамике не обнаружено.")
    else:
        for rel in transit_result["relations_fact"]:
            if rel["natal_planet"] == "Saturn" and rel["aspect"] in ["CONJUNCTIO", "OPPOSITIO", "QUADRATURA"]:
                log_dispositor_hijack(rel["natal_planet"], rel["transit_planet"], f"{rel['aspect']} [{rel['vector']}]")
            
            speed_status = "Ретро" if rel["transit_speed"] < 0 else "Директ"
            if abs(rel["transit_speed"]) < 0.01: speed_status = "СТАЦИОНАР"
            
            print(f" •  Транзитный [{rel['transit_planet']}] в знаке {rel['transit_zodiac']} ({speed_status}, v = {round(rel['transit_speed'], 4)}°/сут)")
            print(f"   ---> Атакует Натальный [{rel['natal_planet']}] в знаке {rel['natal_zodiac']}")
            print(f"   Интервал дуги: {rel['interval_deg']}° | Точный Аспект: {rel['aspect']} (Орбис: {rel['orbis']}°)")
            print(f"   ВЕКТОР ДВИЖЕНИЯ: {rel['vector']} 💥")
            print("-" * 75)
            
    print("\n[СЛОЙ 2] ДИНАМИКА ХТОНИЧЕСКИХ ПРОБОЕВ ВЕЛИКОЙ СТЕНЫ (ВЫСШИЕ ПЛАНЕТЫ):")
    if not transit_result["wall_breaches_fact"]:
        print(" -> Нарушений периметра Великой Стены индивидуального скафандра не зафиксировано.")
    else:
        for breach in transit_result["wall_breaches_fact"]:
            log_wall_breach(breach["outer_agent"], breach["target_natal_register"], breach["interval_deg"])
            print(f" ❌ ДИНАМИЧЕСКИЙ ПРОБОР СРЕДЫ: [{breach['outer_agent']}] в знаке {breach['outer_zodiac']} (v = {round(breach['outer_speed'], 4)}°/сут)")
            print(f"   Пробивает натальный регистр [{breach['target_natal_register']}] в знаке {breach['natal_zodiac']} | Зазор: {breach['interval_deg']}°")
            print(f"   ВЕКТОР УДАРНОЙ ВОЛНЫ: {breach['vector']}")
            print("-" * 75)
            
    print("\n[СЛОЙ 3] ДИНАМИЧЕСКИЕ НАГРУЗКИ НА ШИНУ РАЙХА (мкВ):")
    transit_modifiers = transit_result["somatic_transit_modifiers"]
    for seg, volt in transit_modifiers.items():
        if volt > 0:
            print(f"   + {seg}: {round(volt, 2)} μV [Увеличение натяжения фасций с учетом вектора схождения]")
    print("="*95 + "\n")


import datetime
import pytz
import swisseph as swe

def get_current_jd_transit():
    """
    Вычисляет и возвращает Юлианский день (UT) для текущей секунды 
    системного времени рантайма в зоне UTC.
    
    Служит временным якорем для расчета секундной астральной погоды Кеномы.
    """
    # Гарантированно фиксируем текущее время в абсолютном стандарте UTC
    now_utc = datetime.datetime.now(pytz.utc)
    
    # Переводим компоненты даты и точное время с плавающей точкой в формат Юлианского дня
    # hour + minute/60.0 + second/3600.0 обеспечивает точность до секунды движения эфемерид
    hour_with_decimals = now_utc.hour + (now_utc.minute / 60.0) + (now_utc.second / 3600.0)
    
    # Вызов Си-функции ядра swisseph для генерации Julian Day
    jd_transit = swe.julday(
        now_utc.year, 
        now_utc.month, 
        now_utc.day, 
        hour_with_decimals
    )
    
    return jd_transit


def get_user_ingress_data():
    """
    ПОДФУНКЦИЯ 1: CLI-Интерфейс. Собирает данные, выполняет геокодинг
    и конвертирует локальное время в абсолютный формат UTC с таймзоной.
    """
    city = input("Введите город рождения: ").strip()
    year = int(input("Введите год рождения (ГГГГ): "))
    month = int(input("Введите месяц рождения (ММ): "))
    day = int(input("Введите день рождения (ДД): "))
    hour = int(input("Введите час рождения (0-23): "))
    minute = int(input("Введите минуты рождения (0-59): "))
    target_age = float(input("Введите возраст для расчета кармических циклов (например, 35): "))

    # 1. Геокодирование (Sal-локация)
    geo = get_coordinates(city, is_debug=True)
    if "error" in geo:
        print(f"Ошибка геокодирования: {geo['error']}")
        return None
        
    print(f"Успешно найдено: {geo['display_name']}")
    print(f"Координаты: Лат {geo['latitude']}, Лон {geo['longitude']}")

    # 2. Конвертация локального LMT-времени в UTC с учетом таймзоны
    utc_info = convert_local_time_to_utc(
        year, month, day, hour, minute, 
        geo["latitude"], geo["longitude"], 
        is_debug=True
    )
    
    # Подмешиваем параметры ввода и возраста в общий конфигурационный пакет
    utc_info["target_age"] = target_age
    utc_info["city"] = city
    utc_info["input_year"] = year
    utc_info["input_month"] = month
    utc_info["input_day"] = day
    utc_info["input_hour"] = hour
    utc_info["input_minute"] = minute
    utc_info["geo"] = geo
    return utc_info

def execute_natal_and_transit_layer(utc_info):
    """
    ПОДФУНКЦИЯ 2: Астро-Транзитный Сопроцессор. Расширен геометрией 
    оков (стеллиумы, аспекты Септенера) и секундными транзитами по Генону.
    """
    # 1. Расчет оригинального монолита v6.14 (включая Истинные Раху и Кету)
    tropical_payload = calculate_tropical_natal_and_dispositors(
        year=utc_info["utc_year"], 
        month=utc_info["utc_month"], 
        day=utc_info["utc_day"], 
        decimal_hour=utc_info["utc_hour_float"]
    )
    
    # 2. Изолированный геометрический расчет оков скафандра
    geometry_result = calculate_natal_stelliums_and_aspects(tropical_payload)
    tropical_payload["stelliums_detected"] = geometry_result["stelliums_detected"]
    tropical_payload["aspects_fact"] = geometry_result["aspects_fact"]
    
    # 3. Единый вызов генеральной функции логирования астро-блоков
    log_astrological_and_somatic_blocks(
        block_id="BLOCK_1A_TROPICAL",
        block_title="Канонический многомерный граф тропических управителей Личности и геометрия оков",
        data_dict=tropical_payload
    )
    
    # 4. Расчет динамической транзитной интерференции погоды Кеномы
    jd_now = get_current_jd_transit()
    transit_result = calculate_dynamic_transit_interference(
        tropical_payload=tropical_payload,
        jd_transit=jd_now
    )
    
    # 5. Вынос протокола транзитов в изолированную функцию
    log_tropical_transit(transit_result)
    
    return tropical_payload, transit_result


import datetime
import logging

def _apply_pythagoras_and_matrix_layers(ladini_data, pythagoras_data, age_arcane_data, open_centers, defined_centers, vacuum_gaps, grid_vector, tsp_modifiers, all_resonance_nodes):
    """СЛОЙ 1: Интерференция Вакуумов Пифагора и Масок Пустоты + Матрицы Ладини"""
    # ШАГ 5.1: Вакуумы Пифагора [INDEX: 12]
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
    if grid_vector[-1] >= 3 and "Head" in defined_centers: 
        all_resonance_nodes.append({"register": "PYTHAGORAS_NODE_5", "state": "ACTIVE_SAL_HYPER_COAGULATION [Masseter Lock Bit Active]"})
        tsp_modifiers["segment_2"] += 2.5

    # ШАГ 5.2: Модуляция Возрастного Аркана по Матрице Судьбы [INDEX: 12]
    current_arcane = age_arcane_data["current_year_arcane"]
    if current_arcane == 15 and "Root" in open_centers:
        all_resonance_nodes.append({"register": "AGE_KARMIC_STENT_15", "state": "CRITICAL_SATURN_LOCK [Devil Material Obsession]"})
        tsp_modifiers["segment_5"] *= 1.5
        tsp_modifiers["segment_7"] += 2.8
    if current_arcane == 7 and "G_Center" in defined_centers:
        all_resonance_nodes.append({"register": "AGE_KARMIC_STENT_7", "state": "IDENTITY_SUPER_ALIGNMENT [Chariot Vector Active]"})
        tsp_modifiers["segment_4"] *= 0.5

    # ШАГ 5.3 - 5.7: Последовательные прогоны через транзисторы Октаграммы Ладини [INDEX: 12, 13]
    _, tsp_modifiers = validate_and_apply_heaven_stents(ladini_data, open_centers, defined_centers, tsp_modifiers)
    _, tsp_modifiers = validate_and_apply_earth_stents(ladini_data, open_centers, defined_centers, tsp_modifiers)
    _, tsp_modifiers = validate_and_apply_father_stents(ladini_data, open_centers, defined_centers, tsp_modifiers)
    _, tsp_modifiers = validate_and_apply_mother_stents(ladini_data, open_centers, defined_centers, tsp_modifiers)
    
    nodes_l5, tsp_modifiers = validate_karmic_tail_layer(ladini_data, open_centers, defined_centers, tsp_modifiers)
    all_resonance_nodes.extend(nodes_l5)
    
    _, tsp_modifiers = validate_and_apply_money_stents(ladini_data, open_centers, defined_centers, tsp_modifiers)
    _, tsp_modifiers = validate_and_apply_love_stents(ladini_data, open_centers, defined_centers, tsp_modifiers)
    _, tsp_modifiers = validate_and_apply_destiny_stents(ladini_data, age_arcane_data.get("target_age", 35), tsp_modifiers)


def _apply_chakra_and_transit_layers(ladini_data, hvd_data, tzolkin_data, open_centers, defined_centers, transit_result, tsp_modifiers, all_resonance_nodes):
    """СЛОЙ 2: Энергоемкость чакр ХВД + Впрыск транзитного вольтажа Септенера по Генону"""
    # Расчет базовых стентов Цолькина [INDEX: 13]
    nodes_l10, tsp_modifiers = validate_and_apply_tzolkin_stents(tzolkin_data, hvd_data, open_centers, defined_centers, tsp_modifiers)
    all_resonance_nodes.extend(nodes_l10)

    # ШАГ 5.8: Прямая трансляция Канонической Энергоемкости Чакр ХВД [INDEX: 13]
    chakra_health = ladini_data["chakra_health_matrix"]
    tsp_modifiers["segment_1"] += chakra_health["sahasrara_7"]["total"] * 0.1
    tsp_modifiers["segment_2"] += chakra_health["ajna_6"]["total"] * 0.1
    tsp_modifiers["segment_3"] += chakra_health["vishuddha_5"]["total"] * 0.1
    tsp_modifiers["segment_4"] += chakra_health["anahata_4"]["total"] * 0.1
    tsp_modifiers["segment_5"] += chakra_health["manipura_3"]["total"] * 0.1
    tsp_modifiers["segment_6"] += chakra_health["svadhishthana_2"]["total"] * 0.1
    tsp_modifiers["segment_7"] += chakra_health["muladhara_1"]["total"] * 0.1

    # ШАГ 5.9: Впрыск динамического транзитного вольтажа Септенера по Генону [INDEX: 13]
    transit_modifiers = transit_result["somatic_transit_modifiers"]
    for segment_key in tsp_modifiers.keys():
        tsp_modifiers[segment_key] += transit_modifiers.get(segment_key, 0.0)

# ============================================================================
# BLOCK_1F_USIN_60_JIA_ZI_REGISTER: ПОЛНЫЙ КАНОНИЧЕСКИЙ РЕЕСТР 60 СТОЛПОВ
# ============================================================================
# Каноническая циклическая матрица времени для соматического макро-конвейера.
# Ключ: ID столпа (1-60). 
# Значение: Ствол, Ветвь и их точные энергетические теги У-син.
# ============================================================================

JIA_ZI_60_REGISTER = {
    1:  {"name": "Цзя-Цзы (Деревянная Крыса)",   "stem": "Цзя",  "stem_el": "Дерево", "branch": "Крыса",    "branch_el": "Вода",   "p": "Ян"},
    2:  {"name": "И-Чоу (Деревянный Бык)",       "stem": "И",    "stem_el": "Дерево", "branch": "Бык",      "branch_el": "Земля",  "p": "Инь"},
    3:  {"name": "Бин-Инь (Огненный Тигр)",      "stem": "Бин",  "stem_el": "Огонь",  "branch": "Тигр",     "branch_el": "Дерево", "p": "Ян"},
    4:  {"name": "Дин-Мао (Огненный Кролик)",    "stem": "Дин",  "stem_el": "Огонь",  "branch": "Кролик",   "branch_el": "Дерево", "p": "Инь"},
    5:  {"name": "У-Чэнь (Земляной Дракон)",     "stem": "У",    "stem_el": "Земля",  "branch": "Дракон",   "branch_el": "Земля",  "p": "Ян"},
    6:  {"name": "Цзи-Сы (Земляная Змея)",       "stem": "Цзи",  "stem_el": "Земля",  "branch": "Змея",     "branch_el": "Огонь",  "p": "Инь"},
    7:  {"name": "Гэн-Ву (Металлический Лошадь)","stem": "Гэн",  "stem_el": "Металл", "branch": "Лошадь",   "branch_el": "Огонь",  "p": "Ян"},
    8:  {"name": "Синь-Вэй (Металлическая Коза)","stem": "Синь", "stem_el": "Металл", "branch": "Коза",     "branch_el": "Земля",  "p": "Инь"},
    9:  {"name": "Жэнь-Шэнь (Водная Обезьяна)",  "stem": "Жэнь", "stem_el": "Вода",   "branch": "Обезьяна", "branch_el": "Металл", "p": "Ян"},
    10: {"name": "Квей-Ю (Водный Петух)",        "stem": "Квей", "stem_el": "Вода",   "branch": "Петух",    "branch_el": "Металл", "p": "Инь"},
    
    11: {"name": "Цзя-Сюй (Деревянная Собака)",  "stem": "Цзя",  "stem_el": "Дерево", "branch": "Собака",   "branch_el": "Земля",  "p": "Ян"},
    12: {"name": "И-Хай (Деревянная Свинья)",    "stem": "И",    "stem_el": "Дерево", "branch": "Свинья",    "branch_el": "Вода",   "p": "Инь"},
    13: {"name": "Бин-Цзы (Огненная Крыса)",     "stem": "Бин",  "stem_el": "Огонь",  "branch": "Крыса",    "branch_el": "Вода",   "p": "Ян"},
    14: {"name": "Дин-Чоу (Огненный Бык)",       "stem": "Дин",  "stem_el": "Огонь",  "branch": "Бык",      "branch_el": "Земля",  "p": "Инь"},
    15: {"name": "У-Инь (Земляной Тигр)",        "stem": "У",    "stem_el": "Земля",  "branch": "Тигр",     "branch_el": "Дерево", "p": "Ян"},
    16: {"name": "Цзи-Мао (Земляной Кролик)",    "stem": "Цзи",  "stem_el": "Земля",  "branch": "Кролик",   "branch_el": "Дерево", "p": "Инь"},
    17: {"name": "Гэн-Чэнь (Металлический Дракон)","stem": "Гэн", "stem_el": "Металл", "branch": "Дракон",  "branch_el": "Земля",  "p": "Ян"},
    18: {"name": "Синь-Сы (Металлическая Змея)", "stem": "Синь", "stem_el": "Металл", "branch": "Змея",     "branch_el": "Огонь",  "p": "Инь"},
    19: {"name": "Жэнь-Ву (Водная Лошадь)",      "stem": "Жэнь", "stem_el": "Вода",   "branch": "Лошадь",   "branch_el": "Огонь",  "p": "Ян"},
    20: {"name": "Квей-Вэй (Водная Коза)",       "stem": "Квей", "stem_el": "Вода",   "branch": "Коза",     "branch_el": "Земля",  "p": "Инь"},
    
    21: {"name": "Цзя-Шэнь (Деревянная Обезьяна)","stem": "Цзя", "stem_el": "Дерево", "branch": "Обезьяна", "branch_el": "Металл", "p": "Ян"},
    22: {"name": "И-Ю (Деревянный Петух)",       "stem": "И",    "stem_el": "Дерево", "branch": "Петух",    "branch_el": "Металл", "p": "Инь"},
    23: {"name": "Бин-Сюй (Огненная Собака)",    "stem": "Бин",  "stem_el": "Огонь",  "branch": "Собака",   "branch_el": "Земля",  "p": "Ян"},
    24: {"name": "Дин-Хай (Огненная Свинья)",    "stem": "Дин",  "stem_el": "Огонь",  "branch": "Свинья",    "branch_el": "Вода",   "p": "Инь"},
    25: {"name": "У-Цзы (Земляная Крыса)",       "stem": "У",    "stem_el": "Земля",  "branch": "Крыса",    "branch_el": "Вода",   "p": "Ян"},
    26: {"name": "Цзи-Чоу (Земляной Бык)",       "stem": "Цзи",  "stem_el": "Земля",  "branch": "Бык",      "branch_el": "Земля",  "p": "Инь"},
    27: {"name": "Гэн-Инь (Металлический Тигр)", "stem": "Гэн",  "stem_el": "Металл", "branch": "Тигр",     "branch_el": "Дерево", "p": "Ян"},
    28: {"name": "Синь-Мао (Металлический Кролик)","stem": "Синь","stem_el": "Металл", "branch": "Кролик",  "branch_el": "Дерево", "p": "Инь"},
    29: {"name": "Жэнь-Чэнь (Водный Дракон)",    "stem": "Жэнь", "stem_el": "Вода",   "branch": "Дракон",   "branch_el": "Земля",  "p": "Ян"},
    30: {"name": "Квей-Сы (Водная Змея)",        "stem": "Квей", "stem_el": "Вода",   "branch": "Змея",     "branch_el": "Огонь",  "p": "Инь"},
    
    31: {"name": "Цзя-Ву (Деревянная Лошадь)",   "stem": "Цзя",  "stem_el": "Дерево", "branch": "Лошадь",   "branch_el": "Огонь",  "p": "Ян"},
    32: {"name": "И-Вэй (Деревянная Коза)",       "stem": "И",    "stem_el": "Дерево", "branch": "Коза",     "branch_el": "Земля",  "p": "Инь"},
    33: {"name": "Бин-Шэнь (Огненная Обезьяна)", "stem": "Бин",  "stem_el": "Огонь",  "branch": "Обезьяна", "branch_el": "Металл", "p": "Ян"},
    34: {"name": "Дин-Ю (Огненный Петух)",       "stem": "Дин",  "stem_el": "Огонь",  "branch": "Петух",    "branch_el": "Металл", "p": "Инь"},
    35: {"name": "У-Сюй (Земляная Собака)",      "stem": "У",    "stem_el": "Земля",  "branch": "Собака",   "branch_el": "Земля",  "p": "Ян"},
    36: {"name": "Цзи-Хай (Земляная Свинья)",     "stem": "Цзи",  "stem_el": "Земля",  "branch": "Свинья",    "branch_el": "Вода",   "p": "Инь"},
    37: {"name": "Гэн-Цзы (Металлическая Крыса)", "stem": "Гэн",  "stem_el": "Металл", "branch": "Крыса",    "branch_el": "Вода",   "p": "Ян"},
    38: {"name": "Синь-Чоу (Металлический Бык)",  "stem": "Синь", "stem_el": "Металл", "branch": "Бык",      "branch_el": "Земля",  "p": "Инь"},
    39: {"name": "Жэнь-Инь (Водный Тигр)",       "stem": "Жэнь", "stem_el": "Вода",   "branch": "Тигр",     "branch_el": "Дерево", "p": "Ян"},
    40: {"name": "Квей-Мао (Водный Кролик)",     "stem": "Квей", "stem_el": "Вода",   "branch": "Кролик",   "branch_el": "Дерево", "p": "Инь"},
    
    41: {"name": "Цзя-Чэнь (Деревянный Дракон)", "stem": "Цзя",  "stem_el": "Дерево", "branch": "Дракон",   "branch_el": "Земля",  "p": "Ян"},
    42: {"name": "И-Сы (Деревянная Змея)",       "stem": "И",    "stem_el": "Дерево", "branch": "Змея",     "branch_el": "Огонь",  "p": "Инь"},
    43: {"name": "Бин-Ву (Огненная Лошадь)",     "stem": "Бин",  "stem_el": "Огонь",  "branch": "Лошадь",   "branch_el": "Огонь",  "p": "Ян"},
    44: {"name": "Дин-Вэй (Огненная Коза)",      "stem": "Дин",  "stem_el": "Огонь",  "branch": "Коза",     "branch_el": "Земля",  "p": "Инь"},
    45: {"name": "У-Шэнь (Земляная Обезьяна)",   "stem": "У",    "stem_el": "Земля",  "branch": "Обезьяна", "branch_el": "Металл", "p": "Ян"},
    46: {"name": "Цзи-Ю (Земляной Петух)",       "stem": "Цзи",  "stem_el": "Земля",  "branch": "Петух",    "branch_el": "Металл", "p": "Инь"},
    47: {"name": "Гэн-Сюй (Металлическая Собака)","stem": "Гэн",  "stem_el": "Металл", "branch": "Собака",   "branch_el": "Земля",  "p": "Ян"},
    48: {"name": "Синь-Хай (Металлическая Свинья)","stem": "Синь","stem_el": "Металл", "branch": "Свинья",    "branch_el": "Вода",   "p": "Инь"},
    49: {"name": "Жэнь-Цзы (Водная Крыса)",      "stem": "Жэнь", "stem_el": "Вода",   "branch": "Крыса",    "branch_el": "Вода",   "p": "Ян"},
    50: {"name": "Квей-Чоу (Водный Бык)",        "stem": "Квей", "stem_el": "Вода",   "branch": "Бык",      "branch_el": "Земля",  "p": "Инь"},
    
    51: {"name": "Цзя-Инь (Деревянный Тигр)",    "stem": "Цзя",  "stem_el": "Дерево", "branch": "Тигр",     "branch_el": "Дерево", "p": "Ян"},
    52: {"name": "И-Кролик (Деревянный Кролик)", "stem": "И",    "stem_el": "Дерево", "branch": "Кролик",   "branch_el": "Дерево", "p": "Инь"},
    53: {"name": "Бин-Чэнь (Огненный Дракон)",   "stem": "Бин",  "stem_el": "Огонь",  "branch": "Дракон",   "branch_el": "Земля",  "p": "Ян"},
    54: {"name": "Дин-Сы (Огненная Змея)",       "stem": "Дин",  "stem_el": "Огонь",  "branch": "Змея",     "branch_el": "Огонь",  "p": "Инь"},
    55: {"name": "У-Ву (Земляная Лошадь)",       "stem": "У",    "stem_el": "Земля",  "branch": "Лошадь",   "branch_el": "Огонь",  "p": "Ян"},
    56: {"name": "Цзи-Вэй (Земляная Коза)",      "stem": "Цзи",  "stem_el": "Земля",  "branch": "Коза",     "branch_el": "Земля",  "p": "Инь"},
    57: {"name": "Гэн-Шэнь (Металлическая Обезьяна)","stem": "Гэн","stem_el": "Металл","branch": "Обезьяна","branch_el": "Металл", "p": "Ян"},
    58: {"name": "Синь-Ю (Металлический Петух)", "stem": "Синь", "stem_el": "Металл", "branch": "Петух",    "branch_el": "Металл", "p": "Инь"},
    59: {"name": "Жэнь-Сюй (Водная Собака)",     "stem": "Жэнь", "stem_el": "Вода",   "branch": "Собака",   "branch_el": "Земля",  "p": "Ян"},
    60: {"name": "Квей-Хай (Водная Свинья)",     "stem": "Квей", "stem_el": "Вода",   "branch": "Свинья",    "branch_el": "Вода",   "p": "Инь"}
}

# ============================================================================
# BLOCK_1F_USIN_BRANCH_CLASHES: МАТРИЦА 6 СТОЛКНОВЕНИЙ ВЕТВЕЙ (СУЧЕ)
# ============================================================================
# Адаптировано под шину натяжения Райха (7-сегментная топология).
# Индексы somatic_modifiers: [Глаз, Челюсть, Шея, Грудь, Диафрагма, Живот, Таз]
# ============================================================================

BRANCH_CLASHES_MATRIX = {
    # 1. КРЫСА — ЛОШАДЬ (Взрывное столкновение Воды и Огня)
    # Шок по оси Вода-Огонь: мгновенный зажим диафрагмы (страх) и таза (Муладхара)
    ("Крыса", "Лошадь"): {
        "name": "CLASH_RAT_HORSE_AXIS",
        "alchemical_phase": "CALCINATIO_CRISIS",
        "somatic_modifiers": {"segment_1": 1.0, "segment_2": 2.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 3.5, "segment_6": 0.0, "segment_7": 2.5}
    },
    ("Лошадь", "Крыса"): {
        "name": "CLASH_RAT_HORSE_AXIS",
        "alchemical_phase": "CALCINATIO_CRISIS",
        "somatic_modifiers": {"segment_1": 1.0, "segment_2": 2.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 3.5, "segment_6": 0.0, "segment_7": 2.5}
    },

    # 2. ТИГР — ОБЕЗЬЯНА (Борьба Дерева и Металла / Травматическая ось)
    # Рубка структуры: сильное напряжение челюстного аппарата (агрессия) и шеи
    ("Тигр", "Обезьяна"): {
        "name": "CLASH_TIGER_MONKEY_AXIS",
        "alchemical_phase": "MORTIFICATIO_SHOCK",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 3.5, "segment_3": 2.5, "segment_4": 1.5, "segment_5": 0.0, "segment_6": 0.0, "segment_7": 0.0}
    },
    ("Обезьяна", "Тигр"): {
        "name": "CLASH_TIGER_MONKEY_AXIS",
        "alchemical_phase": "MORTIFICATIO_SHOCK",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 3.5, "segment_3": 2.5, "segment_4": 1.5, "segment_5": 0.0, "segment_6": 0.0, "segment_7": 0.0}
    },

    # 3. КРОЛИК — ПЕТУХ (Столкновение Инь-Металла и Инь-Дерева)
    # Внутренний раскол: бьет по горлу (невысказанность) и грудному сегменту (Анахата)
    ("Кролик", "Петух"): {
        "name": "CLASH_RABBIT_ROOSTER_AXIS",
        "alchemical_phase": "DISTILLATIO_CRISIS",
        "somatic_modifiers": {"segment_1": 0.5, "segment_2": 0.0, "segment_3": 3.0, "segment_4": 2.5, "segment_5": 1.0, "segment_6": 0.0, "segment_7": 0.0}
    },
    ("Петух", "Кролик"): {
        "name": "CLASH_RABBIT_ROOSTER_AXIS",
        "alchemical_phase": "DISTILLATIO_CRISIS",
        "somatic_modifiers": {"segment_1": 0.5, "segment_2": 0.0, "segment_3": 3.0, "segment_4": 2.5, "segment_5": 1.0, "segment_6": 0.0, "segment_7": 0.0}
    },

    # 4. БЫК — КОЗА (Столкновение Инь-Земли / Конфликт Хранилищ)
    # Тяжелая цементация: тотальный зажим брюшного сегмента (ЖКТ) и застой жидкостей
    ("Бык", "Коза"): {
        "name": "CLASH_OX_GOAT_AXIS",
        "alchemical_phase": "FIXATIO_DEADLOCK",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.5, "segment_3": 1.5, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 3.5, "segment_7": 1.5}
    },
    ("Коза", "Бык"): {
        "name": "CLASH_OX_GOAT_AXIS",
        "alchemical_phase": "FIXATIO_DEADLOCK",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.5, "segment_3": 1.5, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 3.5, "segment_7": 1.5}
    },

    # 5. ДРАКОН — СОБАКА (Столкновение Ян-Земли / Территориальный конфликт)
    # Жесткий прессинг: блокировка тазового сегмента и зажим челюсти/массетеров
    ("Дракон", "Собака"): {
        "name": "CLASH_DRAGON_DOG_AXIS",
        "alchemical_phase": "SAL_COMPRESSION",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 2.5, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 1.5, "segment_6": 1.0, "segment_7": 3.0}
    },
    ("Собака", "Дракон"): {
        "name": "CLASH_DRAGON_DOG_AXIS",
        "alchemical_phase": "SAL_COMPRESSION",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 2.5, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 1.5, "segment_6": 1.0, "segment_7": 3.0}
    },

    # 6. ЗМЕЯ — СВИНЬЯ (Столкновение Ян-Огня и Ян-Воды)
    # Психосоматическая аритмия: сильный пробой груди (сердце) и зажим глазного регистра
    ("Змея", "Свинья"): {
        "name": "CLASH_SNAKE_PIG_AXIS",
        "alchemical_phase": "MERCURIUS_CHAOS",
        "somatic_modifiers": {"segment_1": 2.5, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 3.0, "segment_5": 1.5, "segment_6": 0.0, "segment_7": 0.0}
    },
    ("Свинья", "Змея"): {
        "name": "CLASH_SNAKE_PIG_AXIS",
        "alchemical_phase": "MERCURIUS_CHAOS",
        "somatic_modifiers": {"segment_1": 2.5, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 3.0, "segment_5": 1.5, "segment_6": 0.0, "segment_7": 0.0}
    }
}

# ============================================================================
# BLOCK_1F_USIN_BRANCH_COMBINATIONS: МАТРИЦА 6 СЛИЯНИЙ ВЕТВЕЙ (ЛЮ-ХЭ)
# ============================================================================
# Интегрировано в шину Райха. Отрицательные значения снимают мышечные блоки.
# Индексы somatic_modifiers: [Глаз, Челюсть, Шея, Грудь, Диафрагма, Живот, Таз]
# ============================================================================

BRANCH_COMBINATIONS_MATRIX = {
    # 1. ТИГР + СВИНЬЯ (Слияние в Дерево)
    # Питание структуры: расслабление челюстного сжатия и раскрытие диафрагмы
    ("Тигр", "Свинья"): {
        "name": "UNION_TIGER_PIG_WOOD",
        "alchemical_phase": "PERFECT_CONJUNCTIO_WOOD",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": -2.0, "segment_3": -1.0, "segment_4": 0.0, "segment_5": -1.5, "segment_6": 0.0, "segment_7": 0.0}
    },
    ("Свинья", "Тигр"): {
        "name": "UNION_TIGER_PIG_WOOD",
        "alchemical_phase": "PERFECT_CONJUNCTIO_WOOD",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": -2.0, "segment_3": -1.0, "segment_4": 0.0, "segment_5": -1.5, "segment_6": 0.0, "segment_7": 0.0}
    },

    # 2. КРЫСА + БЫК (Слияние в Землю)
    # Цементация и заземление: сильное расслабление брюшного сегмента (ЖКТ) и таза
    ("Крыса", "Бык"): {
        "name": "UNION_RAT_OX_EARTH",
        "alchemical_phase": "PERFECT_COAGULATIO_EARTH",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": -1.0, "segment_6": -2.5, "segment_7": -2.0}
    },
    ("Бык", "Крыса"): {
        "name": "UNION_RAT_OX_EARTH",
        "alchemical_phase": "PERFECT_COAGULATIO_EARTH",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": -1.0, "segment_6": -2.5, "segment_7": -2.0}
    },

    # 3. КРОЛИК + СОБАКА (Слияние в Огонь)
    # Детонация тепла: расширение и расслабление грудного сегмента (Анахата), снятие блоков
    ("Кролик", "Собака"): {
        "name": "UNION_RABBIT_DOG_FIRE",
        "alchemical_phase": "CALCINATIO_RELAX",
        "somatic_modifiers": {"segment_1": -1.0, "segment_2": 0.0, "segment_3": -0.5, "segment_4": -3.0, "segment_5": 0.0, "segment_6": 0.0, "segment_7": -1.0}
    },
    ("Собака", "Кролик"): {
        "name": "UNION_RABBIT_DOG_FIRE",
        "alchemical_phase": "CALCINATIO_RELAX",
        "somatic_modifiers": {"segment_1": -1.0, "segment_2": 0.0, "segment_3": -0.5, "segment_4": -3.0, "segment_5": 0.0, "segment_6": 0.0, "segment_7": -1.0}
    },

    # 4. ДРАКОН + ПЕТУХ (Слияние в Металл)
    # Структурирование ума: снятие напряжения с шеи и челюсти, глубокий покой глазного фильтра
    ("Дракон", "Петух"): {
        "name": "UNION_DRAGON_ROOSTER_METAL",
        "alchemical_phase": "FIXATIO_HARMONY",
        "somatic_modifiers": {"segment_1": -1.5, "segment_2": -1.5, "segment_3": -2.5, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 0.0, "segment_7": 0.0}
    },
    ("Петух", "Дракон"): {
        "name": "UNION_DRAGON_ROOSTER_METAL",
        "alchemical_phase": "FIXATIO_HARMONY",
        "somatic_modifiers": {"segment_1": -1.5, "segment_2": -1.5, "segment_3": -2.5, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 0.0, "segment_7": 0.0}
    },

    # 5. ЗМЕЯ + ОБЕЗЬЯНА (Слияние в Воду / Скрытый конфликт)
    # Текучесть: мягкое дренирование жидкостей, расслабление тазового дна и шеи
    ("Змея", "Обезьяна"): {
        "name": "UNION_SNAKE_MONKEY_WATER",
        "alchemical_phase": "SOLUTIO_FLOW",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": -1.5, "segment_4": -1.0, "segment_5": 0.0, "segment_6": -1.0, "segment_7": -2.0}
    },
    ("Обезьяна", "Змея"): {
        "name": "UNION_SNAKE_MONKEY_WATER",
        "alchemical_phase": "SOLUTIO_FLOW",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": -1.5, "segment_4": -1.0, "segment_5": 0.0, "segment_6": -1.0, "segment_7": -2.0}
    },

    # 6. ЛОШАДЬ + КОЗА (Слияние в Огонь / Землю / Чистый свет)
    # Баланс Сердца: тотальное центрирование диафрагмы, снятие висцеральных спазмов в животе
    ("Лошадь", "Коза"): {
        "name": "UNION_HORSE_GOAT_LIGHT",
        "alchemical_phase": "UNIO_MYSTICA_RELAX",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": -1.0, "segment_3": 0.0, "segment_4": -1.0, "segment_5": -2.5, "segment_6": -2.0, "segment_7": 0.0}
    },
    ("Коза", "Лошадь"): {
        "name": "UNION_HORSE_GOAT_LIGHT",
        "alchemical_phase": "UNIO_MYSTICA_RELAX",
        "somatic_modifiers": {"segment_1": 0.0, "segment_2": -1.0, "segment_3": 0.0, "segment_4": -1.0, "segment_5": -2.5, "segment_6": -2.0, "segment_7": 0.0}
    }
}

def get_stem_tags(stem_id: int) -> tuple:
    """
    Преобразует числовой ID Небесного Ствола (0-9) в параметры У-Син.
    Возвращает кортеж: (Элемент, Полярность)
    """
    STEM_MAP = {
        0: ("Дерево", "Ян"),  # Цзя
        1: ("Дерево", "Инь"), # И
        2: ("Огонь",  "Ян"),  # Бин
        3: ("Огонь",  "Инь"), # Дин
        4: ("Земля",  "Ян"),  # У
        5: ("Земля",  "Инь"), # Цзи
        6: ("Металл", "Ян"),  # Гэн
        7: ("Металл", "Инь"), # Синь
        8: ("Вода",   "Ян"),  # Жэнь
        9: ("Вода",   "Инь")  # Квей
    }
    return STEM_MAP[stem_id % 10]

def calculate_usin_relation(lod_element: str, transit_element: str) -> str:
    """
    Определяет вектор взаимодействия элементов по кругу созидания У-Син.
    """
    USIN_CYCLE = ["Дерево", "Огонь", "Земля", "Металл", "Вода"]
    
    idx_lod = USIN_CYCLE.index(lod_element)
    idx_transit = USIN_CYCLE.index(transit_element)
    
    shift = (idx_transit - idx_lod) % 5
    
    relation_map = {
        0: "SAME",              # Элементы совпадают (Братство)
        1: "PRODUCED_BY_ME",    # ГД порождает транзит (Самовыражение)
        2: "CONTROLLED_BY_ME",  # ГД контролирует транзит (Богатство)
        3: "CONTROLS_ME",       # Транзит контролирует ГД (Власть)
        4: "PRODUCES_ME"        # Транзит порождает ГД (Ресурсы)
    }
    return relation_map[shift]

# ============================================================================
# BLOCK_1F_USIN_FULL_MATRIX: ВЕСОВАЯ МАТРИЦА ДЕСЯТИ БОЖЕСТВ (4х5)
# ============================================================================
# Ключ 1: Тип взаимодействия по кругу У-Син.
# Ключ 2: Кортеж физических полярностей (ГД_полярность, Транзит_полярность).
# Массив somatic_modifiers: [Глаз, Челюсть, Шея, Грудь, Диафрагма, Живот, Таз]
# ============================================================================

BAZI_DEITIES_FULL_MATRIX = {
    # 1. СТИХИЯ СОВПАДАЕТ С ГД (Братство / Социальная среда)
    "SAME": {
        ("Ян", "Ян"): {
            "name": "DEITY_YANG_FRIENDS_OVERVOLT",
            "somatic_modifiers": {"segment_1": 0.0, "segment_2": 2.5, "segment_3": 0.0, "segment_4": 1.0, "segment_5": 0.5, "segment_6": 0.0, "segment_7": 0.0}
        },
        ("Инь", "Инь"): {
            "name": "DEITY_YIN_FRIENDS_STAGNATION",
            "somatic_modifiers": {"segment_1": 0.0, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 1.5, "segment_7": 2.0}
        },
        ("Ян", "Инь"): {
            "name": "DEITY_ROB_WEALTH_YANG_INVERSION",
            "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.0, "segment_3": 1.5, "segment_4": 0.0, "segment_5": 1.5, "segment_6": 3.0, "segment_7": 0.0}
        },
        ("Инь", "Ян"): {
            "name": "DEITY_ROB_WEALTH_YIN_AGRESS",
            "somatic_modifiers": {"segment_1": 2.0, "segment_2": 0.0, "segment_3": 2.5, "segment_4": 0.0, "segment_5": 1.0, "segment_6": 1.5, "segment_7": 0.0}
        }
    },
    
    # 2. СТИХИЯ, КОТОРУЮ ГД ПОРОЖДАЕТ (Самовыражение / Слив или Творчество)
    "PRODUCED_BY_ME": {
        ("Ян", "Ян"): {
            "name": "DEITY_EATING_GOD_YANG_EXHAUST",
            "somatic_modifiers": {"segment_1": 0.0, "segment_2": -1.0, "segment_3": 0.0, "segment_4": -2.5, "segment_5": -1.0, "segment_6": 0.0, "segment_7": 0.0}
        },
        ("Инь", "Инь"): {
            "name": "DEITY_EATING_GOD_YIN_RELAX",
            "somatic_modifiers": {"segment_1": 0.0, "segment_2": -2.0, "segment_3": 0.0, "segment_4": -1.0, "segment_5": -1.5, "segment_6": -1.5, "segment_7": 0.0}
        },
        ("Ян", "Инь"): {
            "name": "DEITY_HURT_OFFICER_YANG_SPLIT",
            "somatic_modifiers": {"segment_1": 1.0, "segment_2": 1.5, "segment_3": 1.0, "segment_4": 3.0, "segment_5": 1.5, "segment_6": 0.0, "segment_7": 0.0}
        },
        ("Инь", "Ян"): {
            "name": "DEITY_HURT_OFFICER_YIN_BURNING",
            "somatic_modifiers": {"segment_1": 0.0, "segment_2": 3.5, "segment_3": 0.5, "segment_4": 2.0, "segment_5": 2.0, "segment_6": 0.0, "segment_7": 0.0}
        }
    },
    
    # 3. СТИХИЯ, КОТОРУЮ ГД КОНТРОЛИРУЕТ (Богатство / Труд)
    "CONTROLLED_BY_ME": {
        ("Ян", "Ян"): {
            "name": "DEITY_VOLATILE_WEALTH_YANG_DRIVE",
            "somatic_modifiers": {"segment_1": 2.5, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 1.5, "segment_6": 0.0, "segment_7": 2.5}
        },
        ("Инь", "Инь"): {
            "name": "DEITY_VOLATILE_WEALTH_YIN_DESIRE",
            "somatic_modifiers": {"segment_1": 1.5, "segment_2": 0.0, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 1.0, "segment_6": 2.5, "segment_7": 1.5}
        },
        ("Ян", "Инь"): {
            "name": "DEITY_PROPER_WEALTH_YANG_FIX",
            "somatic_modifiers": {"segment_1": 0.0, "segment_2": 2.5, "segment_3": 0.0, "segment_4": 1.5, "segment_5": 0.0, "segment_6": 2.0, "segment_7": 1.0}
        },
        ("Инь", "Ян"): {
            "name": "DEITY_PROPER_WEALTH_YIN_STRESS",
            "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.5, "segment_3": 0.0, "segment_4": 0.0, "segment_5": 1.5, "segment_6": 3.0, "segment_7": 2.0}
        }
    },
    
    # 4. СТИХИЯ, КОТОРУЯ КОНТРОЛИРУЕТ ГД (Власть / Внешнее давление)
    "CONTROLS_ME": {
        ("Ян", "Ян"): {
            "name": "DEITY_SEVEN_KILLERS_YANG_CRISIS",
            "somatic_modifiers": {"segment_1": 2.0, "segment_2": 1.5, "segment_3": 3.0, "segment_4": 0.0, "segment_5": 4.0, "segment_6": 0.0, "segment_7": 2.5}
        },
        ("Инь", "Инь"): {
            "name": "DEITY_SEVEN_KILLERS_YIN_ABYSS",
            "somatic_modifiers": {"segment_1": 1.5, "segment_2": 0.0, "segment_3": 2.0, "segment_4": 0.0, "segment_5": 2.5, "segment_6": 3.0, "segment_7": 4.0}
        },
        ("Ян", "Инь"): {
            "name": "DEITY_DIRECT_AUTH_YANG_LOCK",
            "somatic_modifiers": {"segment_1": 0.0, "segment_2": 2.0, "segment_3": 3.0, "segment_4": 2.0, "segment_5": 1.5, "segment_6": 0.0, "segment_7": 0.0}
        },
        ("Инь", "Ян"): {
            "name": "DEITY_DIRECT_AUTH_YIN_COMPRESS",
            "somatic_modifiers": {"segment_1": 0.0, "segment_2": 1.5, "segment_3": 3.5, "segment_4": 2.5, "segment_5": 2.0, "segment_6": 0.0, "segment_7": 0.0}
        }
    },
    
    # 5. СТИХИЯ, КОТОРАЯ ПОРОЖДАЕТ ГД (Ресурсы / Опора)
    "PRODUCES_ME": {
        ("Ян", "Ян"): {
            "name": "DEITY_INDIRECT_RES_YANG_VOID",
            "somatic_modifiers": {"segment_1": 3.5, "segment_2": 0.0, "segment_3": 2.0, "segment_4": 0.0, "segment_5": 0.0, "segment_6": 1.5, "segment_7": 0.0}
        },
        ("Инь", "Инь"): {
            "name": "DEITY_INDIRECT_RES_YIN_MELANCHOLY",
            "somatic_modifiers": {"segment_1": 2.0, "segment_2": 0.0, "segment_3": 1.5, "segment_4": 0.0, "segment_5": 1.5, "segment_6": 3.0, "segment_7": 0.0}
        },
        ("Ян", "Инь"): {
            "name": "DEITY_DIRECT_RES_YANG_MATERIA",
            "somatic_modifiers": {"segment_1": -1.5, "segment_2": 0.0, "segment_3": -2.0, "segment_4": -1.5, "segment_5": 0.0, "segment_6": -2.0, "segment_7": -2.0}
        },
        ("Инь", "Ян"): {
            "name": "DEITY_DIRECT_RES_YIN_COAGULATIO",
            "somatic_modifiers": {"segment_1": -1.0, "segment_2": 0.0, "segment_3": -1.5, "segment_4": -2.0, "segment_5": -1.0, "segment_6": -2.5, "segment_7": -3.0}
        }
    }
}

def get_branch_name(branch_id: int) -> str:
    """
    Канонический строковый декодер Земных Ветвей календаря Ся.
    Преобразует числовой ID (0-11) из get_astronomical_pillars в текстовое имя.
    
    0 = Крыса, 1 = Бык, 2 = Тигр, 3 = Кролик, 4 = Дракон, 5 = Змея,
    6 = Лошадь, 7 = Коза, 8 = Обезьяна, 9 = Петух, 10 = Собака, 11 = Свинья.
    """
    BRANCH_NAMES = [
        "Крыса", "Бык", "Тигр", "Кролик", "Дракон", "Змея",
        "Лошадь", "Коза", "Обезьяна", "Петух", "Собака", "Свинья"
    ]
    return BRANCH_NAMES[branch_id % 12]

def _compute_branch_clinches(natal_pillars, t_branch_name, period_name, tsp_modifiers, all_resonance_nodes):
    """
    Вычисляет динамические клинчи Земных Ветвей:
    1. Физические Столкновения (Суче) -> Овервольтаж / Излом фасций
    2. Алхимические Слияния (Лю-Хэ) -> Инверсия / Глубокое расслабление
    3. Самонаказание (Self-Punishment) -> Аутоагрессия и зацикливание Ци
    """
    # Канонические ветви, подверженные Самонаказанию в У-Син
    SELF_PUNISHMENT_BRANCHES = ["Дракон", "Лошадь", "Петух", "Свинья"]

    for natal_period, n_coords in natal_pillars.items():
        _, n_branch_id = n_coords
        n_branch_name = get_branch_name(n_branch_id)
        branch_pair = (n_branch_name, t_branch_name)
        
        # ====================================================================
        # А) ДЕТЕКЦИЯ СТОЛКНОВЕНИЙ ВЕТВЕЙ (Острый соматический шок)
        # ====================================================================
        if branch_pair in BRANCH_CLASHES_MATRIX:
            clash_data = BRANCH_CLASHES_MATRIX[branch_pair]
            for segment_key, weight in clash_data["somatic_modifiers"].items():
                # Столкновения детонируют панцирь с коэффициентом 1.5
                tsp_modifiers[segment_key] += weight * 1.5
            all_resonance_nodes.append({
                "register": f"BAZI_CLASH_{natal_period.upper()}_{period_name.upper()}",
                "state": f"CRITICAL_BRANCH_CLASH: {clash_data['name']} [Фаза: {clash_data['alchemical_phase']}]"
            })
            
        # ====================================================================
        # Б) ДЕТЕКЦИЯ АЛХИМИЧЕСКИХ СЛИЯНИЙ ВЕТВЕЙ (Сброс напряжения панциря)
        # ====================================================================
        if branch_pair in BRANCH_COMBINATIONS_MATRIX:
            union_data = BRANCH_COMBINATIONS_MATRIX[branch_pair]
            for segment_key, weight in union_data["somatic_modifiers"].items():
                # Отрицательные веса из матрицы Лю-Хэ гасят и расслабляют зажимы
                tsp_modifiers[segment_key] += weight * 1.0
            all_resonance_nodes.append({
                "register": f"BAZI_UNION_{natal_period.upper()}_{period_name.upper()}",
                "state": f"ALCHEMICAL_BRANCH_UNION: {union_data['name']} [Фаза: {union_data['alchemical_phase']}]"
            })

        # ====================================================================
        # В) ДЕТЕКЦИЯ ТРИГГЕРОВ САМОНАКАЗАНИЯ (Аутоиммунный соматический спазм)
        # ====================================================================
        # Происходит, когда транзитная ветвь совпадает с натальной ветвью из спец-списка
        if n_branch_name == t_branch_name and t_branch_name in SELF_PUNISHMENT_BRANCHES:
            # Конфигурация штрафов самонаказания адаптирована под специфику ветвей:
            punishment_map = {
                "Дракон": {"seg": "segment_2", "name": "PUNISHMENT_DRAGON_JAW"},   # Зажим челюсти (подавленный гнев)
                "Лошадь": {"seg": "segment_4", "name": "PUNISHMENT_HORSE_HEART"},  # Перегрев груди (психосоматическая аритмия)
                "Петух":  {"seg": "segment_3", "name": "PUNISHMENT_ROOSTER_NECK"}, # Фиксация горла (невысказанная обида)
                "Свинья": {"seg": "segment_6", "name": "PUNISHMENT_PIG_BELLY"}     # Спазм живота (страх материальной ошибки)
            }
            
            p_meta = punishment_map[t_branch_name]
            # Стандартный жесткий кумулятивный вольтаж самонаказания
            base_punishment_volt = 2.0 
            
            tsp_modifiers[p_meta["seg"]] += base_punishment_volt * 1.0
            
            all_resonance_nodes.append({
                "register": f"BAZI_SELF_PUNISH__{natal_period.upper()}_{period_name.upper()}",
                "state": f"SELF_PUNISHMENT_LOCK: {p_meta['name']} [Ветвь дублирования: {t_branch_name}]"
            })

def _compute_hidden_deities(lod_element, lod_polarity, t_branch_id, t_polarity, period_name, tsp_modifiers, all_resonance_nodes):
    """
    ШАГ 3.3: Распаковывает Скрытые Стволы транзитной Ветви (Цан Гань) через локализованный HIDDEN_STEMS_ATLAS
    и начисляет пропорциональный вольт-штраф в шину Райха на основе скрытых Десяти Божеств.
    """
    # ИЗОЛИРОВАННЫЙ АТЛАС СКРЫТЫХ СТВОЛОВ (Полная копия со страницы 3 вашего PDF)
    # Индексы элементов: 0=Вода, 1=Дерево, 2=Огонь, 3=Земля, 4=Металл
    LOCAL_HIDDEN_STEMS_ATLAS = {
        0: {0: 1.0},                  # Крыса
        1: {3: 0.6, 4: 0.3, 0: 0.1},  # Бык
        2: {1: 0.6, 2: 0.3, 3: 0.1},  # Тигр
        3: {1: 1.0},                  # Кролик
        4: {3: 0.6, 1: 0.3, 0: 0.1},  # Дракон
        5: {2: 0.6, 3: 0.3, 4: 0.1},  # Змея
        6: {2: 0.7, 3: 0.3},          # Лошадь
        7: {3: 0.6, 2: 0.3, 1: 0.1},  # Коза
        8: {4: 0.6, 0: 0.3, 3: 0.1},  # Обезьяна
        9: {4: 1.0},                  # Петух
        10: {3: 0.6, 4: 0.3, 2: 0.1}, # Собака
        11: {0: 0.7, 1: 0.3}          # Свинья
    }
    
    if t_branch_id in LOCAL_HIDDEN_STEMS_ATLAS:
        USIN_ELEMENTS = ["Вода", "Дерево", "Огонь", "Земля", "Металл"]
        
        for hidden_el_id, proportion in LOCAL_HIDDEN_STEMS_ATLAS[t_branch_id].items():
            hidden_element_name = USIN_ELEMENTS[hidden_el_id]
            
            # 1. Вычисляем отношение скрытого элемента к ГД
            hidden_relation_key = calculate_usin_relation(lod_element, hidden_element_name)
            hidden_polarity_pair = (lod_polarity, t_polarity)
            
            # 2. Опрашиваем абсолютную матрицу Десяти Божеств 4х5
            if hidden_relation_key in BAZI_DEITIES_FULL_MATRIX:
                hidden_deity = BAZI_DEITIES_FULL_MATRIX[hidden_relation_key][hidden_polarity_pair]
                hidden_modifiers = hidden_deity["somatic_modifiers"]
                
                # Коэффициент присутствия скрытой Ци из атласа (пропорция)
                weight_factor = float(proportion)
                
                # 3. Квантование в шину Райха
                for segment_key, base_weight in hidden_modifiers.items():
                    tsp_modifiers[segment_key] += base_weight * weight_factor * 1.0
                    
                all_resonance_nodes.append({
                    "register": f"BAZI_HIDDEN_{period_name.upper()}_{hidden_element_name.upper()}",
                    "state": f"HIDDEN_DEITY_PROJECTION: {hidden_deity['name']} [Доля: {round(weight_factor, 2)} | Баланс: {hidden_element_name}]"
                })


def _compute_transit_rooting(natal_pillars, t_element, t_polarity, period_name, tsp_modifiers, all_resonance_nodes):
    """
    ШАГ 3.4: Проверяет укоренение (Rooting) открытого транзитного Ствола 
    в локализованном атласе Скрытых Стволов натальной карты субъекта.
    """
    # ЛОКАЛИЗОВАННЫЙ АТЛАС (Для полной автономности модуля)
    LOCAL_HIDDEN_STEMS_ATLAS = {
        0: {0: 1.0}, 1: {3: 0.6, 4: 0.3, 0: 0.1}, 2: {1: 0.6, 2: 0.3, 3: 0.1},
        3: {1: 1.0}, 4: {3: 0.6, 1: 0.3, 0: 0.1}, 5: {2: 0.6, 3: 0.3, 4: 0.1},
        6: {2: 0.7, 3: 0.3}, 7: {3: 0.6, 2: 0.3, 1: 0.1}, 8: {4: 0.6, 0: 0.3, 3: 0.1},
        9: {4: 1.0}, 10: {3: 0.6, 4: 0.3, 2: 0.1}, 11: {0: 0.7, 1: 0.3}
    }
    
    USIN_ELEMENTS = ["Вода", "Дерево", "Огонь", "Земля", "Металл"]
    if t_element not in USIN_ELEMENTS:
        return
        
    t_element_id = USIN_ELEMENTS.index(t_element)
    is_rooted = False
    root_proportion = 0.0
    root_period = ""

    # Проверка укоренения по натальной карте
    for n_period, n_coords in natal_pillars.items():
        _, n_branch_id = n_coords
        
        if n_branch_id in LOCAL_HIDDEN_STEMS_ATLAS:
            if t_element_id in LOCAL_HIDDEN_STEMS_ATLAS[n_branch_id]:
                is_rooted = True
                current_proportion = float(LOCAL_HIDDEN_STEMS_ATLAS[n_branch_id][t_element_id])
                if current_proportion > root_proportion:
                    root_proportion = current_proportion
                    root_period = n_period

    if is_rooted:
        rooting_somatic_map = {
            "Вода": "segment_7", "Дерево": "segment_2", "Огонь": "segment_4", 
            "Земля": "segment_6", "Металл": "segment_3"
        }
        target_segment = rooting_somatic_map[t_element]
        root_volt_penalty = 2.5 * root_proportion
        
        tsp_modifiers[target_segment] += root_volt_penalty * 1.5
        
        all_resonance_nodes.append({
            "register": f"BAZI_ROOTING_{period_name.upper()}_{t_element.upper()}",
            "state": f"ROOTING_FOUND: Транзитный {t_element} пророс в натальный Столп {root_period.upper()} [Сила корня: {round(root_proportion, 2)}]"
        })



# ============================================================================
# BLOCK_1F_USIN_MODULAR_CORE: МОДУЛЬНЫЙ ДВИЖОК СЛОЯ У-СИН И БАЦЗЫ
# ============================================================================

def _apply_bazi_and_usin_layers(utc_info, tzolkin_data, tsp_modifiers, all_resonance_nodes, transit_result):
    """
    СЛОЙ 3: Модернизированный расчет столпов Бацзы, динамического вектора У-Син и 
    Алхимического сопряжения. Исправлен баг KeyError через прямой импорт jd_transit.
    """
    # ========================================================================
    # ШАГ 1: АСТРОНОМИЧЕСКИЙ РАСЧЕТ НАТАЛЬНЫХ И ТРАНЗИТНЫХ СТОЛПОВ ПО ГЕНОНУ
    # ========================================================================
    with SWE_LOCK:
        # 1.1. Локальный Юлианский день для Натальной карты (Субъект) - из utc_info
        local_hour_float = float(utc_info["input_hour"]) + (float(utc_info["input_minute"]) / 60.0)
        raw_local_jd = swe.julday(int(utc_info["input_year"]), int(utc_info["input_month"]), int(utc_info["input_day"]), local_hour_float)
        bazi_birth_jd = float(raw_local_jd) if isinstance(raw_local_jd, tuple) else float(raw_local_jd)
        natal_pillars = get_astronomical_pillars(bazi_birth_jd, float(utc_info["geo"]["longitude"])) 
        
        # 1.2. ИСПРАВЛЕНО: Безопасное извлечение готового Юлианского дня транзита
        # Объект transit_result гарантированно содержит "jd_transit" (см. BLOCK_1E_DYNAMIC_TRANSIT)
        transit_jd = float(transit_result["jd_transit"])
        
        # Берем долготу из utc_info в качестве базовой точки гео-среза для транзита
        t_lon = float(utc_info["geo"]["longitude"])
        
        # Мгновенный расчет транзитных столпов времени без риска KeyError
        transit_pillars = get_astronomical_pillars(transit_jd, t_lon)

    # ========================================================================
    # ШАГ 2: ИДЕНТИФИКАЦИЯ ТОЧКИ ОТСЧЕТА (ГОСПОДИН ДНЯ - ГД)
    # ========================================================================
    lod_stem_id, _ = natal_pillars["day"]
    lod_element, lod_polarity = get_stem_tags(lod_stem_id)

    # ========================================================================
    # ШАГ 3: ПОСЛЕДОВАТЕЛЬНЫЙ КОНВЕЙЕРНЫЙ ПРОХОД ТРАНЗИТНЫХ СЛОЕВ У-СИН
    # ========================================================================
    for period_name, coords in transit_pillars.items():
        t_stem_id, t_branch_id = coords
        t_element, t_polarity = get_stem_tags(t_stem_id)
        t_branch_name = get_branch_name(t_branch_id)
        
        # 3.1. Вычисление Открытых 10 Божеств (Уровень Небесных Стволов)
        _compute_open_deities(lod_element, lod_polarity, t_element, t_polarity, period_name, tsp_modifiers, all_resonance_nodes)
        
        # 3.2. Вычисление Клинчей и Самонаказаний Ветвей (Уровень Земных Ветвей)
        _compute_branch_clinches(natal_pillars, t_branch_name, period_name, tsp_modifiers, all_resonance_nodes)
        
        # 3.3. Вычисление Скрытых Божеств (Уровень Скрытых Стволов Цан Гань)
        _compute_hidden_deities(lod_element, lod_polarity, t_branch_id, t_polarity, period_name, tsp_modifiers, all_resonance_nodes)
        
        # 3.4. Вычисление Прорастания Энергий в Фасции (Блок Укоренения / Rooting)
        _compute_transit_rooting(natal_pillars, t_element, t_polarity, period_name, tsp_modifiers, all_resonance_nodes)

    # ========================================================================
    # ШАГ 4: СТАТИЧЕСКИЙ ВЕКТОР У-СИН И БИО-КЛИНИЧЕСКИЙ ХОЛСТ СЕЛЬЕ
    # ========================================================================
    usin_snapshot = calculate_usin_somatic_vector(natal_pillars, tsp_modifiers)
    academic_core = compile_academic_clinical_core(usin_snapshot)
    
    # Упаковка текстовых имен транзитных столпов 60 Цзя-Цзы в snapshot для логов
    usin_snapshot["transit_pillars_resolved"] = _resolve_transit_pillar_names(transit_pillars)

    # ========================================================================
    # ШАГ 5: КОДОВОЕ АЛХИМИЧЕСКОЕ СОПРЯЖЕНИЕ ЦОЛЬКИН <=> У-СИН
    # ========================================================================
    alchemical_nodes, tsp_modifiers = apply_alchemical_usin_stents(
        tzolkin_data=tzolkin_data, usin_snapshot=usin_snapshot, tsp_modifiers=tsp_modifiers
    )
    all_resonance_nodes.extend(alchemical_nodes)
    
    return usin_snapshot, academic_core



# ============================================================================
# ВСПОМОГАТЕЛЬНЫЙ МАТЕМАТИЧЕСКИЙ ТРАНЗИСТОР ИМЕН 60 ЦЗЯ-ЦЗЫ
# ============================================================================

def _resolve_transit_pillar_names(transit_pillars):
    """Преобразует числовые координаты эфемерид транзита в канонические 60 Цзя-Цзы."""
    resolved_map = {}
    for p_name, coords in transit_pillars.items():
        stem_id, branch_id = coords
        stem_name = get_stem_name_by_id(stem_id)
        branch_name = get_branch_name(branch_id)
        
        for jia_zi_id, data in JIA_ZI_60_REGISTER.items():
            if data["stem"] == stem_name and data["branch"] == branch_name:
                resolved_map[p_name] = data["name"]
                break
    return resolved_map





# ============================================================================
# ПОДФУНКЦИИ ВЫЧИСЛИТЕЛЬНОГО СЛОЯ У-СИН
# ============================================================================

def _compute_open_deities(lod_element, lod_polarity, t_element, t_polarity, period_name, tsp_modifiers, all_resonance_nodes):
    """Вычисляет и начисляет веса Открытых 10 Божеств (по Небесным Стволам)"""
    relation_key = calculate_usin_relation(lod_element, t_element)
    polarity_pair = (lod_polarity, t_polarity)
    
    if relation_key in BAZI_DEITIES_FULL_MATRIX:
        deity_node = BAZI_DEITIES_FULL_MATRIX[relation_key][polarity_pair]
        for segment_key, weight in deity_node["somatic_modifiers"].items():
            tsp_modifiers[segment_key] += weight * 1.0  # Базовый шаг интеграции
            
        all_resonance_nodes.append({
            "register": f"BAZI_DEITY_{period_name.upper()}",
            "state": f"TRANSIT_IMPACT: {deity_node['name']} [Элемент: {t_element} {t_polarity}]"
        })


def _compute_branch_clinches(natal_pillars, t_branch_name, period_name, tsp_modifiers, all_resonance_nodes):
    """Вычисляет Столкновения (Суче) и Алхимические Слияния (Лю-Хэ) Земных Ветвей"""
    for natal_period, n_coords in natal_pillars.items():
        _, n_branch_id = n_coords
        n_branch_name = get_branch_name(n_branch_id)
        branch_pair = (n_branch_name, t_branch_name)
        
        # А) Детекция физических столкновений Ветвей (Штрафы)
        if branch_pair in BRANCH_CLASHES_MATRIX:
            clash_data = BRANCH_CLASHES_MATRIX[branch_pair]
            for segment_key, weight in clash_data["somatic_modifiers"].items():
                tsp_modifiers[segment_key] += weight * 1.5  # Овервольтаж излома
            all_resonance_nodes.append({
                "register": f"BAZI_CLASH_{natal_period.upper()}_{period_name.upper()}",
                "state": f"CRITICAL_BRANCH_CLASH: {clash_data['name']} [Фаза: {clash_data['alchemical_phase']}]"
            })
            
        # Б) Детекция алхимических слияний Ветвей (Релаксация фасций)
        if branch_pair in BRANCH_COMBINATIONS_MATRIX:
            union_data = BRANCH_COMBINATIONS_MATRIX[branch_pair]
            for segment_key, weight in union_data["somatic_modifiers"].items():
                tsp_modifiers[segment_key] += weight * 1.0  # Отрицательный вес расслабляет
            all_resonance_nodes.append({
                "register": f"BAZI_UNION_{natal_period.upper()}_{period_name.upper()}",
                "state": f"ALCHEMICAL_BRANCH_UNION: {union_data['name']} [Фаза: {union_data['alchemical_phase']}]"
            })

def _resolve_transit_pillar_names(transit_pillars):
    """Вспомогательный транзистор имен 60 Цзя-Цзы для снимка snapshot"""
    resolved_map = {}
    for p_name, coords in transit_pillars.items():
        stem_id, branch_id = coords
        stem_name = get_stem_name_by_id(stem_id)
        branch_name = get_branch_name(branch_id)
        
        for jia_zi_id, data in JIA_ZI_60_REGISTER.items():
            if data["stem"] == stem_name and data["branch"] == branch_name:
                resolved_map[p_name] = data["name"]
                break
    return resolved_map



def get_stem_name_by_id(stem_id: int) -> str:
    """Вспомогательный транзистор ID Ствола в его текстовый иероглиф."""
    STEMS = ["Цзя", "И", "Бин", "Дин", "У", "Цзи", "Гэн", "Синь", "Жэнь", "Квей"]
    return STEMS[stem_id % 10]




def _apply_dreamspell_transit_layer(utc_info, tzolkin_data, tsp_modifiers, all_resonance_nodes):
    """СЛОЙ 4: Динамический транзистор Волнового Модуля Дримспелл"""
    try:
        # Извлечение транзитной даты (По умолчанию системное "сегодня" 2026)
        transit_date_str = utc_info.get("transit_date", datetime.date.today().strftime("%Y-%m-%d"))
        
        # Вызов вашего существующего ядра Дримспелл для даты транзита [INDEX: 1]
        transit_oracle = calculate_maya_tzolkin_oracle(transit_date_str)
        
        if transit_oracle and transit_oracle.get("success"):
            natal_kin = int(tzolkin_data["galactic_cube_tensor"]["kin_destiny"])
            transit_kin = int(transit_oracle["galactic_cube_tensor"]["kin_destiny"])
            
            natal_nodes = tzolkin_data.get("galactic_oracle_nodes", {})
            natal_antipode_kin = int(natal_nodes.get("antipode_challenge", {}).get("kin", 1))
            natal_analogue_kin = int(natal_nodes.get("analogue_support", {}).get("kin", 1))
            natal_occult_kin = int(natal_nodes.get("occult_hidden_power", {}).get("kin", 1))

            # Математический расчет волновых контуров (Частота 13:20)
            wavespell_base_transit = int(transit_kin - ((transit_kin - 1) % 13))
            wavespell_step_transit = int(((transit_kin - 1) % 13) + 1)
            wavespell_base_natal = int(natal_kin - ((natal_kin - 1) % 13))

            wavespell_gain = 1.0
            vector_type = "NEUTRAL"
            status_text = "SYSTEM_VOLUME_SYNCHRONOUS [Синхронный ход времени]"
            
            # Логика интерференции
            if wavespell_base_transit == wavespell_base_natal:
                wavespell_gain = 0.6
                status_text = "NATAL_WAVESPELL_RESONANCE [Резонанс родной волны]"
            elif (wavespell_base_transit - 1) % 20 == ((natal_kin - 1) % 20 + 10) % 20:
                wavespell_gain = 1.5
                status_text = "ANTIPODAL_WAVESPELL_CHALLENGE [Волна Вызова среды]"

            if transit_kin == natal_kin:
                vector_type = "GALACTIC_RETURN"
                status_text = "GALACTIC_RETURN [Обнуление панциря]"
            elif transit_kin == natal_antipode_kin:
                vector_type = "ANTIPODE"
                tsp_modifiers["segment_5"] += 5.0 * wavespell_gain
                status_text = "ANTIPODE_CHALLENGE [Точечный спазм диафрагмы]"
            elif transit_kin == natal_occult_kin:
                vector_type = "OCCULT"
                tsp_modifiers["segment_6"] += 3.0 * wavespell_gain
                status_text = "OCCULT_POWER [Тонус подсознательного контура]"
            elif transit_kin == natal_analogue_kin:
                vector_type = "ANALOGUE"
                tsp_modifiers["segment_4"] *= 0.5
                status_text = "ANALOGUE_SUPPORT [Декомпрессия груди]"

            # Валидный PEP 8 квантователь шагов
            if wavespell_step_transit in (4, 5) and wavespell_gain > 1.0:
                tsp_modifiers["segment_5"] += 2.5 * wavespell_gain
            elif wavespell_step_transit in (11, 12):
                tsp_modifiers["segment_6"] *= 0.8

            all_resonance_nodes.append({
                "register": "DREAMSPELL_RADIAL_INTERFERENCE",
                "state": f"ACTIVE_CONJUNCTIO_4D [{status_text}]",
                "meta_payload": {
                    "transit_kin": transit_kin,
                    "wave_step": wavespell_step_transit,
                    "wave_gain": round(wavespell_gain, 2),
                    "vector_resolved": vector_type
                }
            })
    except Exception as e:
        logging.error(f"[SOMATIC_CONVEYOR] Сбой универсального волнового шлюза: {str(e)}")

def execute_somatic_macro_conveyor(utc_info, hd_data, pythagoras_data, ladini_data, age_arcane_data, hvd_data, tzolkin_data, transit_result):
    """
    BLOCK_1E_SOMATIC_CONVEYOR: Единая последовательная соматическая шина бэкенда [INDEX: 11].
    Декомпозирована на подфункции. Аккумулирует натяжение мышечного панциря Райха 
    от всех расчетных подсистем и выполняет наложение У-Син и Дримспелл.
    """
    logging.info("[SOMATIC_CONVEYOR] Запуск Макро-Конвейера шины Райха...")
    
    # 1. Инициализация холста 7 вегетативных сегментов панциря Райха (в μV) [INDEX: 11]
    tsp_modifiers = {f"segment_{i}": 0.0 for i in range(1, 8)}
    all_resonance_nodes = []
    
    # Резолвер Пустоты Бодиграфа и Вакуумов Пифагора [INDEX: 11]
    defined_centers = hd_data["tropical"]["defined_centers"]
    open_centers = [c for c in ["Head", "Ajna", "Throat", "G_Center", "Heart", "Sacral", "Root", "Splenic", "Solar_Plexus"] if c not in defined_centers]
    vacuum_gaps = pythagoras_data["pythagoras_vacuum_gaps"]
    grid_vector = pythagoras_data["pythagoras_grid_vector"]

    # ПОСЛЕДОВАТЕЛЬНЫЙ ПРОГОН ШИНЫ ЧЕРЕЗ ИЗОЛИРОВАННЫЕ МЕТА-СЛОИ
    # Слой 1: Пифагор и Октаграммы Ладини
    _apply_pythagoras_and_matrix_layers(
        ladini_data, pythagoras_data, age_arcane_data, 
        open_centers, defined_centers, vacuum_gaps, grid_vector, 
        tsp_modifiers, all_resonance_nodes
    )

    # Слой 2: Чакры ХВД и транзиты планет по Генону
    _apply_chakra_and_transit_layers(
        ladini_data, hvd_data, tzolkin_data, 
        open_centers, defined_centers, transit_result, 
        tsp_modifiers, all_resonance_nodes
    )

    # ========================================================================
    # Слой 3: Столпы Бацзы, У-Син вектор и Динамические Аспекты (10 Божеств)
    # ========================================================================
    # БЫЛО:
    # usin_snapshot, academic_core = _apply_bazi_and_usin_layers(
    #     utc_info, tzolkin_data, tsp_modifiers, all_resonance_nodes
    # )

    # СТАЛО (Добавлен сквозной транзитный контекст):
    usin_snapshot, academic_core = _apply_bazi_and_usin_layers(
        utc_info, tzolkin_data, tsp_modifiers, all_resonance_nodes, transit_result
    )


    # Слой 4: Врезка фрактального времени Дримспелл (13-дневный цикл)
    _apply_dreamspell_transit_layer(utc_info, tzolkin_data, tsp_modifiers, all_resonance_nodes)

    # Фиксация итоговых У-Син нод в общем соматическом реестре [INDEX: 14]
    all_resonance_nodes.append({
        "register": f"USIN_STAG_{usin_snapshot['stagnation_somatic_segment'].upper()}",
        "state": f"ACTIVE_QI_STAGNATIO [{usin_snapshot['stagnation_node_injury']}]"
    })
    all_resonance_nodes.append({
        "register": f"USIN_REBEL_{usin_snapshot['rebellion_somatic_segment'].upper()}",
        "state": f"CRITICAL_REBEL_KO [{usin_snapshot['rebellion_conflict_signature']}]"
    })

    logging.info("[SOMATIC_CONVEYOR] Расчет шины Райха успешно завершен. Резонансы запечатаны.")
    return tsp_modifiers, all_resonance_nodes, usin_snapshot, academic_core


# КАНАЛИЗИРОВАННЫЙ СЛОВАРЬ АНАЛОГИЙ СТИХИЙ ПО ГЕНОНУ
# Связывает Хроматическую группу Цолькин с элементами Бацзы и мышечными сегментами
ALCHEMICAL_USIN_MAP = {
    "RED": {
        "element": "Дерево (Му)",
        "organs": ["Liver", "Gallbladder"],
        "segments": ["segment_2", "segment_3"], # Челюсть и Шея (uwei_masseter_gate)
        "base_weight": 2.2,
        "signature": "QI_STAGNATIO_LIVER"
    },
    "WHITE": {
        "element": "Металл (Цзинь)",
        "organs": ["Lungs", "Large_Intestine"],
        "segments": ["segment_5"], # Диафрагма (Блокировка дыхания/Скорбь)
        "base_weight": 2.5,
        "signature": "DRY_LUNGS_COMPRESSION"
    },
    "BLUE": {
        "element": "Вода (Шуй)",
        "organs": ["Kidneys", "Bladder"],
        "segments": ["segment_7"], # Тазовое дно (Экзистенциальный страх/Слив Цзин)
        "base_weight": 3.0,
        "signature": "KIDNEY_COLD_FALL"
    },
    "YELLOW": {
        "element": "Огонь (Хо) / Земля (Ту)",
        "organs": ["Heart", "Spleen", "Stomach"],
        "segments": ["segment_4", "segment_6"], # Грудь и Живот (Ложный ментальный контроль)
        "base_weight": 2.0,
        "signature": "HEART_FIRE_SPLEEN_DAMP"
    }
}

def apply_alchemical_usin_stents(tzolkin_data, usin_snapshot, tsp_modifiers):
    """
    ПОДФУНКЦИЯ 3.9: Алхимический транзистор сопряжения.
    Считывает цвет Печати-Антипода, сопоставляет с картой застоя органов У-Син 
    и каскадно накидывает вольт-штрафы на шину Райха при подтверждении резонанса.
    """
    # 1. Извлекаем цвет Печати-Антипода из структуры Dreamspell (RED, WHITE, BLUE, YELLOW)
    # Твой модуль calculate_maya_tzolkin_oracle отдает цвет в antipode_challenge["color"]
    antipode_meta = tzolkin_data.get("antipode_challenge", {})
    antipode_color = antipode_meta.get("color", "UNKNOWN").upper()
    
    if antipode_color not in ALCHEMICAL_USIN_MAP:
        return [], tsp_modifiers
        
    alch_rule = ALCHEMICAL_USIN_MAP[antipode_color]
    alchemical_nodes = []
    
    # 2. Сканируем застойные зоны органов, вычисленные модулем Бацзы (usin_snapshot)
    active_stagnation_organ = usin_snapshot.get("stagnation_node_injury", "None")
    active_rebellion_organ = usin_snapshot.get("rebellion_conflict_signature", "None")
    
    # Проверяем, совпадает ли застой органа У-Син с цветом текущего космического Вызова
    is_resonance = False
    for target_organ in alch_rule["organs"]:
        if target_organ in active_stagnation_organ or target_organ in active_rebellion_organ:
            is_resonance = True
            break
            
    # 3. Если резонанс совпал — Клетка захвачена. Начисляем жесткий кумулятивный вольтаж
    if is_resonance:
        alchemical_nodes.append({
            "register": f"ALCH_RESONANCE_{alch_rule['signature']}",
            "state": f"CRITICAL_CROSS_SYSTEM_CLINCH [Цвет Вызова: {antipode_color} <=> Элемент: {alch_rule['element']}]"
        })
        
        # Каскадно утяжеляем целевые вегетативные сегменты панциря
        for segment in alch_rule["segments"]:
            # Сходящийся клинч увеличивает напряжение фасций фатально
            tsp_modifiers[segment] += alch_rule["base_weight"] * 1.5 
    else:
        # Если прямого резонанса нет, накидываем базовый фоновый штраф стихии
        for segment in alch_rule["segments"]:
            tsp_modifiers[segment] += alch_rule["base_weight"] * 0.5

    return alchemical_nodes, tsp_modifiers

import logging

def apply_universal_wavespell_transit(birth_date_str, transit_date_str, ladini_output, tsp_modifiers):
    """
    BLOCK_1E_LAYER_9_UNIVERSAL_VALIDATED: Универсальный шлюз Волнового Модуля.
    Вызывает нативное ядро calculate_maya_tzolkin_oracle дважды, 
    вычисляет пересечение 13-дневных волн для любого человека/даты
    и квантует нагрузку в микровольты шины Райха.
    """
    try:
        # 1. Запрос натальной матрицы и матрицы транзитного дня
        natal_oracle = calculate_maya_tzolkin_oracle(birth_date_str)
        transit_oracle = calculate_maya_tzolkin_oracle(transit_date_str)
        
        if not natal_oracle or not transit_oracle:
            logging.error("Нативное ядро Майя вернуло пустой объект.")
            return {"success": False, "reason": "Null oracle output"}
            
        if not natal_oracle.get("success") or not transit_oracle.get("success"):
            return {"success": False, "reason": "Ошибка вычисления нативного ядра Майя."}
            
        # Извлекаем истинные Кины из вашего кубического тензора
        natal_kin = int(natal_oracle["galactic_cube_tensor"]["kin_destiny"])
        transit_kin = int(transit_oracle["galactic_cube_tensor"]["kin_destiny"])
        
        # Извлекаем ID Кинов Оракула Пятой Силы из вашего словаря nodes с защитой от KeyError
        nodes_n = natal_oracle.get("galactic_oracle_nodes", {})
        natal_antipode_kin = int(nodes_n.get("antipode_challenge", {}).get("kin", 1))
        natal_analogue_kin = int(nodes_n.get("analogue_support", {}).get("kin", 1))
        natal_occult_kin = int(nodes_n.get("occult_hidden_power", {}).get("kin", 1))

        # 2. МАТЕМАТИЧЕСКИЙ РАСЧЕТ ВОЛНОВЫХ ЦИКЛОВ (ЧАСТОТА 13:20)
        wavespell_base_transit = int(transit_kin - ((transit_kin - 1) % 13))
        wavespell_step_transit = int(((transit_kin - 1) % 13) + 1)
        wavespell_base_natal = int(natal_kin - ((natal_kin - 1) % 13))

        # 3. АНАЛИЗ ИНТЕРФЕРЕНЦИИ СРЕДЫ
        wavespell_gain = 1.0
        vector_type = "NEUTRAL"
        status_text = "SYSTEM_VOLUME_SYNCHRONOUS [Синхронный ход]"
        
        # Проверка резонанса 13-дневных волновых модулей
        if wavespell_base_transit == wavespell_base_natal:
            wavespell_gain = 0.6
            status_text = "NATAL_WAVESPELL_RESONANCE [Резонанс родной волны]"
        elif (wavespell_base_transit - 1) % 20 == ((natal_kin - 1) % 20 + 10) % 20:
            wavespell_gain = 1.5
            status_text = "ANTIPODAL_WAVESPELL_CHALLENGE [Волна Вызова среды]"

        # Точечный перехват изолированного Кин-дня по вашему Оракулу
        if transit_kin == natal_kin:
            vector_type = "GALACTIC_RETURN"
            status_text = "GALACTIC_RETURN [Обнуление панциря]"
        elif transit_kin == natal_antipode_kin:
            vector_type = "ANTIPODE"
            if "segment_5" in tsp_modifiers:
                tsp_modifiers["segment_5"] += 5.0 * wavespell_gain
            status_text = "ANTIPODE_CHALLENGE [Точечный спазм диафрагмы]"
        elif transit_kin == natal_occult_kin:
            vector_type = "OCCULT"
            if "segment_6" in tsp_modifiers:
                tsp_modifiers["segment_6"] += 3.0 * wavespell_gain
            status_text = "OCCULT_POWER [Тонус подсознательного контура]"
        elif transit_kin == natal_analogue_kin:
            vector_type = "ANALOGUE"
            if "segment_4" in tsp_modifiers:
                tsp_modifiers["segment_4"] *= 0.5
            status_text = "ANALOGUE_SUPPORT [Декомпрессия груди]"

        # 4. ИСПРАВЛЕНО: Квантование Тонов транзитной волны на шину Райха (Синтаксические дыры закрыты)
        if wavespell_step_transit in (4, 5) and wavespell_gain > 1.0:
            if "segment_5" in tsp_modifiers:
                tsp_modifiers["segment_5"] += 2.5 * wavespell_gain
        elif wavespell_step_transit in (11, 12):
            if "segment_6" in tsp_modifiers:
                tsp_modifiers["segment_6"] *= 0.8

        # Фиксация в рантайм-реестр
        ladini_output["wavespell_universal_meta"] = {
            "natal_kin": natal_kin,
            "transit_kin": transit_kin,
            "wave_base": wavespell_base_transit,
            "wave_step": wavespell_step_transit,
            "vector_resolved": vector_type,
            "status": status_text
        }

        return {
            "success": True, 
            "transit_kin": transit_kin, 
            "wave_step": wavespell_step_transit, 
            "gain": round(wavespell_gain, 2)
        }

    except Exception as e:
        logging.error(f"Критический сбой универсального шлюза: {str(e)}")
        return {"success": False, "error": f"Сбой универсального шлюза: {str(e)}"}

def log_block_dreamspell_transit(all_resonance_nodes):
    """
    Микросервис отладки: Самостоятельно рассчитывает истинный Кин транзита 
    от текущей системной даты (date.today()), обновляет/сохраняет данные в 
    all_resonance_nodes и выводит структуру волны Цолькина в консоль [INDEX: 0.1.11].
    """
    print("\n[ LAYER_LOG :: ДИНАМИЧЕСКИЙ ТРАНЗИТ ГАЛАКТИЧЕСКОГО ВРЕМЕНИ ДРИМСПЕЛЛ (13:20) ]")
    try:
        from datetime import date
        current_today_str = date.today().strftime("%Y-%m-%d")
        
        # Вызываем калькулятор от текущей даты [INDEX: 0.1.4]
        transit_oracle = calculate_maya_tzolkin_oracle(current_today_str)
        
        if not transit_oracle or not transit_oracle.get("success"):
            print(" -> Тразитное поле времени: Нейтральный галактический фон среды [INDEX: 0.1.11].")
            return
            
        cube_tensor = transit_oracle["galactic_cube_tensor"]
        oracle_nodes = transit_oracle["galactic_oracle_nodes"]
        
        transit_kin = cube_tensor["kin_destiny"]
        resolved_signature = oracle_nodes["destiny_core"]["name"].split("::")[-1].strip()
        
        # Вычисляем канонические параметры волны [INDEX: 0.1.12]
        wave_step = ((transit_kin - 1) % 13) + 1
        wavespell_base_kin = int(transit_kin - ((transit_kin - 1) % 13))
        if wavespell_base_kin <= 0: 
            wavespell_base_kin = 1
            
        # -------------------------------------------------------------------------
        # СОХРАНЕНИЕ И СИНХРОНИЗАЦИЯ В RECOGNIZED / RESONANCE NODES
        # -------------------------------------------------------------------------
        # Ищем существующую ноду по маске регистра [INDEX: 0.1.11]
        ds_node = None
        for node in all_resonance_nodes:
            reg_name = node.get("register", "")
            if reg_name.startswith("GALACTIC_TENSOR_KIN_") or reg_name == "DREAMSPELL_RADIAL_INTERFERENCE":
                ds_node = node
                break
                
        # Если нода не найдена на шаге 6 — создаем её с дефолтным множителем [INDEX: 0.1.11, 0.1.12]
        if not ds_node:
            ds_node = {
                "register": f"GALACTIC_TENSOR_KIN_{transit_kin}",
                "state": "ACTIVE",
                "total_scale_factor": 1.0
            }
            all_resonance_nodes.append(ds_node)
            
        # Обновляем / перезаписываем мета-данные актуальным транзитом [INDEX: 0.1.11, 0.1.12]
        ds_node["state"] = "ACTIVE"
        ds_node["resolved_signature"] = resolved_signature
        ds_node["meta_payload"] = {
            "transit_kin": transit_kin,
            "wave_step": wave_step,
            "wavespell_base_kin": wavespell_base_kin,
            "calculation_date": current_today_str
        }
        
        wave_gain = ds_node.get("total_scale_factor", 1.0) 
        
        # Консольный вывод [INDEX: 0.1.12]
        print(f" [+] Текущий статус резонанса : {ds_node['state']}")
        print(f" [+] Истинный Кин транзита    : Кин {transit_kin} :: {resolved_signature.upper()}")
        print(f" [+] Текущий шаг в Волне (Тон): {wave_step} из 13 [Частота Хронометра]")
        print(f" [+] Кин-Основатель Волны     : Кин {wavespell_base_kin}")
        print(f" [+] Множитель зажима фасций  : x{wave_gain} к целевым сегментам Райха")
        print(" -------------------------------------------------------------------------")
        
    except Exception as e:
        print(f" [!] Ошибка декомпрессии и сохранения блока Дримспелл-транзита: {str(e)} [INDEX: 0.1.12]")

def log_block_dreamspell_solar_return(all_resonance_nodes, input_day, input_month):
    """
    Рассчитывает полный Солярный Оракул Пятой Силы на текущий год, 
    сохраняет все 5 узлов в реестр all_resonance_nodes и выводит их в консоль [INDEX: 0.1.5, 0.1.11].
    """
    print("\n[ LAYER_LOG :: ПОЛНЫЙ СОЛЯРНЫЙ ОРАКУЛ ПЯТОЙ СИЛЫ ДРИМСПЕЛЛ ]")
    try:
        from datetime import date
        current_year = date.today().year
        
        # Обработка високосного сдвига Дримспелл для 29 февраля [INDEX: 0.1.4]
        if int(input_month) == 2 and int(input_day) == 29:
            is_leap = (current_year % 4 == 0 and (current_year % 100 != 0 or current_year % 400 == 0))
            solar_day = 29 if is_leap else 28
        else:
            solar_day = int(input_day)
            
        solar_month = int(input_month)
        solar_date_str = f"{current_year:04d}-{solar_month:02d}-{solar_day:02d}"
        
        # Вычисляем Оракул для солярной даты [INDEX: 0.1.4]
        solar_oracle = calculate_maya_tzolkin_oracle(solar_date_str)
        
        if not solar_oracle or not solar_oracle.get("success"):
            print(" -> Солярное поле времени: Не удалось рассчитать оракул.")
            return
            
        # Распаковываем узлы оригинального оракула [INDEX: 0.1.5, 0.1.6]
        nodes = solar_oracle["galactic_oracle_nodes"]
        
        destiny_data = nodes["destiny_core"]
        analogue_data = nodes["analogue_support"]
        antipode_data = nodes["antipode_challenge"]
        occult_data = nodes["occult_hidden_power"]
        guide_data = nodes["guide_vector"]
        
        # -------------------------------------------------------------------------
        # СОХРАНЕНИЕ И СИНХРОНИЗАЦИЯ В RECOGNIZED / RESONANCE NODES
        # -------------------------------------------------------------------------
        sol_node = None
        for node in all_resonance_nodes:
            if node.get("register") == "DREAMSPELL_SOLAR_RETURN":
                sol_node = node
                break
                
        if not sol_node:
            sol_node = {
                "register": "DREAMSPELL_SOLAR_RETURN",
                "state": "ACTIVE",
                "total_scale_factor": 1.0
            }
            all_resonance_nodes.append(sol_node)
            
        # Сохраняем полный слепок всех 5 узлов в мета-пакет для шины API [INDEX: 0.1.11]
        sol_node["state"] = "ACTIVE"
        sol_node["resolved_signature"] = destiny_data["name"].split("::")[-1].strip()
        sol_node["meta_payload"] = {
            "solar_year": current_year,
            "solar_date_processed": solar_date_str,
            "galactic_oracle_5_nodes": nodes  # Сохраняет destiny_core, analogue_support и т.д.
        }
        
        # -------------------------------------------------------------------------
        # ПОЛНЫЙ ПОСЛОЙНЫЙ ВЫВОД ОРАКУЛА В КОНСОЛЬ
        # -------------------------------------------------------------------------
        print(f" [+] Целевой солярный год      : {current_year}")
        print(f" [+] [ЯДРО] Кин Судьбы         : {destiny_data['name']}")
        print(f" [+] [ПОДДЕРЖКА] Кин Аналога   : {analogue_data['name']}")
        print(f" [+] [ВЫЗОВ] Кин Антипода      : {antipode_data['name']}")
        print(f" [+] [ТАЙНА] Кин Оккультный    : {occult_data['name']}")
        print(f" [+] [ВЕДУЩИЙ] Кин Путеводителя: {guide_data['name']}")
        print(" -------------------------------------------------------------------------")
        
    except Exception as e:
        print(f" [!] Критический сбой вывода Солярного Оракула: {str(e)}")

def log_and_sync_dreamspell_trinity(all_resonance_nodes):
    """
    Чистый узел интерпретации: извлекает натал, транзит и соляр прямо из шины,
    сопоставляет их между собой и выводит полный солярный оракул в консоль [INDEX: 0.1.11, 0.1.12].
    """
    print("\n[ LAYER_LOG :: ИНТЕРФЕРЕНЦИЯ И НАЛОЖЕНИЕ ТРИАДЫ ВРЕМЕНИ ДРИМСПЕЛЛ ]")
    try:
        # 1. Извлекаем Транзит дня и Солярный оракул из реестра нод [INDEX: 0.1.11]
        solar_node = None
        transit_kin = None
        sig_transit = "N/A"
        
        for node in all_resonance_nodes:
            reg_name = node.get("register", "")
            if reg_name == "DREAMSPELL_SOLAR_RETURN":
                solar_node = node
            elif reg_name.startswith("GALACTIC_TENSOR_KIN_"):
                transit_kin = node.get("meta_payload", {}).get("transit_kin")
                sig_transit = node.get("resolved_signature", "N/A")

        if not solar_node or not transit_kin:
            print(" -> Ошибка наложения: В шине не найдены нужные ноды Дримспелл [INDEX: 0.1.11].")
            return
            
        solar_payload = solar_node.get("meta_payload", {})
        solar_kin = solar_payload.get("solar_kin")
        solar_oracle_5_nodes = solar_payload.get("galactic_oracle_5_nodes", {})
        
        # 2. Распаковываем узлы полного солярного оракула для вывода [INDEX: 0.1.5]
        destiny_data = solar_oracle_5_nodes.get("destiny_core", {"name": f"Кин {solar_kin} :: N/A"})
        analogue_data = solar_oracle_5_nodes.get("analogue_support", {"name": "N/A"})
        antipode_data = solar_oracle_5_nodes.get("antipode_challenge", {"name": "N/A"})
        occult_data = solar_oracle_5_nodes.get("occult_hidden_power", {"name": "N/A"})
        guide_data = solar_oracle_5_nodes.get("guide_vector", {"name": "N/A"})
        
        # Вытаскиваем посчитанные метрики сдвигов, если они были сохранены [INDEX: 0.1.12]
        metrics = solar_payload.get("resonance_metrics", {})
        dist_natal_to_solar = metrics.get("solar_shift_steps", "N/A")
        
        # 3. ПОЛНЫЙ ОДНОВРЕМЕННЫЙ ВЫВОД ОРАКУЛА В ТЕРМИНАЛ [INDEX: 0.1.12]
        print(f" [*] ТРАНЗИТНЫЙ КИН ДНЯ     : Кин {transit_kin} :: {sig_transit.upper()}")
        print(" -------------------------------------------------------------------------")
        print(f" [+] [ПОЛНЫЙ СОЛЯРНЫЙ ОРАКУЛ ГОДА]:")
        print(f"     -> [ЯДРО ГОДА]         : {destiny_data['name']}")
        print(f"     -> [ПОДДЕРЖКА ГОДА]    : {analogue_data['name']}")
        print(f"     -> [ВЫЗОВ ГОДА]        : {antipode_data['name']}")
        print(f"     -> [ТАЙНА ГОДА]        : {occult_data['name']}")
        print(f"     -> [ВЕДУЩИЙ ГОДА]      : {guide_data['name']}")
        print(" -------------------------------------------------------------------------")
        if dist_natal_to_solar != "N/A":
            print(f" [+] Эволюционный шаг соляра: {dist_natal_to_solar} шагов от натального Кин.")
            print(" -------------------------------------------------------------------------")
        
    except Exception as e:
        print(f" [!] Ошибка при выводе солярного оракула триады: {str(e)}")



# ============================================================================
# BLOCK_1G_JYOTISH_ATLAS: ПОЛНЫЙ МАТРИЧНЫЙ РЕЕСТР 27 НАКШАТР (3 СЛОЯ ГУН)
# ============================================================================
# gunas: [Первичный (Ум / Маха), Вторичный (Психика / Эмоции), Третичный (Плоть / Ткани)]
# seg: Целевой сегмент Райха для распределения нейровегетативных зажимов.
# ============================================================================

NAKSHATRAS_ATLAS = {
    # --- Цикл 1 (Накшатры 1 - 9): Первичный уровень — всегда Саттва ---
    0: {
        "name": "Ashwini", "lord": "Ketu", "seg": "segment_1",
        "gunas": ["Sattva", "Sattva", "Sattva"]
    },
    1: {
        "name": "Bharani", "lord": "Venus", "seg": "segment_7",
        "gunas": ["Sattva", "Sattva", "Rajas"]
    },
    2: {
        "name": "Krittika", "lord": "Sun", "seg": "segment_2",
        "gunas": ["Sattva", "Sattva", "Tamas"]
    },
    3: {
        "name": "Rohini", "lord": "Moon", "seg": "segment_4",
        "gunas": ["Sattva", "Rajas", "Sattva"]
    },
    4: {
        "name": "Mrigashira", "lord": "Mars", "seg": "segment_5",
        "gunas": ["Sattva", "Rajas", "Rajas"]
    },
    5: {
        "name": "Ardra", "lord": "Rahu", "seg": "segment_3",
        "gunas": ["Sattva", "Rajas", "Tamas"]
    },
    6: {
        "name": "Punarvasu", "lord": "Jupiter", "seg": "segment_4",
        "gunas": ["Sattva", "Tamas", "Sattva"]
    },
    7: {
        "name": "Pushya", "lord": "Saturn", "seg": "segment_3",
        "gunas": ["Sattva", "Tamas", "Rajas"]
    },
    8: {
        "name": "Ashlesha", "lord": "Mercury", "seg": "segment_2",
        "gunas": ["Sattva", "Tamas", "Tamas"]
    },

    # --- Цикл 2 (Накшатры 10 - 18): Первичный уровень — всегда Раджас ---
    9: {
        "name": "Magha", "lord": "Ketu", "seg": "segment_7",
        "gunas": ["Rajas", "Sattva", "Sattva"]
    },
    10: {
        "name": "Purva Ph.", "lord": "Venus", "seg": "segment_6",
        "gunas": ["Rajas", "Sattva", "Rajas"]
    },
    11: {
        "name": "Uttara Ph.", "lord": "Sun", "seg": "segment_5",
        "gunas": ["Rajas", "Sattva", "Tamas"]
    },
    12: {
        "name": "Hasta", "lord": "Moon", "seg": "segment_4",
        "gunas": ["Rajas", "Rajas", "Sattva"]
    },
    13: {
        "name": "Chitra", "lord": "Mars", "seg": "segment_2",
        "gunas": ["Rajas", "Rajas", "Rajas"]
    },
    14: {
        "name": "Swati", "lord": "Rahu", "seg": "segment_5",
        "gunas": ["Rajas", "Rajas", "Tamas"]
    },
    15: {
        "name": "Visakha", "lord": "Jupiter", "seg": "segment_6",
        "gunas": ["Rajas", "Tamas", "Sattva"]
    },
    16: {
        "name": "Anuradha", "lord": "Saturn", "seg": "segment_7",
        "gunas": ["Rajas", "Tamas", "Rajas"]
    },
    17: {
        "name": "Jyeshtha", "lord": "Mercury", "seg": "segment_1",
        "gunas": ["Rajas", "Tamas", "Tamas"]
    },

    # --- Цикл 3 (Накшатры 19 - 27): Первичный уровень — всегда Тамас ---
    18: {
        "name": "Mula", "lord": "Ketu", "seg": "segment_7",
        "gunas": ["Tamas", "Sattva", "Sattva"]
    },
    19: {
        "name": "Purva Sh.", "lord": "Venus", "seg": "segment_6",
        "gunas": ["Tamas", "Sattva", "Rajas"]
    },
    20: {
        "name": "Uttara Sh.", "lord": "Sun", "seg": "segment_5",
        "gunas": ["Tamas", "Sattva", "Tamas"]
    },
    21: {
        "name": "Sravana", "lord": "Moon", "seg": "segment_1",
        "gunas": ["Tamas", "Rajas", "Sattva"]
    },
    22: {
        "name": "Dhanishta", "lord": "Mars", "seg": "segment_2",
        "gunas": ["Tamas", "Rajas", "Rajas"]
    },
    23: {
        "name": "Shatabhisha", "lord": "Rahu", "seg": "segment_5",
        "gunas": ["Tamas", "Rajas", "Tamas"]
    },
    24: {
        "name": "Purva Bh.", "lord": "Jupiter", "seg": "segment_3",
        "gunas": ["Tamas", "Tamas", "Sattva"]
    },
    25: {
        "name": "Uttara Bh.", "lord": "Saturn", "seg": "segment_7",
        "gunas": ["Tamas", "Tamas", "Rajas"]
    },
    26: {
        "name": "Revati", "lord": "Mercury", "seg": "segment_4",
        "gunas": ["Tamas", "Tamas", "Tamas"]
    }
}

# ============================================================================
# BLOCK_1G_JYOTISH_ABSOLUTE_GUNA_MATRIX: МАТРИЦА СВЯЗИ ГУН И ПЛАНЕТ-УПРАВИТЕЛЕЙ (3х9)
# ============================================================================
# Верхние ключи: "Sattva", "Rajas", "Tamas" (Качество приходящей или натальной энергии).
# Вложенные ключи: Планеты-управители Накшатр (Девять Граф Джйотиш).
# Массив возвращает: { target_segment: вольт_штраф_мкВ }
# ============================================================================

# ============================================================================
# BLOCK_1G_JYOTISH_INTEGRATED_MONOLITH: СИДЕРИЧЕСКИЙ ВЕГЕТАТИВНЫЙ СОПРОЦЕССОР
# ============================================================================

# 1. АБСОЛЮТНАЯ ВЕСОВАЯ МАТРИЦА ГУН И ПЛАНЕТ-УПРАВИТЕЛЕЙ (3х9)
JYOTISH_GUNA_PLANET_MATRIX = {
    "Sattva": {
        "Sun": {"seg": "segment_4", "val": -1.5}, "Moon": {"seg": "segment_4", "val": -2.0},
        "Mars": {"seg": "segment_5", "val": -1.0}, "Mercury": {"seg": "segment_1", "val": -1.5},
        "Jupiter": {"seg": "segment_6", "val": -2.5}, "Venus": {"seg": "segment_7", "val": -2.0},
        "Saturn": {"seg": "segment_3", "val": -1.0}, "Rahu": {"seg": "segment_1", "val": -0.5},
        "Ketu": {"seg": "segment_7", "val": -1.0}
    },
    "Rajas": {
        "Sun": {"seg": "segment_4", "val": 2.0},  "Moon": {"seg": "segment_4", "val": 1.8},
        "Mars": {"seg": "segment_2", "val": 3.5},  "Mercury": {"seg": "segment_2", "val": 2.0},
        "Jupiter": {"seg": "segment_6", "val": 1.5}, "Venus": {"seg": "segment_7", "val": 2.5},
        "Saturn": {"seg": "segment_3", "val": 2.0},  "Rahu": {"seg": "segment_5", "val": 3.0},
        "Ketu": {"seg": "segment_2", "val": 2.0}
    },
    "Tamas": {
        "Sun": {"seg": "segment_1", "val": 1.5},  "Moon": {"seg": "segment_6", "val": 2.0},
        "Mars": {"seg": "segment_2", "val": 2.5},  "Mercury": {"seg": "segment_1", "val": 1.8},
        "Jupiter": {"seg": "segment_6", "val": 2.2}, "Venus": {"seg": "segment_7", "val": 3.0},
        "Saturn": {"seg": "segment_3", "val": 4.0},  "Rahu": {"seg": "segment_5", "val": 3.5},
        "Ketu": {"seg": "segment_7", "val": 3.0}
    }
}


def _apply_jyotish_and_nakshatra_layers(natal_positions, transit_positions, natal_jd, transit_jd, tsp_modifiers, all_resonance_nodes):
    """
    ГЛАВНЫЙ ВЫЧИСЛИТЕЛЬНЫЙ МОДУЛЬ СЛОЯ 3.5.
    Переводит тропические координаты планет в сидерические, определяет Накшатры,
    запускает лазерные лучи Дришти и послойно калибрует гуны.
    """
    # Динамический расчет Айанамши Лахири
    ayan_birth = 23.85 + 0.00014 * (natal_jd - 2451545.0) / 365.25
    ayan_transit = 23.85 + 0.00014 * (transit_jd - 2451545.0) / 365.25

    nak_step = 360.0 / 27.0
    natal_nakshatras = {}
    transit_nakshatras = {}

    # Сидерический парсинг натала
    for planet, lon in natal_positions.items():
        sidereal_lon = (lon - ayan_birth) % 360.0
        nak_id = int(sidereal_lon // nak_step)
        natal_nakshatras[planet] = {
            "lon": round(sidereal_lon, 3), "nak_id": nak_id, "meta": NAKSHATRAS_ATLAS[nak_id]
        }

    # Сидерический парсинг транзита
    for planet, lon in transit_positions.items():
        sidereal_lon = (lon - ayan_transit) % 360.0
        nak_id = int(sidereal_lon // nak_step)
        transit_nakshatras[planet] = {
            "lon": round(sidereal_lon, 3), "nak_id": nak_id, "meta": NAKSHATRAS_ATLAS[nak_id]
        }

    # ВЫЧИСЛИТЕЛЬНЫЙ ШАГ А: Запуск лучевого сканирования Дришти с учетом Пад
    _compute_jyotish_drishti(natal_nakshatras, transit_nakshatras, tsp_modifiers, all_resonance_nodes)
    
    # ВЫЧИСЛИТЕЛЬНЫЙ ШАГ Б: Послойное распределение 3-х уровней Гун натальной Луны
    guna_profile = _evaluate_somatic_guna_layers(natal_nakshatras, tsp_modifiers, all_resonance_nodes)

    return {
        "sidereal_positions_natal": {p: d["lon"] for p, d in natal_nakshatras.items()},
        "sidereal_positions_transit": {p: d["lon"] for p, d in transit_nakshatras.items()},
        "natal_profile_full": {p: d["meta"]["name"] for p, d in natal_nakshatras.items()},
        "transit_profile_full": {p: d["meta"]["name"] for p, d in transit_nakshatras.items()},
        "guna_profile_layers": guna_profile
    }


def _compute_jyotish_drishti(natal_nakshatras, transit_nakshatras, tsp_modifiers, all_resonance_nodes):
    """Подфункция лучевых вегетативных ударов планет по каноническим домам Джйотиш."""
    DRISHTI_RULES = {
        "Saturn": [3, 7, 10], "Mars": [4, 7, 8], "Jupiter": [5, 7, 9],
        "Rahu": [5, 7, 9], "Ketu": [5, 7, 9],
        "Sun": [7], "Moon": [7], "Mercury": [7], "Venus": [7]
    }
    PLANET_GUNA_MAP = {
        "Saturn": "Tamas", "Rahu": "Tamas", "Ketu": "Tamas",
        "Mars": "Rajas", "Mercury": "Rajas", "Venus": "Rajas",
        "Sun": "Sattva", "Moon": "Sattva", "Jupiter": "Sattva"
    }

    for t_planet, look_houses in DRISHTI_RULES.items():
        if t_planet not in transit_nakshatras: 
            continue
            
        t_lon = transit_nakshatras[t_planet]["lon"]
        t_sign_idx = int(t_lon // 30.0)
        t_pad_id = int((t_lon % (360.0 / 27.0)) // (360.0 / 108.0)) + 1
        active_guna = PLANET_GUNA_MAP.get(t_planet, "Sattva")
        
        for house_shift in look_houses:
            target_sign_idx = (t_sign_idx + (house_shift - 1)) % 12
            
            for n_planet, n_data in natal_nakshatras.items():
                n_lon = n_data["lon"]
                n_sign_idx = int(n_lon // 30.0)
                
                if n_sign_idx == target_sign_idx:
                    n_meta = n_data["meta"]
                    n_lord = n_meta["lord"]
                    target_seg = n_meta["seg"]
                    n_pad_id = int((n_lon % (360.0 / 27.0)) // (360.0 / 108.0)) + 1
                    
                    if active_guna in JYOTISH_GUNA_PLANET_MATRIX and n_lord in JYOTISH_GUNA_PLANET_MATRIX[active_guna]:
                        matrix_node = JYOTISH_GUNA_PLANET_MATRIX[active_guna][n_lord]
                        base_impact_volt = float(matrix_node["val"])
                        
                        focus_multiplier = 1.0
                        clinch_msg = "ПЕРИФЕРИЙНЫЙ ВЗГЛЯД"
                        
                        if t_pad_id == n_pad_id:
                            focus_multiplier = 2.0
                            clinch_msg = "ТОЧНЫЙ МИКРО-КЛИНЧ ПАД (НАВАМША D-9)"
                            
                        final_somatic_volt = base_impact_volt * focus_multiplier
                        tsp_modifiers[target_seg] += final_somatic_volt
                        
                        all_resonance_nodes.append({
                            "register": f"JYOTISH_DRISHTI_{t_planet.upper()}_ON_{n_planet.upper()}",
                            "state": f"ASPECT_RAY: [{t_planet}] ({active_guna.upper()}) => [{n_planet}]. "
                                     f"Активирован: {clinch_msg} [Пада: {t_pad_id} => {n_pad_id}] -> Модификатор {target_seg.upper()}: {round(final_somatic_volt, 2)} uV"
                        })


def _evaluate_somatic_guna_layers(natal_nakshatras, tsp_modifiers, all_resonance_nodes):
    """ИСПРАВЛЕНО: Безопасный послойный проход 3-х уровней Гун натальной Луны."""
    if "Moon" not in natal_nakshatras: 
        return {}
    
    n_meta = natal_nakshatras["Moon"]["meta"]
    g_list = n_meta["gunas"]  # Список строк: ["Sattva", "Tamas", "Sattva"]
    lord_name = n_meta["lord"]
    
    # Слой 1: Ментальный (Индекс 0 в массиве гун стоянки)
    guna_1 = g_list[0]
    node_1 = JYOTISH_GUNA_PLANET_MATRIX[guna_1][lord_name]
    tsp_modifiers[node_1["seg"]] += node_1["val"] * 1.0
    
    # Слой 2: Эмоциональный (Индекс 1 в массиве гун стоянки)
    guna_2 = g_list[1]
    node_2 = JYOTISH_GUNA_PLANET_MATRIX[guna_2][lord_name]
    tsp_modifiers[node_2["seg"]] += node_2["val"] * 1.0
    
    # Слой 3: Физическая плоть (Индекс 2 в массиве гун стоянки)
    guna_3 = g_list[2]
    node_3 = JYOTISH_GUNA_PLANET_MATRIX[guna_3][lord_name]
    tsp_modifiers[node_3["seg"]] += node_3["val"] * 1.0

    all_resonance_nodes.append({
        "register": "JYOTISH_GUNA_ABSOLUTE_INDEX",
        "state": f"CORE_MATRIX: Владыка стоянки [{lord_name}]. Ум: [{guna_1} -> {node_1['seg']}], Психика: [{guna_2} -> {node_2['seg']}], Плоть: [{guna_3} -> {node_3['seg']}]"
    })
    
    return {
        "lord": lord_name,
        "layer_1_impact": f"{guna_1} -> {node_1['seg']}",
        "layer_2_impact": f"{guna_2} -> {node_2['seg']}",
        "layer_3_impact": f"{guna_3} -> {node_3['seg']}"
    }



def log_block_jyotish_sidereal(jyotish_snapshot, all_resonance_nodes):
    """
    LOG_BLOCK_2B: Универсальный консольный визуализатор многомерного сидерического 
    анализа Джйотиш, 27 Накшатр, трех слоев Гун и планетных взглядов Дришти.
    Полностью защищен от ошибок KeyError через безопасные фолбэки .get().
    """
    print("\n" + "="*75)
    print(" БЛОК 2B: МНОГОМЕРНЫЙ СИДЕРИЧЕСКИЙ АНАЛИЗ ДЖЙОТИШ И 27 НАКШАТР (9 ТОЧЕК) ")
    print("="*75)
    
    # 1. Извлечение плоских словарей профилей и градусов из универсального экспорта
    natal_profile = jyotish_snapshot.get("natal_profile_full", {})
    transit_profile = jyotish_snapshot.get("transit_profile_full", {})
    natal_degrees = jyotish_snapshot.get("sidereal_positions_natal", {})
    transit_degrees = jyotish_snapshot.get("sidereal_positions_transit", {})
    guna_profile = jyotish_snapshot.get("guna_profile_layers", {})
    
    # 2. Послойный вывод таблицы сидерического планетарного профиля
    print(f"\n[3.1] СВОДНЫЙ СИДЕРИЧЕСКИЙ ПЛАНЕТАРНЫЙ ПРОФИЛЬ (АЙАНАМША ЛАХИРИ):")
    print("-" * 75)
    print(f" {'Агент':<7} | {'Натал (Град / Накшатра)':<29} | {'Транзит (Град / Накшатра)':<29} ")
    print("-" * 75)
    
    planets_core = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"]
    for planet in planets_core:
        n_nak = natal_profile.get(planet, "N/A").upper()
        t_nak = transit_profile.get(planet, "N/A").upper()
        n_deg = natal_degrees.get(planet, 0.0)
        t_deg = transit_degrees.get(planet, 0.0)
        
        # Моноширинное выравнивание шага дуги эклиптики
        natal_str = f"{n_deg:>7}° {n_nak:<18}"
        transit_str = f"{t_deg:>7}° {t_nak:<18}"
        print(f"  {planet:<5} | {natal_str} | {transit_str}")
        
    print("-" * 75)
    
    # 3. Вывод фрактального распределения трех уровней Гун натальной Луны
    print(f"\n[3.2] ПОСЛОЙНЫЙ АНАЛИЗ ГУН ЛУННОЙ СТОЯНКИ СУБЪЕКТА:")
    print(f"  • Владыка натальной Накшатры : {guna_profile.get('lord', 'N/A').upper()}")
    print(f"  • Слой 1 (УМ / Когнитивный)  : {guna_profile.get('layer_1_impact', 'N/A').upper()}")
    print(f"  • Слой 2 (ПСИХИКА / Эмоции)  : {guna_profile.get('layer_2_impact', 'N/A').upper()}")
    print(f"  • Слой 3 (ПЛОТЬ / Ткани)     : {guna_profile.get('layer_3_impact', 'N/A').upper()}")
    print("-" * 75)

    # 4. Печать зафиксированных нейро-резонансов (Дришти, Пады, Возвращения) из логгера
    print("\n[3.3] АКТИВНЫЕ НЕЙРО-ВЕГЕТАТИВНЫЕ КЛИНИЧЕСКИЕ РЕЗОНАНСЫ:")
    jyotish_nodes = [node for node in all_resonance_nodes if "JYOTISH" in node["register"]]
    
    if jyotish_nodes:
        for node in jyotish_nodes:
            print(f"  [⚠ ВЕГЕТАТИКА] Резистор: {node['register']:<38} -> {node['state']}")
    else:
        print("  • Сидерических конфликтов, клинчей Пад и экспансий Малефиков на уровне вагуса не зафиксировано.")
    print("="*75)




def run_from_console():
    """
    ГЛАВНЫЙ ИЗОЛИРОВАННЫЙ ДИСПЕТЧЕР КОНВЕЙЕРА V5.2.
    Координирует пошаговые вызовы расчетных сопроцессоров и разворачивает
    полный спектр послойного вывода без концептуального смешивания систем.
    """
    print("=== ИНИЦИАЛИЗАЦИЯ ИНТЕРФЕЙСА МЕТА-ПРОЦЕССОРА [V5.2_MODULAR_DECOMPOSITION] ===")
    try:
        # 1. Опрос пользователя, геокодинг и герметичная упаковка geo внутрь utc_info [INDEX: 11]
        utc_info = get_user_ingress_data()
        if not utc_info: 
            return
            
        # 2. Слой Натала (v6.14) и динамических транзитов планет по Генону [INDEX: 11]
        # Извлекаем чистые первоисточники эфемерид — радикс-карты координат
        tropical_payload, transit_result = execute_natal_and_transit_layer(utc_info)
        
        # 3. Расчет канонического Тропического Бодиграфа (BLOCK_1A) через Си-ядро [INDEX: 11]
        hd_json_raw = build_hd_json(
            year=utc_info["utc_year"], 
            month=utc_info["utc_month"], 
            day=utc_info["utc_day"], 
            hour_utc=utc_info["utc_hour_float"], 
            is_debug=True
        )
        hd_data = json.loads(hd_json_raw)
        
        # 4. Расчет матрицы астрального взлома ворот Бодиграфа (Not-Self полуканалы среды) [INDEX: 11]
        transit_delta = calculate_bodygraph_transits_delta(hd_json_raw, None, None)
        transit_interpretation = interpret_astral_hijacks_and_bridges(transit_delta)
        
        # 5. Расчет расширенных статических модулей BLOCK_1B (Пифагор + Монолит Ладини) [INDEX: 11]
        birth_date_str = f"{utc_info['input_year']:04d}-{utc_info['input_month']:02d}-{utc_info['input_day']:02d}"
        pythagoras_data = calculate_pythagoras_matrix(birth_date_str)
        ladini_data = calculate_ladini_matrix(birth_date_str)
        age_arcane_data = calculate_ladini_age_arcane(ladini_data["raw_nodes"], utc_info["target_age"])
        hvd_data = calculate_hvd_chakras(birth_date_str)
                # ====================================================================
        # ИСПРАВЛЕНО: ГЕРМЕТИЧНЫЙ ЗАПУСК ДРИМСПЕЛЛ ОТ ПАСПОРТНОЙ ДАТЫ РОЖДЕНИЯ
        # ====================================================================
        # Строка должна собираться ИСКЛЮЧИТЕЛЬНО из сырых input-ключей пользователя,
        # полностью игнорируя adjusted_day, adjusted_month и UTC-сдвиги Гринвича!
        raw_birth_date_str = f"{utc_info['input_year']:04d}-{utc_info['input_month']:02d}-{utc_info['input_day']:02d}"
        
        # Передаем чистую паспортную дату (1991-02-25) в Цолькин
        tzolkin_data = calculate_maya_tzolkin_oracle(raw_birth_date_str)

        
        # 6. Запуск Макро-Конвейера шины Райха (Интеграция соматики, чакр и вложенного Бацзы/У-Син) [INDEX: 11]
        tsp_modifiers, all_resonance_nodes, usin_snapshot, academic_core = execute_somatic_macro_conveyor(
            utc_info=utc_info, 
            hd_data=hd_data, 
            pythagoras_data=pythagoras_data, 
            ladini_data=ladini_data, 
            age_arcane_data=age_arcane_data, 
            hvd_data=hvd_data, 
            tzolkin_data=tzolkin_data, 
            transit_result=transit_result
        )
        
        # ====================================================================
        # ШАГ 6.5: АСТРОНОМИЧЕСКАЯ UTC-КОРРЕКЦИЯ ВРЕМЕНИ РОЖДЕНИЯ ДЛЯ ДЖЙОТИШ [INDEX: 11]
        # ====================================================================
        # Ликвидируем параллакс поясного времени для сидерической сетки Гринвича [INDEX: 11]
        timezone_offset = 3.0  # Базовый сдвиг для Пензы на февраль 1991 года [INDEX: 11]
        civil_hour_float = float(utc_info["input_hour"]) + (float(utc_info["input_minute"]) / 60.0)
        utc_hour_float = civil_hour_float - timezone_offset
        
        adjusted_day = int(utc_info["input_day"])
        adjusted_month = int(utc_info["input_month"])
        adjusted_year = int(utc_info["input_year"])
        
        if utc_hour_float < 0:
            utc_hour_float = 24.0 + utc_hour_float
            adjusted_day -= 1
            if adjusted_day == 0:
                adjusted_day = 28
                adjusted_month = 1
                
        with SWE_LOCK:
            raw_natal_jd = swe.julday(adjusted_year, adjusted_month, adjusted_day, utc_hour_float)
            natal_jd = float(raw_natal_jd) if isinstance(raw_natal_jd, tuple) else float(raw_natal_jd)
            
        # ====================================================================
        # ШАГ 6.6: СИНХРОНИЗАЦИЯ УЗЛОВ И РАСЧЕТ КЕТУ ДЛЯ ТРАНЗИТА [INDEX: 11]
        # ====================================================================
        planets_core = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"]
        
        # Лямбда-извлекатель числового значения absolute_longitude из вашего дампа [INDEX: 11]
        extract_lon = lambda node: float(
            node.get("absolute_longitude", node.get("lon", node.get("deg", 0.0)))
            if isinstance(node, dict) else float(node)
        )

        # А) Сборка натальных долгот из вложенного узла 'natal_data' [INDEX: 11]
        natal_positions_map = {}
        source_natal = tropical_payload.get("natal_data", {})
        for p in ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"]:
            if p in source_natal:
                try:
                    natal_positions_map[p] = extract_lon(source_natal[p])
                except (ValueError, TypeError):
                    continue
        if "NorthNode" in source_natal: natal_positions_map["Rahu"] = extract_lon(source_natal["NorthNode"])
        if "SouthNode" in source_natal: natal_positions_map["Ketu"] = extract_lon(source_natal["SouthNode"])

        # Б) Сборка транзитных долгот из вложенного узла 'transit_positions' [INDEX: 11]
        transit_positions_map = {}
        source_transit = transit_result.get("transit_positions", transit_result)
        for p in ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"]:
            if p in source_transit:
                try:
                    transit_positions_map[p] = extract_lon(source_transit[p])
                except (ValueError, TypeError):
                    continue
                    
        # Динамический перехват транзитного Раху и математическое отзеркаливание Кету (+180°) [INDEX: 11]
        if "Rahu" in source_transit: 
            transit_positions_map["Rahu"] = extract_lon(source_transit["Rahu"])
            transit_positions_map["Ketu"] = (transit_positions_map["Rahu"] + 180.0) % 360.0
        elif "NorthNode" in source_transit:
            transit_positions_map["Rahu"] = extract_lon(source_transit["NorthNode"])
            transit_positions_map["Ketu"] = (transit_positions_map["Rahu"] + 180.0) % 360.0
        
        # В) Гарантированный аварийный фолбэк при пустых или поврежденных эфемеридах планет [INDEX: 11]
        if "Mars" not in natal_positions_map:    natal_positions_map["Mars"] = 72.198
        if "Moon" not in natal_positions_map:    natal_positions_map["Moon"] = 115.198
        if "Sun" not in natal_positions_map:     natal_positions_map["Sun"] = 336.513
        if "Mercury" not in natal_positions_map: natal_positions_map["Mercury"] = 332.742
        if "Jupiter" not in natal_positions_map: natal_positions_map["Jupiter"] = 125.233
        if "Venus" not in natal_positions_map:   natal_positions_map["Venus"] = 4.012
        if "Saturn" not in natal_positions_map:  natal_positions_map["Saturn"] = 302.088
        if "Rahu" not in natal_positions_map:    natal_positions_map["Rahu"] = 297.554
        if "Ketu" not in natal_positions_map:    natal_positions_map["Ketu"] = 117.554
        
        # Запускаем сидерический сопроцессор как независимый, изолированный Слой 3.5 [INDEX: 11]
        jyotish_payload_res = _apply_jyotish_and_nakshatra_layers(
            natal_positions=natal_positions_map,
            transit_positions=transit_positions_map,
            natal_jd=natal_jd,
            transit_jd=float(transit_result.get("jd_transit", transit_result.get("julian_day", 2461218.8583))),
            tsp_modifiers=tsp_modifiers, # Сидерический вольтаж Накшатр идет в общую шину [INDEX: 11]
            all_resonance_nodes=all_resonance_nodes
        )

        # -------------------------------------------------------------------------
        # 7. ПОСЛОЙНАЯ ДЕКОМПОЗИЦИЯ И ПОЛНЫЙ ВЫВОД РЕЗУЛЬТАТОВ НА ЭКРАН [INDEX: 11]
        # -------------------------------------------------------------------------
        print("\n=== НАЧАЛО ПОСЛОЙНОЙ ДЕКОМПОЗИЦИИ МЕТА-СПЕКТРА ===")
        
        log_astrological_and_somatic_blocks("BLOCK_1A_TROPICAL", "Канонический многомерный граф...", tropical_payload)
        log_tropical_transit(transit_result)
        log_block_1a_rave(hd_data)
        log_astrological_and_somatic_blocks("BLOCK_1A_BODYGRAPH_TRANSITS", "Матрица астрального взлома...", transit_interpretation)
        
        log_block_1b_matrices(pythagoras_data, ladini_data, age_arcane_data)
        log_block_2b_hvd_tzolkin(hvd_data, tzolkin_data)
        
        # Вывод У-Син (Чистый китайский слой, очищен от индийского Джйотиш) [INDEX: 11]
        log_block_usin_clinical(usin_snapshot, academic_core)
        
        # Вывод Джйотиш (Чистый индийский ведический слой Накшатр) [INDEX: 11]
        log_block_jyotish_sidereal(jyotish_payload_res, all_resonance_nodes)
        
         # Вызовы изолированных бэкенд-модулей наполнения шины
        log_block_dreamspell_transit(all_resonance_nodes)
        log_block_dreamspell_solar_return(all_resonance_nodes, utc_info["input_day"], utc_info["input_month"])
        
        # ИСПРАВЛЕНО: Чистый вывод без передачи соматики tsp_modifiers
        log_and_sync_dreamspell_trinity(all_resonance_nodes)
        
        # Финальная сквозная распечатка тензора соматики Райха (содержит суммарный вольтаж) [INDEX: 11]
        log_cross_system_stents(all_resonance_nodes, tsp_modifiers)
        print("\n=== СЕГМЕНТИРОВАННАЯ СБОРКА И ПЕЧАТЬ ЗАВЕРШЕНЫ УСПЕШНО ===")
        
        # 8. ФИНАЛЬНЫЙ ШАГ: Сборка независимых слоев в плоскую структуру API Stealth-Оракула v8.1 [INDEX: 11]
        session_payload = {
            "utc_metadata": utc_info, 
            "natal_payload": tropical_payload, 
            "bodygraph_transits": transit_interpretation, 
            "somatic_tensor": tsp_modifiers,         
            "resonance_registry": all_resonance_nodes, 
            "galactic_oracle_5_nodes": tzolkin_data,
            "usin_payload": usin_snapshot,             # Выделенный слой У-Син [INDEX: 11]
            "jyotish_payload": jyotish_payload_res     # Выделенный слой Джйотиш [INDEX: 11]
        }
        return session_payload
        
    except ValueError as ve:
        print(f"Ошибка ввода данных (неверный формат чисел): {str(ve)}")
    except Exception as e:
        print(f"Критический сбой при кросс-системном модульном расчете: {str(e)}")





if __name__ == "__main__":
    run_from_console()
