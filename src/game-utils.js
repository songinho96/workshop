import {
  DRAWING_TOPIC_NAME,
  FINISHED_MESSAGE,
  GAME_TYPES,
  SETTINGS_KEY,
  STAGES,
  START_MESSAGE,
  STORAGE_KEY,
} from "./constants.js";

export function createEmptyGameData() {
  const byGame = {};

  GAME_TYPES.forEach((game) => {
    byGame[game.key] = {};
    STAGES.forEach((stage) => {
      byGame[game.key][stage.key] = [];
    });
  });

  return byGame;
}

export function createDefaultSettings() {
  return { charades: 60, drawing: 10 };
}

export function normalizeTopicDraft(topic) {
  return {
    name: typeof topic?.name === "string" ? topic.name : "",
    prompts: Array.isArray(topic?.prompts) ? topic.prompts.map((prompt) => String(prompt)) : [],
  };
}

export function normalizeGameData(raw) {
  const normalized = createEmptyGameData();

  GAME_TYPES.forEach((game) => {
    STAGES.forEach((stage) => {
      const items = raw?.[game.key]?.[stage.key];
      normalized[game.key][stage.key] =
        game.kind === "topics"
          ? Array.isArray(items)
            ? items.map(normalizeTopicDraft)
            : []
          : Array.isArray(items)
            ? items.map((item) => String(item))
            : [];
    });
  });

  return normalized;
}

export function normalizeSettings(raw) {
  const next = createDefaultSettings();

  GAME_TYPES.forEach((game) => {
    const value = Number(raw?.[game.key]);
    if (Number.isFinite(value) && value >= 5 && value <= 600) {
      next[game.key] = Math.round(value);
    }
  });

  return next;
}

export function loadDataFromLocal() {
  const saved = window.localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return createEmptyGameData();
  }

  try {
    return normalizeGameData(JSON.parse(saved));
  } catch {
    return createEmptyGameData();
  }
}

export function loadSettingsFromLocal() {
  const saved = window.localStorage.getItem(SETTINGS_KEY);

  if (!saved) {
    return createDefaultSettings();
  }

  try {
    return normalizeSettings(JSON.parse(saved));
  } catch {
    return createDefaultSettings();
  }
}

export function persistLocalState(data, settings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearLocalState() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(SETTINGS_KEY);
}

export function pruneEmptyAdminData(data) {
  const next = createEmptyGameData();

  STAGES.forEach((stage) => {
    next.charades[stage.key] = data.charades[stage.key]
      .map((topic) => ({
        name: topic.name.trim(),
        prompts: topic.prompts.map((prompt) => prompt.trim()).filter(Boolean),
      }))
      .filter((topic) => topic.name || topic.prompts.length);

    next.drawing[stage.key] = data.drawing[stage.key]
      .map((item) => item.trim())
      .filter(Boolean);
  });

  return next;
}

export function createEmptyTopic() {
  return { name: "", prompts: [] };
}

export function shuffle(items) {
  const array = [...items];

  for (let index = array.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
  }

  return array;
}

export function seededShuffle(items, seedSource) {
  const array = [...items];
  const random = createSeededRandom(seedSource);

  for (let index = array.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
  }

  return array;
}

function createSeededRandom(seedSource) {
  let seed = 2166136261;

  for (let index = 0; index < seedSource.length; index += 1) {
    seed ^= seedSource.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }

  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildPromptOptions(prompts) {
  if (!prompts.length) {
    return [];
  }

  const shuffled = seededShuffle(prompts, prompts.join("|"));
  const midpoint = Math.ceil(shuffled.length / 2);
  const first = shuffled.slice(0, midpoint);
  const second = shuffled.slice(midpoint);
  const options = [];

  if (first.length) {
    options.push({ key: "option1", label: "1안", prompts: first });
  }

  if (second.length) {
    options.push({ key: "option2", label: "2안", prompts: second });
  }

  return options;
}

export function getPresentationStage({
  isPresentationMode,
  currentGameKey,
  currentStageKey,
  currentGame,
  currentTopic,
  currentOption,
}) {
  if (!isPresentationMode) {
    return "normal";
  }

  if (!currentGameKey) {
    return "games";
  }

  if (!currentStageKey) {
    return "stages";
  }

  if (currentGame?.kind === "topics" && !currentTopic) {
    return "topics";
  }

  if (!currentOption) {
    return "options";
  }

  return "live";
}

export function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function isActualPrompt(prompt) {
  return Boolean(prompt) && prompt !== START_MESSAGE && prompt !== FINISHED_MESSAGE;
}

export function getErrorMessage(error) {
  if (!error) {
    return "알 수 없는 오류";
  }

  if (typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "알 수 없는 오류";
  }
}

export function getDrawingTopicName() {
  return DRAWING_TOPIC_NAME;
}
