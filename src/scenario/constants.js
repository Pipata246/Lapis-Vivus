/** Шаги FSM — только сервер решает переходы */
import { getModuleMeta } from '../ui/modules.js';

export const STEPS = {
  MENU: 'menu',
  GENDER: 'gender',
  BIRTH_DATE: 'birth_date',
  BIRTH_TIME: 'birth_time',
  BIRTH_PLACE: 'birth_place',
  CONFIRM: 'confirm',
  BLOCK_PREP: 'block_prep',
  BLOCK_RUNNING: 'block_running',
  BLOCK_REVIEW: 'block_review',
  BLOCK_FAILED: 'block_failed',
  COMPLETED: 'completed',
};

/**
 * Фиксированный стек v3.1 / EXECUTION_ENGINE_V3.1 — порядок строго из реестра блоков.
 * 24 логических блока → 36 шагов бота (2B, 2G, 3, 3B поквартально).
 * Сервер сам выбирает block_index; модель не выбирает блок.
 */
export const BLOCK_STACK = [
  {
    id: '1A',
    title: 'Universal Genetic Matrix Processor',
    description: 'ITERATIVE_BLOCK_1A: UNIVERSAL GENETIC MATRIX PROCESSOR // EXECUTION_ENGINE_V3.1',
    requiresExternal: false,
  },
  {
    id: '1B',
    title: 'Universal Digital Psychomatrix Processor',
    description: 'ITERATIVE_BLOCK_1B: UNIVERSAL DIGITAL AND GEOMETRIC MATRICES PROCESSOR // EXECUTION_ENGINE_V3.1',
    requiresExternal: false,
  },
  {
    id: '1C',
    title: 'Cognitive Filters and Cognitive Metabolism Processor',
    description: 'ITERATIVE_BLOCK_1C: COGNITIVE FILTERS AND COGNITIVE METABOLISM PROCESSOR // EXECUTION_ENGINE_V3.1',
    requiresExternal: true,
  },
  {
    id: '1D',
    title: 'Dual-Contour Tzolkin Sieve',
    description: 'ITERATIVE_BLOCK_1D: TWIN-CIRCUIT TZOLKIN SIEVE // EXECUTION_ENGINE_V3.1',
    requiresExternal: false,
  },
  {
    id: '1E',
    title: 'Somatic Integration Processor',
    description: 'ITERATIVE_BLOCK_1E: UNIVERSAL SOMATIC INTEGRATION PROCESSOR // EXECUTION_ENGINE_V3.1',
    requiresExternal: false,
  },
  {
    id: '2A',
    title: 'Universal Wu-Xing Syntax Processor',
    description: 'ITERATIVE_BLOCK_2A: UNIVERSAL SYNTACTIC PROCESSOR U-SIN // EXECUTION_ENGINE_V3.1',
    requiresExternal: false,
  },
  {
    id: '2B.1',
    title: 'Universal Vedic Natal Conveyor (Step 1/4)',
    description: 'ITERATIVE_BLOCK_2B: UNIVERSAL VEDIC NATAL CONVEYOR [SIDEREAL RADIX] — Retorts 1-3 [Mesha, Vrishabha, Mithuna] // SWISS_EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '2B.2',
    title: 'Universal Vedic Natal Conveyor (Step 2/4)',
    description: 'ITERATIVE_BLOCK_2B: UNIVERSAL VEDIC NATAL CONVEYOR [SIDEREAL RADIX] — Retorts 4-6 [Karka, Simha, Kanya] // SWISS_EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '2B.3',
    title: 'Universal Vedic Natal Conveyor (Step 3/4)',
    description: 'ITERATIVE_BLOCK_2B: UNIVERSAL VEDIC NATAL CONVEYOR [SIDEREAL RADIX] — Retorts 7-9 [Tula, Vrishchika, Dhanu] // SWISS_EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '2B.4',
    title: 'Universal Vedic Natal Conveyor (Step 4/4)',
    description: 'ITERATIVE_BLOCK_2B: UNIVERSAL VEDIC NATAL CONVEYOR [SIDEREAL RADIX] — Retorts 10-12 [Makara, Kumbha, Meena] // SWISS_EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '2G.1',
    title: 'Universal Vedic Dynamic Conveyor (Step 1/4)',
    description: 'ITERATIVE_BLOCK_2G: UNIVERSAL VEDIC DYNAMIC CONVEYOR [DASHA & GOCHARA] — Bhava Dynamics 1-3 // EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '2G.2',
    title: 'Universal Vedic Dynamic Conveyor (Step 2/4)',
    description: 'ITERATIVE_BLOCK_2G: UNIVERSAL VEDIC DYNAMIC CONVEYOR [DASHA & GOCHARA] — Bhava Dynamics 4-6 // EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '2G.3',
    title: 'Universal Vedic Dynamic Conveyor (Step 3/4)',
    description: 'ITERATIVE_BLOCK_2G: UNIVERSAL VEDIC DYNAMIC CONVEYOR [DASHA & GOCHARA] — Bhava Dynamics 7-9 // EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '2G.4',
    title: 'Universal Vedic Dynamic Conveyor (Step 4/4)',
    description: 'ITERATIVE_BLOCK_2G: UNIVERSAL VEDIC DYNAMIC CONVEYOR [DASHA & GOCHARA] — Bhava Dynamics 10-12 // EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '3.1',
    title: 'Universal Tropical Natal Conveyor (Step 1/4)',
    description: 'ITERATIVE_BLOCK_3: UNIVERSAL TROPICAL NATAL CONVEYOR [RADIX CHART] — Retorts 1-3 [Aries, Taurus, Gemini] // SWISS_EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '3.2',
    title: 'Universal Tropical Natal Conveyor (Step 2/4)',
    description: 'ITERATIVE_BLOCK_3: UNIVERSAL TROPICAL NATAL CONVEYOR [RADIX CHART] — Retorts 4-6 [Cancer, Leo, Virgo] // SWISS_EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '3.3',
    title: 'Universal Tropical Natal Conveyor (Step 3/4)',
    description: 'ITERATIVE_BLOCK_3: UNIVERSAL TROPICAL NATAL CONVEYOR [RADIX CHART] — Retorts 7-9 [Libra, Scorpio, Sagittarius] // SWISS_EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '3.4',
    title: 'Universal Tropical Natal Conveyor (Step 4/4)',
    description: 'ITERATIVE_BLOCK_3: UNIVERSAL TROPICAL NATAL CONVEYOR [RADIX CHART] — Retorts 10-12 [Capricorn, Aquarius, Pisces] // SWISS_EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '3B.1',
    title: 'Universal Tropical Transit Conveyor (Step 1/4)',
    description: 'ITERATIVE_BLOCK_3B: UNIVERSAL TROPICAL TRANSIT CONVEYOR [TIME DYNAMICS] — Transits: Aries, Taurus, Gemini // SWISS_EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '3B.2',
    title: 'Universal Tropical Transit Conveyor (Step 2/4)',
    description: 'ITERATIVE_BLOCK_3B: UNIVERSAL TROPICAL TRANSIT CONVEYOR [TIME DYNAMICS] — Transits: Cancer, Leo, Virgo // SWISS_EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '3B.3',
    title: 'Universal Tropical Transit Conveyor (Step 3/4)',
    description: 'ITERATIVE_BLOCK_3B: UNIVERSAL TROPICAL TRANSIT CONVEYOR [TIME DYNAMICS] — Transits: Libra, Scorpio, Sagittarius // SWISS_EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '3B.4',
    title: 'Universal Tropical Transit Conveyor (Step 4/4)',
    description: 'ITERATIVE_BLOCK_3B: UNIVERSAL TROPICAL TRANSIT CONVEYOR [TIME DYNAMICS] — Transits: Capricorn, Aquarius, Pisces // SWISS_EPH_V3.1',
    requiresExternal: true,
  },
  {
    id: '3C_1',
    title: 'Chirological Projections — Left Palm',
    description: 'ITERATIVE_BLOCK_3C_1: CHIROLOGICAL PROJECTIONS — LEFT PALM (PASSIVE POTENTIAL / ROM-BOARD)',
    requiresExternal: true,
  },
  {
    id: '3C_2',
    title: 'Chirological Projections — Right Palm',
    description: 'ITERATIVE_BLOCK_3C_2: CHIROLOGICAL PROJECTIONS — RIGHT PALM (ACTIVE RUNTIME / RAM-MUTATION)',
    requiresExternal: true,
  },
  {
    id: '3C_3',
    title: 'Chirological Chrono Projections',
    description: 'ITERATIVE_BLOCK_3C_3: CHRONO-NAVIGATION PROCESSOR OF LONG COUNT [MAYA MACROCYCLIC TIMER] // EXECUTION_ENGINE_V3.1',
    requiresExternal: true,
  },
  {
    id: '3C',
    title: 'Midpoints and Lots Processor',
    description: 'ITERATIVE_BLOCK_3C: UNIVERSAL MIDPOINTS AND ARABIC PARTS PROCESSOR // EXECUTION_ENGINE_V3.1',
    requiresExternal: true,
  },
  {
    id: '4',
    title: 'Universal Graph Processor',
    description: 'ITERATIVE_BLOCK_4: UNIVERSAL GRAPH PROCESSOR [NEO4J SYNTAX] // EXECUTION_ENGINE_V3.1',
    requiresExternal: false,
  },
  {
    id: '4A',
    title: 'San Bao Conveyor',
    description: 'ITERATIVE_BLOCK_4A: THREE TREASURES TRANSMUTATION CONVEYOR [SAN BAO] // EXECUTION_ENGINE_V3.1',
    requiresExternal: false,
  },
  {
    id: '4B',
    title: 'Universal Gnostic Processor',
    description: 'ITERATIVE_BLOCK_4B: UNIVERSAL GNOSTIC PROCESSOR [KENOMA INDEX] // EXECUTION_ENGINE_V3.1',
    requiresExternal: false,
  },
  {
    id: '4E',
    title: 'Universal Sufi Nafsa Reductor',
    description: 'ITERATIVE_BLOCK_4E: UNIVERSAL SUFI NAFS REDUCTION PROCESSOR // EXECUTION_ENGINE_V3.1',
    requiresExternal: false,
  },
  {
    id: '4C',
    title: 'Universal Alchemical Catalyst',
    description: 'ITERATIVE_BLOCK_4C: UNIVERSAL ALCHEMICAL CATALYST [PYROLYSIS_ENGINE_V3.1]',
    requiresExternal: false,
  },
  {
    id: '4G',
    title: 'Cut-Up Processor',
    description: 'ITERATIVE_BLOCK_4G: PROCESSOR OF SEMANTIC CUT-UP AND LINGUISTIC REDUCTION [BURROUGHS ENGINE] // EXECUTION_ENGINE_V3.1',
    requiresExternal: false,
  },
  {
    id: '4F',
    title: 'Advaita Quantum Annihilation Processor',
    description: 'ITERATIVE_BLOCK_4F: ADVAITA PROCESSOR OF QUANTUM ANNIHILATION [MAHA VAKYA-LOCK] // EXECUTION_ENGINE_V3.1',
    requiresExternal: false,
  },
  {
    id: '4D',
    title: 'Universal Singular Summator',
    description: 'ITERATIVE_BLOCK_4D: UNIVERSAL SYNTACTIC SUMMATOR [OVERMANIFEST] // EXECUTION_ENGINE_V3.1',
    requiresExternal: false,
  },
  {
    id: '5A',
    title: 'Universal Strategic Protocol Generator',
    description: 'ITERATIVE_BLOCK_5A: UNIVERSAL STRATEGIC PROTOCOL GENERATOR // EXECUTION_ENGINE_V3.1',
    requiresExternal: false,
  },
  {
    id: '5B',
    title: 'Universal Dao Body Reactor',
    description: 'ITERATIVE_BLOCK_5B: UNIVERSAL SOMATIC TAOIST REACTOR [INTERNAL ALCHEMY / NEIDAN / BUILD_2026]',
    requiresExternal: false,
  },
];

