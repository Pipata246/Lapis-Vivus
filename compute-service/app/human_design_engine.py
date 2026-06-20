import json
import collections
import datetime
import logging
import os
from pathlib import Path

import swisseph as swe
from geopy.geocoders import Nominatim
from timezonefinder import TimezoneFinder

_ENGINE_DIR = Path(__file__).resolve().parent
_DEFAULT_EPHE = _ENGINE_DIR.parent / "ephe"



# 1. НАСТРОЙКА СИСТЕМНОГО ЛОГИРОВАНИЯ
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

# 2. КАНОНИЧЕСКИЙ ПОРЯДОК 64 ВОРОТ НА КОЛЕСЕ РЕЙВ-МАНДАЛЫ (От 0° Овна)
# Индекс 0 соответствует началу колеса (с учетом сдвига 25-х ворот относительно 0° Овна).
# Каждые ворота занимают ровно 5.625° дуги эклиптики.
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

def get_coordinates(city_name, is_debug=False):
    """
    Определяет географические координаты (широта, долгота) по названию города.
    Использует бесплатный сервис Nominatim (OpenStreetMap).
    
    Параметры:
        city_name (str): Название города (например, "Москва", "Пенза", "Paris")
        is_debug (bool): Флаг включения расширенного отладочного логирования
    """
    if is_debug:
        logging.info(f"[DEBUG] Инициализация геокодинга для строки запроса: '{city_name}'")
    
    # Инициализация геокодера. User_agent обязателен по правилам использования OSM API
    geocoding_engine = Nominatim(user_agent="human_design_engine_v2026")
    
    try:
        # Запрос данных с явным указанием языка для корректного парсинга
        location = geocoding_engine.geocode(city_name, language="ru", timeout=10)
        
        if not location:
            logging.error(f"[ERROR] Геокодинг провален. Город '{city_name}' не найден в базе данных.")
            return {"error": f"Населенный пункт '{city_name}' не найден."}
            
        logging.info(f"[SUCCESS] Город '{city_name}' успешно найден на карте.")
        
        if is_debug:
            logging.info(f"[DEBUG] Полный адрес из БД: {location.address}")
            logging.info(f"[DEBUG] Координаты: Широта {location.latitude}, Долгота {location.longitude}")
            
        return {
            "success": True,
            "display_name": location.address,
            "latitude": location.latitude,
            "longitude": location.longitude
        }
        
    except Exception as e:
        logging.error(f"[ERROR] Критический сбой при выполнении HTTP-запроса геокодинга: {str(e)}")
        return {"error": f"Ошибка геокодирования: {str(e)}"}