export const BLOCK_IDS = BLOCK_STACK.map((b) => b.id);

export { getModuleMeta, MODULES, PARTS, SESSION_TOTAL } from '../ui/modules.js';
export { formatModuleHeader as formatBlockHeader } from '../ui/brand.js';

export function getBlockUserTitle(blockId, lang = 'ru') {
  return getModuleMeta(blockId, lang).title;
}

/** Индекс блока 4 — с него в контекст подмешиваются метакомментарии прошлых блоков */
export const SYNTHESIS_BLOCK_INDEX = BLOCK_STACK.findIndex((b) => b.id === '4');

/** Имена JSON-артефактов из OUTPUT_PORT реестра v3.1 (v26.75 для финальных блоков) */
const ARTIFACT_BY_BLOCK = {
  '1A': 'block_1a_invariant',
  '1B': 'block_1b_invariant',
  '1C': 'block_1c_invariant',
  '1D': 'block_1d_invariant',
  '1E': 'block_1e_invariant',
  '2A': 'block_2a_invariant',
  '2B.1': 'block_2b_invariant',
  '2B.2': 'block_2b_invariant',
  '2B.3': 'block_2b_invariant',
  '2B.4': 'block_2b_invariant',
  '2G.1': 'block_2g_invariant',
  '2G.2': 'block_2g_invariant',
  '2G.3': 'block_2g_invariant',
  '2G.4': 'block_2g_invariant',
  '3.1': 'block_3_invariant',
  '3.2': 'block_3_invariant',
  '3.3': 'block_3_invariant',
  '3.4': 'block_3_invariant',
  '3B.1': 'block_3b_invariant',
  '3B.2': 'block_3b_invariant',
  '3B.3': 'block_3b_invariant',
  '3B.4': 'block_3b_invariant',
  '3C_1': 'block_3c_1_left_invariant',
  '3C_2': 'block_3c_2_right_invariant',
  '3C_3': 'block_3c_3_chrono_invariant',
  '3C': 'block_3c_invariant',
  '4': 'block_4_invariant',
  '4A': 'block_4a_invariant',
  '4B': 'block_4b_invariant',
  '4E': 'block_4e_invariant',
  '4C': 'block_4c_invariant',
  '4G': 'block_4g_cutup_invariant',
  '4F': 'block_4f_invariant',
  '4D': 'block_4d_invariantСтрогийЗапуск_v26.75',
  '5A': 'block_5a_invariantСтрогийЗапуск_v26.75',
  '5B': 'block_5b_invariantСтрогийЗапуск_v26.75',
};