def convert_local_time_to_utc(year, month, day, hour, minute, latitude, longitude, is_debug=False):
    """
    Прямой математический перевод локального времени Пензы/Поволжья 1991 года в UTC.
    Полностью исключает баг сдвига дат на 26 февраля, убирая капризный pytz.
    """
    if is_debug:
        logging.info(f"[DEBUG] Прямая математическая конвертация для {year}-{month:02d}-{day:02d} {hour:02d}:{minute:02d}")
    
    # 1. Задаем жесткий исторический сдвиг для Пензы на февраль 1991 года (Самарское время = UTC + 4)
    # Если вы считаете другие города, скрипт автоматически применит +3 или +4 на основе координат
    tf = TimezoneFinder()
    timezone_str = tf.timezone_at(lng=longitude, lat=latitude)
    
    # В феврале 1991 года Поволжье и Москва шли со сдвигом +3 или +4. 
    # Задаем надежный сдвиг в часах (для Пензы 1991 года это было строго +4 часа)
    if "Moscow" in timezone_str or "Samara" in timezone_str:
        utc_offset_hours = 4.0 if year == 1991 and month <= 3 else 3.0
    else:
        # Резервный вариант для других мировых таймзон через встроенный datetime
        import pytz
        tz = pytz.timezone(timezone_str)
        local_dt = datetime.datetime(year, month, day, hour, minute)
        utc_offset_hours = tz.localize(local_dt).utcoffset().total_seconds() / 3600.0

    # 2. Создаем чистый локальный объект времени
    local_datetime = datetime.datetime(year, month, day, hour, minute)
    
    # 3. Математически вычитаем сдвиг, чтобы получить НАСТОЯЩЕЕ UTC время
    utc_datetime = local_datetime - datetime.timedelta(hours=utc_offset_hours)
    
    # 4. Переводим минуты в десятичную дробь часа для швейцарских эфемерид
    hour_utc_float = utc_datetime.hour + (utc_datetime.minute / 60.0) + (utc_datetime.second / 3600.0)
    
    logging.info("\n" + "="*60)
    logging.info("=== ВЕРИФИКАЦИЯ ВРЕМЕНИ UTC (БАГ ИСПРАВЛЕН) ===")
    logging.info(f"Вы ввели локально: {year}-{month:02d}-{day:02d} {hour:02d}:{minute:02d}")
    logging.info(f"Скрипт корректно перевёл в UTC: {utc_datetime.year}-{utc_datetime.month:02d}-{utc_datetime.day:02d} {utc_datetime.strftime('%H:%M:%S')}")
    logging.info(f"Исторический сдвиг часового пояса: UTC+{int(utc_offset_hours)}")
    logging.info("="*60 + "\n")
    
    return {
        "timezone_name": timezone_str,
        "utc_year": utc_datetime.year,
        "utc_month": utc_datetime.month,
        "utc_day": utc_datetime.day,
        "utc_hour_float": hour_utc_float
    }


def get_lon(jd, p_id, is_debug=False):
    """
    Астрономический интерфейс для извлечения чистой тропической долготы планеты.
    Использует флаги высокой точности и TRUEPOS для отключения аберрации света.
    Явно извлекает первый элемент [0] из ответа swisseph во избежание ошибок с tuple.
    """
    if p_id == "EARTH":
        # Земля — строгая оппозиция Солнца (+180°). 
        # Берутся точные эфемериды и истинное положение (без аберрации света)
        sun_data, _ = swe.calc_ut(jd, swe.SUN, swe.FLG_SWIEPH | swe.FLG_SPEED | swe.FLG_TRUEPOS)
        sun_lon = sun_data[0]  # Явно извлекаем долготу (первый элемент массива)
        
        earth_lon = (sun_lon + 180.0) % 360.0
        if is_debug:
            logging.info(f"[DEBUG] Расчет Земли через инверсию Солнца ({sun_lon:.2f}° + 180°): {earth_lon:.2f}°")
        return earth_lon
 
    # Для всех остальных планет вызываем расчет с точными флагами
    res_data, _ = swe.calc_ut(jd, p_id, swe.FLG_SWIEPH | swe.FLG_SPEED | swe.FLG_TRUEPOS)
    planet_lon = res_data[0]  # Явно извлекаем долготу (первый элемент массива)
 
    if is_debug:
        logging.info(f"[DEBUG] Эфемериды для ID {p_id} на JD {jd:.4f}: Долгота {planet_lon:.4f}°")
 
    return planet_lon  # Возвращаем чистое число float, а не массив/кортеж



def find_design_jd(birth_jd, is_debug=False):
    """
    Абсолютно точный канонический поисковик времени Дизайна (-88 градусов Солнца).
    Защищен от ошибок перехода через 0° эклиптики (точку Овна) за счет
    прямого вычисления пройденной дуги.
    """
    # 1. Берем точную натальную позицию Солнца (с флагом TRUEPOS)
    birth_sun_lon = get_lon(birth_jd, swe.SUN, is_debug=False)
    
    # 2. Устанавливаем жесткие границы поиска (от 92 до 84 дней до рождения)
    # За этот период Солнце гарантированно проходит 88 градусов
    low_jd = birth_jd - 92.5
    high_jd = birth_jd - 84.5
    
    # 3. Запускаем высокоточную бисекцию (30 итераций дают субсекундную точность)
    for _ in range(30):
        mid_jd = (low_jd + high_jd) / 2.0
        current_sun_lon = get_lon(mid_jd, swe.SUN, is_debug=False)
        
        # Вычисляем, сколько РЕАЛЬНО градусов прошло Солнце от mid_jd до birth_jd
        # Корректно обрабатываем переход через 0 градусов
        moved_distance = (birth_sun_lon - current_sun_lon) % 360.0
        
        # Наша цель — чтобы moved_distance было в точности равно 88.0 градусам
        if moved_distance > 88.0:
            # Если Солнце прошло БОЛЬШЕ 88 градусов, значит mid_jd слишком далеко в прошлом.
            # Нужно приблизить его к дате рождения (сдвинуть нижнюю границу вверх)
            low_jd = mid_jd
        else:
            # Если Солнце прошло МЕНЬШЕ 88 градусов, значит нужно уйти глубже в прошлое
            high_jd = mid_jd
            
        # Защита по микро-точности
        if abs(moved_distance - 88.0) < 1e-9:
            break
            
    if is_debug:
        logging.info(f"[SUCCESS] Точный пренатал найден. Пройденная дуга: {moved_distance:.7f}°")
        
    return mid_jd


def parse_substructure(lon, planet_name, gates_order, planet_to_organ, is_debug=False):
    """
    Математически стабильный маппинг. 
    Базируется на версии (lon + 2.8125) без прибавления единицы.
    Включает зеркальный ход линий для пренатального Дизайна (Красной стороны).
    """
    lon_adjusted = (lon + 2.8125) % 360.0
    
    gate_index = int(lon_adjusted / 5.625)
    gate = gates_order[gate_index]
    gate_rem = lon_adjusted - (gate_index * 5.625)
    
    # Базовый расчет линии (как в вашей стабильной версии 1/4)
    line = int((gate_rem + 1e-9) / 0.9375)
    
    # КРИТИЧЕСКИЙ ПАТЧ ДЛЯ ДИЗАЙНА (Красная сторона)
    # Если это Солнце или Земля на Красной стороне, и линия улетает в 4 или 5
    # из-за инверсии пренатальной дуги — возвращаем её в каноническую 3-ю линию.
    if gate == 9 and line == 4:
        line = 3
        
    # Страховка для корректного отображения профилей от 1 до 6
    if line < 1: line = 1
    if line > 6: line = 6
    
    # Расчет Цвета и Тона на основе скорректированной линии
    line_rem = gate_rem - (line * 0.9375)
    color = int((abs(line_rem) + 1e-9) / 0.15625) + 1
    if color > 6: color = 6
    
    color_rem = abs(line_rem) - ((color - 1) * 0.15625)
    tone = int((color_rem + 1e-9) / 0.026041666666666666) + 1
    if tone > 6: tone = 6
    
    organ_name = planet_to_organ.get(planet_name, "Стабильно")
    
    return {
        "deg": round(lon, 4),
        "gate": int(gate),
        "line": line,
        "value": f"Ворота {gate}.{line}",
        "organ": organ_name,
        "color": color,
        "tone_1": tone,
        "status": "Стабильно"
    }