export function jsonArtifactName(blockId) {
  const base = ARTIFACT_BY_BLOCK[blockId];
  if (base) return `${base}.json`;
  const safe = blockId.replace(/[^0-9A-Za-z_]/g, '_').toLowerCase();
  return `block_${safe}_invariant.json`;
}

/** Допустимые варианты имени артефакта в ответе модели */
export function jsonArtifactPatterns(blockId) {
  const primary = jsonArtifactName(blockId);
  const base = primary.replace(/\.json$/, '');
  const patterns = [primary, base];
  const legacySafe = blockId.replace(/[^0-9A-Za-z_]/g, '_');
  patterns.push(`блок_${legacySafe}_инвариантСтрогийЗапуск_v26.30.json`);
  patterns.push(`block_${legacySafe.toLowerCase()}_invariant.json`);
  return [...new Set(patterns)];
}

export const CALLBACK_PREFIX = 'lv';

export const TEXT_INPUT_STEPS = new Set([
  STEPS.BIRTH_DATE,
  STEPS.BIRTH_TIME,
  STEPS.BIRTH_PLACE,
  STEPS.BLOCK_PREP,
  STEPS.BLOCK_REVIEW,
]);

export const FILE_ONLY_STEPS = new Set([STEPS.BLOCK_PREP]);

export const REJECT_TEXT =
  'На этом этапе текст не принимается. Используйте кнопки или прикрепите файл.';

export const TELEGRAM_MAX_MESSAGE = 4096;