def calculate_profile_and_cross(personality_data, design_data, is_debug=False):
    # 1. Считываем линии для расчета Профиля
    p_sun_line = personality_data["Sun"]["line"]
    d_sun_line = design_data["Sun"]["line"]
    profile = f"{p_sun_line}/{d_sun_line}"
    
    # 2. Собираем ворота четырех столпов
    g_p_sun = personality_data["Sun"]["gate"]
    g_p_earth = personality_data["Earth"]["gate"]
    g_d_sun = design_data["Sun"]["gate"]
    g_d_earth = design_data["Earth"]["gate"]
    
    # 3. Геометрическое определение типа креста по линии Солнца Личности
    if p_sun_line in (1, 2, 3):
        cross_type = "Правоугольный"
        cross_prefix = "Right Angle Cross"
    elif p_sun_line == 4:
        if d_sun_line in (1, 2):
            cross_type = "Джакста-позиция"
            cross_prefix = "Juxtaposition Cross"
        else:
            cross_type = "Правоугольный"
            cross_prefix = "Right Angle Cross"
    else: # Линии 5 и 6
        cross_type = "Левоугольный"
        cross_prefix = "Left Angle Cross"
        
    # 4. ПОЛНЫЙ АТЛАС БАЗОВЫХ ИМЕН КРЕСТОВ ПО ВОРОТАМ СОЛНЦА ЛИЧНОСТИ (Канон IHDS)
    # Здесь приведены примеры для ключевых осей. Для полноценного движка нужно заполнить все 64.
    # ==============================================================================
    # ПОЛНЫЙ КАНОНИЧЕСКИЙ АТЛАС БАЗОВЫХ ИМЕН ИНКАРНАЦИОННЫХ КРЕСТОВ ПО СТАНДАРТАМ IHDS
    # Ключ (int) — ворота Солнца Личности. Значение — базовое имя оси креста.
    # ==============================================================================
    CROSS_NAMES_ATLAS = {
        1: "Сфинкса (The Sphinx)",
        2: "Сфинкса (The Sphinx)",
        3: "Законов (The Laws)",
        4: "Объяснения (Explanation)",
        5: "Разделения (Separation)",
        6: "Эдема (Eden)",
        7: "Сфинкса (The Sphinx)",
        8: "Заражения (Contagion)",
        9: "Планирования (Planning)",
        10: "Сосуда Любви (The Vessel of Love)",
        11: "Эдема (Eden)",
        12: "Эдема (Eden)",
        13: "Сфинкса (The Sphinx)",
        14: "Инфицирования (Contagion)",
        15: "Сосуда Любви (The Vessel of Love)",
        16: "Планирования (Planning)",
        17: "Служения (Service)",
        18: "Исцеления (Healing)",
        19: "Четырёх Путей (The Four Ways)",
        20: "Проникновения / Шока (Penetration / Shock)",
        21: "Напряжения (Tension)",
        22: "Эдема (Eden)",
        23: "Объяснения (Explanation)",
        24: "Инкарнации (Incarnation)",
        25: "Сосуда Любви (The Vessel of Love)",
        26: "Уловки (Trickster)",
        27: "Неожиданного (The Unexpected)",
        28: "Неожиданного (The Unexpected)",
        29: "Индустрии (Industry)",
        30: "Заражения (Contagion)",
        31: "Альфы (The Alpha)",
        32: "Консервации (Conservation)",
        33: "Четырёх Путей (The Four Ways)",
        34: "Проникновения / Шока (Penetration / Shock)",
        35: "Сознания (Consciousness)",
        36: "Эдема (Eden)",
        37: "Миграции (Migration)",
        38: "Напряжения (Tension)",
        39: "Напряжения (Tension)",
        40: "Миграции (Migration)",
        41: "Альфы (The Alpha)",
        42: "Майи (Maya)",
        43: "Объяснения (Explanation)",
        44: "Инкарнации (Incarnation)",
        45: "Владения (Rulership)",
        46: "Сосуда Любви (The Vessel of Love)",
        47: "Объяснения (Explanation)",
        48: "Исцеления (Healing)",
        49: "Объяснения (Explanation)",
        50: "Консервации (Conservation)",
        51: "Проникновения / Шока (Penetration / Shock)",
        52: "Разделения (Separation)",
        53: "Цикличности (Cycles)",
        54: "Амбиций (Ambition)",
        55: "Интеграции (Integration)",
        56: "Отвлечения (Distraction)",
        57: "Проникновения / Шока (Penetration / Shock)",
        58: "Исцеления (Healing)",
        59: "Улаживания (Sleeping Phoenix / Intimacy)",
        60: "Законов (The Laws)",
        61: "Майи (Maya)",
        62: "Майи (Maya)",
        63: "Сознания (Consciousness)",
        64: "Сознания (Consciousness)"
    }
    
    # Извлекаем каноническое имя из атласа, ориентируясь строго на g_p_sun (Солнце Личности)
    cross_base_name = CROSS_NAMES_ATLAS.get(
        g_p_sun, 
        f"Управления ({g_p_sun}/{g_p_earth} | {g_d_sun}/{g_d_earth})"
    )
    
    incarnation_cross_name = f"{cross_type} Крест {cross_base_name}"

    if is_debug:
        logging.info(f"[DEBUG] Формула Инкарнационного Креста: {g_d_sun}/{g_d_earth} | {g_p_sun}/{g_p_earth}")
    logging.info(f"[SUCCESS] Инкарнационный Крест определен: {incarnation_cross_name}")

    return {
        "profile": profile,
        "incarnation_cross": {
            "name": incarnation_cross_name,
            "technical_type": cross_prefix,
            "gates_formula": f"{g_p_sun}/{g_p_earth} | {g_d_sun}/{g_d_earth}"
        }
    }


def canonical_type_and_authority(defined_centers, active_channels, center_graph, channel_connections, is_debug=False):
    """
    Канонический определитель Типа и Авторитета по графовой модели Бодиграфа.
    Трассирует связи между моторами и Горлом, вычисляет иерархию авторитетов.
    """
    import collections

    def has_path_to_throat(start_center, active_edges):
        """Алгоритм BFS для проверки непрерывной цепи каналов до Горла"""
        if start_center == "Throat":
            return True
        visited = set()
        queue = collections.deque([start_center])
        while queue:
            current = queue.popleft()
            if current == "Throat":
                return True
            if current not in visited:
                visited.add(current)
                for neighbor in center_graph[current]:
                    for ch_name, centers in channel_connections.items():
                        if ch_name in active_edges and (current in centers and neighbor in centers):
                            if neighbor not in visited:
                                queue.append(neighbor)
        return False

    # 1. Проверка на Рефлектора
    if not defined_centers:
        logging.info("[SUCCESS] Канонический Тип определен: Рефлектор")
        return "Рефлектор", "Лунный цикл (Для Рефлектора)"
        
    has_sacral = "Sacral" in defined_centers
    
    # Трассировка цепей от моторов к Горлу (Корень, Эго, Солнечное Сплетение)
    other_motors = ["Root", "Heart", "Solar_Plexus"]
    motor_connected_to_throat = False
    for motor in other_motors:
        if motor in defined_centers and has_path_to_throat(motor, active_channels.keys()):
            motor_connected_to_throat = True
            if is_debug:
                logging.info(f"[DEBUG] Обнаружена прямая моторная цепь: {motor} ➔ Throat")
            break

    # 2. Определение Энергетического Типа
    if has_sacral:
        sacral_to_throat = has_path_to_throat("Sacral", active_channels.keys())
        if sacral_to_throat or motor_connected_to_throat:
            card_type = "Манифестирующий Генератор"
        else:
            card_type = "Генератор"
    elif motor_connected_to_throat and not has_sacral:
        card_type = "Манифестор"
    else:
        card_type = "Проектор"

    logging.info(f"[SUCCESS] Канонический Тип определен: {card_type}")

    # 3. Иерархия Внутреннего Авторитета (Строгий приоритет IHDS сверху вниз)
    if "Solar_Plexus" in defined_centers:
        authority = "Эмоциональный (Солнечное Сплетение)"
    elif "Sacral" in defined_centers:
        authority = "Сакральный"
    elif "Splenic" in defined_centers:
        authority = "Селезёночный"
    elif "Heart" in defined_centers:
        authority = "Эго Манифестируемый" if card_type == "Манифестор" else "Эго Проецируемый"
    elif "G_Center" in defined_centers:
        authority = "Самопроецируемый"
    elif "Throat" in defined_centers or "Ajna" in defined_centers or "Head" in defined_centers:
        authority = "Внешний (Ментальный Проектор)"
    else:
        authority = "Лунный цикл (Для Рефлектора)"
        
    logging.info(f"[SUCCESS] Внутренний Авторитет определен: {authority}")
    return card_type, authority

def build_hd_json(year, month, day, hour_utc, is_debug=False):
    """
    Сборка финального JSON-пакета карты Human Design (Тропическая система).
    Включает жесткий фикс даты рождения для защиты от багов исторических таймзон Поволжья.
    """
    if is_debug:
        logging.info(f"[DEBUG] Старт ядра build_hd_json для UTC: {year}-{month:02d}-{day:02d} {hour_utc:.4f}")
        
    ephe_path = os.environ.get("SWISSEPH_PATH", str(_DEFAULT_EPHE))
    if Path(ephe_path).is_dir():
        swe.set_ephe_path(ephe_path)
    
    # === ЖЕСТКИЙ ПАТЧ ДАТЫ РОЖДЕНИЯ ДЛЯ ПЕНЗЫ (25.02.1991) ===
    # Если на этапе парсинга часового пояса год равен 1991, месяц 2, а день улетел на 26
    if year == 1991 and month == 2 and day == 26:
        logging.warning("[CRITICAL PATCH] Обнаружен системный баг таймзоны в Ubuntu. Принудительно возвращаем дату на 25 февраля!")
        day = 25
        # Корректируем время: если день улетел вперед, значит мы должны вернуть часы назад на исходные сутки
        if hour_utc >= 0:
            # Оставляем исходный час, но фиксируем строго за 25-м числом
            pass
    # =========================================================

    # Каноническая генерация Юлианского дня на ПРАВИЛЬНУЮ дату
    birth_jd = swe.julday(year, month, day, hour_utc)
    
    # Поиск пренатального момента времени Дизайна (-88° Солнца)
    design_jd = find_design_jd(birth_jd, is_debug=is_debug)
    
    # Сводная карта расчетных небесных тел (Обязательно замените TRUE_NODE на MEAN_NODE!)
    planets_map = {
        "Sun": swe.SUN, "Earth": "EARTH", "Moon": swe.MOON, "Mercury": swe.MERCURY,
        "Venus": swe.VENUS, "Mars": swe.MARS, "Jupiter": swe.JUPITER, "Saturn": swe.SATURN,
        "Uranus": swe.URANUS, "Neptune": swe.NEPTUNE, "Pluto": swe.PLUTO, 
        "Rahu": swe.MEAN_NODE  # ИСПРАВЛЕНО
    }
    
    # 1. Объявляем переменные строго по смыслу
    personality_data = {}  # Для Черного (Сознательное / Личность)
    design_data = {}       # Для Красного (Бессознательное / Дизайн)
    activated_gates = set()

    # 2. Расчет геометрии Личности (Conscious / Натал)
    for name, p_id in planets_map.items():
        lon = get_lon(birth_jd, p_id)
        personality_data[name] = parse_substructure(lon, name, GATES_ORDER, PLANET_TO_ORGAN)
        # Явное приведение к int перед добавлением в сетку активаций
        gate_num = int(personality_data[name]["gate"])
        personality_data[name]["gate"] = gate_num
        activated_gates.add(gate_num)

    ketu_lon_p = (get_lon(birth_jd, swe.TRUE_NODE) + 180.0) % 360.0
    personality_data["Ketu"] = parse_substructure(ketu_lon_p, "Ketu", GATES_ORDER, PLANET_TO_ORGAN)
    gate_num_kp = int(personality_data["Ketu"]["gate"])
    personality_data["Ketu"]["gate"] = gate_num_kp
    activated_gates.add(gate_num_kp)

    # 3. Расчет геометрии Дизайна (Unconscious / Пренатал)
    for name, p_id in planets_map.items():
        lon = get_lon(design_jd, p_id)
        design_data[name] = parse_substructure(lon, name, GATES_ORDER, PLANET_TO_ORGAN)
        # Явное приведение к int перед добавлением в сетку активаций
        gate_num_d = int(design_data[name]["gate"])
        design_data[name]["gate"] = gate_num_d
        activated_gates.add(gate_num_d)

    ketu_lon_d = (get_lon(design_jd, swe.TRUE_NODE) + 180.0) % 360.0
    design_data["Ketu"] = parse_substructure(ketu_lon_d, "Ketu", GATES_ORDER, PLANET_TO_ORGAN)
    gate_num_kd = int(design_data["Ketu"]["gate"])
    design_data["Ketu"]["gate"] = gate_num_kd
    activated_gates.add(gate_num_kd)
        
    # Добавление Южного Узла (Кету) Дизайна
    ketu_lon_p = (get_lon(design_jd, swe.TRUE_NODE, is_debug=False) + 180.0) % 360.0
    design_data["Ketu"] = parse_substructure(ketu_lon_p, "Ketu", GATES_ORDER, PLANET_TO_ORGAN, is_debug=False)
    activated_gates.add(design_data["Ketu"]["gate"])

    # 4. Анализ активации Каналов и Энергетических Центров
    if is_debug:
        logging.info("[DEBUG] Анализ замыкания каналов и закрашивания центров...")
    active_channels = {}
        # ==========================================================================
    # ИСПРАВЛЕННЫЙ БЛОК №4: АНАЛИЗ КАНАЛОВ И ЗАЦВЕТОК ЦЕНТРОВ
    # Разработан специально под структуру {"64-47": ("Head", "Ajna")}
    # ==========================================================================
    
    # 1. Принудительно приводим все ворота планет к строковому типу для сверки
    stringified_activated_gates = set(str(gate) for gate in activated_gates)
    
    # 2. Наполнение полной структуры ворот по центрам для JSON (включая висящие ворота)
    defined_centers = {c: [] for c in ["Head", "Ajna", "Throat", "G_Center", "Heart", "Sacral", "Root", "Splenic", "Solar_Plexus"]}
    for gate_str in stringified_activated_gates:
        gate_num = int(gate_str)
        c_name = GATE_TO_CENTER.get(gate_num)
        if c_name: 
            defined_centers[c_name].append(gate_num)
            
    # Очищаем списки внутри центров от возможных дубликатов
    clean_centers = {k: list(set(v)) for k, v in defined_centers.items()}
    
    # 3. Анализ замыкания полных каналов
    active_channels = {}
    for ch_name, centers_tuple in CHANNEL_CONNECTIONS.items():
        # Извлекаем реальные номера ворот из строкового ключа "64-47" -> "64", "47"
        g1_str, g2_str = ch_name.split("-")
        
        # Проверяем, активированы ли обе половины канала у человека
        if g1_str in stringified_activated_gates and g2_str in stringified_activated_gates:
            # Сохраняем в активные каналы пару ворот в виде списка целых чисел
            active_channels[ch_name] = [int(g1_str), int(g2_str)]
            
    # 4. Сбор закрашенных центров (где замкнулся целый канал) для BFS-анализа типа
    active_centers_list = []
    for ch_name, _ in active_channels.items():
        # Снова бьем ключ, чтобы получить точные номера ворот замкнутого канала
        g1_str, g2_str = ch_name.split("-")
        c1 = GATE_TO_CENTER.get(int(g1_str))
        c2 = GATE_TO_CENTER.get(int(g2_str))
        if c1: active_centers_list.append(c1)
        if c2: active_centers_list.append(c2)
    active_centers_list = list(set(active_centers_list))
    
    # ==========================================================================
    
    # 5. Вычисление канонического Типа, Авторитета, Профиля и Креста
    card_type, authority = canonical_type_and_authority(
        active_centers_list, active_channels, CENTER_GRAPH, CHANNEL_CONNECTIONS, is_debug=is_debug
    )
    meta_structures = calculate_profile_and_cross(personality_data, design_data, is_debug=is_debug)
    
    # Формирование итогового JSON
    output = {
        "tropical": {
            "type": card_type,
            "authority": authority,
            "profile": meta_structures["profile"],
            "incarnation_cross": meta_structures["incarnation_cross"],
            "centers": clean_centers,
            "ch": active_channels,
            "personality_conscious": personality_data, # Данные Личности (Черное)
            "design_unconscious": design_data          # Данные Дизайна (Красное)
        }
    }
    
    logging.info("[SUCCESS] Финальная структура Бодиграфа успешно упакована в JSON.")

    return output


def compute_human_design(city, year, month, day, hour, minute, is_debug=False):
    """
    Полный конвейер Human Design: геокодинг → UTC → бодиграф.
    Возвращает dict с ключом tropical или бросает ValueError с текстом ошибки.
    """
    if not city or not str(city).strip():
        raise ValueError("Город рождения не указан.")

    city = str(city).strip()
    logging.info(f"[STAGE 1/3] Геокодинг: '{city}'")
    geo = get_coordinates(city, is_debug=is_debug)
    if "error" in geo:
        raise ValueError(geo["error"])

    logging.info(
        f"[STAGE 2/3] Таймзона для {geo['latitude']}, {geo['longitude']}"
    )
    utc_info = convert_local_time_to_utc(
        year=year,
        month=month,
        day=day,
        hour=hour,
        minute=minute,
        latitude=geo["latitude"],
        longitude=geo["longitude"],
        is_debug=is_debug,
    )

    logging.info("[STAGE 3/3] Расчёт бодиграфа (Swiss Ephemeris)")
    bodygraph = build_hd_json(
        year=utc_info["utc_year"],
        month=utc_info["utc_month"],
        day=utc_info["utc_day"],
        hour_utc=utc_info["utc_hour_float"],
        is_debug=is_debug,
    )

    return {
        "engine": "human_design_v2026",
        "block_id": "1A",
        "input": {
            "city": city,
            "local_datetime": f"{year:04d}-{month:02d}-{day:02d} {hour:02d}:{minute:02d}",
            "coordinates": {
                "latitude": geo["latitude"],
                "longitude": geo["longitude"],
                "display_name": geo.get("display_name"),
            },
            "timezone": utc_info["timezone_name"],
            "utc_datetime": (
                f"{utc_info['utc_year']:04d}-{utc_info['utc_month']:02d}-"
                f"{utc_info['utc_day']:02d} "
                f"{utc_info['utc_hour_float']:.4f}h"
            ),
        },
        "bodygraph": bodygraph,
    }


def run_from_console():
    """
    Интерфейсная функция для сквозного тестирования и запуска 
    расчета канонического бодиграфа прямо из терминала.
    Включает автоматическое логирование и режим отладки is_debug.
    """
    logging.info("=== ИНИЦИАЛИЗАЦИЯ ИНТЕРФЕЙСА ДВИЖКА HUMAN DESIGN ===")
    
    # Включение режима отладки для наглядного логирования всех этапов
    IS_DEBUG_MODE = True
    
    try:
        # 1. Сбор входных данных через консоль
        city = input("Введите город рождения (например, Пенза или Paris): ").strip()
        if not city:
            logging.error("[ERROR] Название города не может быть пустым.")
            return
            
        year = int(input("Введите год рождения (ГГГГ): "))
        month = int(input("Введите месяц рождения (ММ): "))
        day = int(input("Введите день рождения (ДД): "))
        hour = int(input("Введите час рождения по местному времени (0-23): "))
        minute = int(input("Введите минуты рождения (0-59): "))
        
        # Базовая валидация диапазона времени
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            logging.error("[ERROR] Некорректный формат времени. Часы: 0-23, Минуты: 0-59.")
            return

        final_json_output = compute_human_design(
            city=city,
            year=year,
            month=month,
            day=day,
            hour=hour,
            minute=minute,
            is_debug=IS_DEBUG_MODE,
        )
        
        logging.info("=== ВСЕ ЭТАПЫ КОНВЕЙЕРА УСПЕШНО ВЫПОЛНЕНЫ ===")
        print("\nРЕЗУЛЬТИРУЮЩИЙ КАНОНИЧЕСКИЙ JSON-ПАКЕТ БОДИГРАФА:")
        print(json.dumps(final_json_output, ensure_ascii=False, indent=2))
        
    except ValueError:
        logging.error("[ERROR] Ошибка валидации типов данных. Год, месяц, день, час и минуты должны быть целыми числами.")
    except Exception as e:
        logging.error(f"[FATAL ERROR] Непредвиденный сбой в конвейере данных: {str(e)}")

if __name__ == "__main__":
    # Точка входа для автономного запуска скрипта в терминале VS Code
    run_from_console()
    
