const STORAGE_KEY = "workshop-games-data-v3";
const SETTINGS_KEY = "workshop-games-settings-v3";
const initialMode = document.body.dataset.initialMode || "play";
const supabaseConfig = window.SUPABASE_CONFIG || null;

const GAME_TYPES = [
  { key: "charades", label: "몸으로 말해요", kind: "topics" },
  { key: "drawing", label: "10초 그림 그리기", kind: "phrases" },
];

const STAGES = [
  { key: "preliminary", label: "예선전" },
  { key: "semifinal", label: "준결승전" },
  { key: "final", label: "결승전" },
];

const START_MESSAGE = "다음으로 넘길 시 시작!";
const FINISHED_MESSAGE = "이 안의 제시어를 모두 봤어요";
const DRAWING_TOPIC_NAME = "속담";

const sampleData = {
  charades: {
    preliminary: [
      { name: "동물", prompts: ["기린", "토끼", "강아지", "고양이", "캥거루", "문어"] },
      { name: "직업", prompts: ["의사", "요리사", "가수", "축구선수", "교사", "사진작가"] },
    ],
    semifinal: [
      { name: "영화", prompts: ["타이타닉", "겨울왕국", "어벤져스", "알라딘", "기생충", "인사이드 아웃"] },
    ],
    final: [{ name: "운동", prompts: ["수영", "탁구", "복싱", "농구", "축구", "배드민턴"] }],
  },
  drawing: {
    preliminary: ["원숭이도 나무에서 떨어진다", "호랑이 굴에 가야 호랑이 새끼를 잡는다"],
    semifinal: ["백문이 불여일견", "가는 말이 고와야 오는 말이 곱다"],
    final: ["고래 싸움에 새우 등 터진다", "세 살 버릇 여든까지 간다"],
  },
};

const state = {
  data: createEmptyGameData(),
  settings: createDefaultSettings(),
  currentMode: initialMode,
  adminGameKey: GAME_TYPES[0].key,
  adminStageKey: STAGES[0].key,
  currentGameKey: null,
  currentStageKey: null,
  currentTopicIndex: null,
  currentOptionKey: null,
  promptQueue: [],
  promptHistory: [],
  currentPrompt: "",
  storageMode: "local",
  connectionStatus: "로컬 모드",
  lastRemoteError: "",
  supabase: null,
  timerRemaining: 60,
  timerIntervalId: null,
  timerRunning: false,
  isPresentationMode: false,
};

const playGameTabs = document.querySelector("#play-game-tabs");
const playStageTabs = document.querySelector("#play-stage-tabs");
const adminGameTabs = document.querySelector("#admin-game-tabs");
const adminStageTabs = document.querySelector("#admin-stage-tabs");
const topicGrid = document.querySelector("#topic-grid");
const optionPanel = document.querySelector("#option-panel");
const optionButtons = document.querySelector("#option-buttons");
const currentGameName = document.querySelector("#current-game-name");
const currentStageName = document.querySelector("#current-stage-name");
const currentTopicName = document.querySelector("#current-topic-name");
const currentOptionName = document.querySelector("#current-option-name");
const solvedCount = document.querySelector("#solved-count");
const remainingCount = document.querySelector("#remaining-count");
const promptText = document.querySelector("#prompt-text");
const adminForm = document.querySelector("#admin-form");
const addTopicButton = document.querySelector("#add-topic-button");
const charadesAdminTools = document.querySelector("#charades-admin-tools");
const drawingEditor = document.querySelector("#drawing-editor");
const drawingPromptsInput = document.querySelector("#drawing-prompts-input");
const adminTimerTitle = document.querySelector("#admin-timer-title");
const topicEditorTemplate = document.querySelector("#topic-editor-template");
const connectionStatusLabel = document.querySelector("#connection-status-label");
const timerSecondsInput = document.querySelector("#timer-seconds-input");
const timerDisplay = document.querySelector("#timer-display");
const timerDefaultLabel = document.querySelector("#timer-default-label");
const timerStartButton = document.querySelector("#timer-start-button");
const timerPauseButton = document.querySelector("#timer-pause-button");
const timerResetButton = document.querySelector("#timer-reset-button");
const presentationToggleButton = document.querySelector("#presentation-toggle-button");
const presentationExitButton = document.querySelector("#presentation-exit-button");
const nextPromptButton = document.querySelector("#next-prompt-button");
const resetTopicButton = document.querySelector("#reset-topic-button");
const restartFlowButton = document.querySelector("#restart-flow-button");
const shuffleCurrentButton = document.querySelector("#shuffle-current-button");
const modePanels = document.querySelectorAll("[data-mode-panel]");

document.querySelector("#save-button")?.addEventListener("click", handleSave);
document.querySelector("#clear-button")?.addEventListener("click", handleClear);
document.querySelector("#fill-sample-button")?.addEventListener("click", handleFillSample);
addTopicButton?.addEventListener("click", addAdminTopic);
nextPromptButton?.addEventListener("click", showNextPrompt);
resetTopicButton?.addEventListener("click", resetCurrentTopic);
restartFlowButton?.addEventListener("click", restartFlow);
shuffleCurrentButton?.addEventListener("click", reshuffleCurrentSelection);
timerStartButton?.addEventListener("click", startTimer);
timerPauseButton?.addEventListener("click", pauseTimer);
timerResetButton?.addEventListener("click", resetTimer);
presentationToggleButton?.addEventListener("click", togglePresentationMode);
presentationExitButton?.addEventListener("click", exitPresentationMode);
document.addEventListener("fullscreenchange", syncPresentationModeWithFullscreen);
document.addEventListener("keydown", handlePresentationShortcuts);

init().catch(() => {
  state.data = loadDataFromLocal();
  state.settings = loadSettingsFromLocal();
  syncTimerToCurrentGame();
  renderAll();
});

async function init() {
  setupSupabase();
  const data = await loadAppData();
  state.data = data.data;
  state.settings = data.settings;
  syncTimerToCurrentGame();
  renderAll();
}

function renderAll() {
  renderGameTabs();
  renderStageTabs();
  renderAdminArea();
  renderTopicButtons();
  renderOptionButtons();
  setMode(initialMode);
  updatePlayView();
  updateTimerView();
  updateConnectionLabels();
}

function setupSupabase() {
  if (
    !window.supabase ||
    !supabaseConfig ||
    !supabaseConfig.url ||
    !supabaseConfig.anonKey ||
    supabaseConfig.url.includes("YOUR_PROJECT_REF") ||
    supabaseConfig.anonKey.includes("YOUR_SUPABASE_ANON_KEY")
  ) {
    state.storageMode = "local";
    state.connectionStatus = "설정 필요";
    return;
  }

  state.supabase = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
  state.storageMode = "supabase";
  state.connectionStatus = "연결 확인 중";
  state.lastRemoteError = "";
}

async function loadAppData() {
  if (state.supabase) {
    try {
      const [remoteData, remoteSettings] = await Promise.all([
        fetchDataFromSupabase(),
        fetchSettingsFromSupabase(),
      ]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteData));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(remoteSettings));
      state.connectionStatus = "Supabase 연결됨";
      state.lastRemoteError = "";
      return { data: remoteData, settings: remoteSettings };
    } catch (error) {
      state.storageMode = "local";
      state.lastRemoteError = getErrorMessage(error);
      state.connectionStatus = `원격 연결 실패: ${state.lastRemoteError}`;
    }
  }

  return {
    data: loadDataFromLocal(),
    settings: loadSettingsFromLocal(),
  };
}

function createEmptyGameData() {
  const byGame = {};

  GAME_TYPES.forEach((game) => {
    byGame[game.key] = {};
    STAGES.forEach((stage) => {
      byGame[game.key][stage.key] = [];
    });
  });

  return byGame;
}

function createDefaultSettings() {
  return { charades: 60, drawing: 10 };
}

function loadDataFromLocal() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return createEmptyGameData();
  }

  try {
    return normalizeGameData(JSON.parse(saved));
  } catch (error) {
    return createEmptyGameData();
  }
}

function loadSettingsFromLocal() {
  const saved = localStorage.getItem(SETTINGS_KEY);

  if (!saved) {
    return createDefaultSettings();
  }

  try {
    return normalizeSettings(JSON.parse(saved));
  } catch (error) {
    return createDefaultSettings();
  }
}

function normalizeGameData(raw) {
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

function normalizeSettings(raw) {
  const next = createDefaultSettings();

  GAME_TYPES.forEach((game) => {
    const value = Number(raw?.[game.key]);
    if (Number.isFinite(value) && value >= 5 && value <= 600) {
      next[game.key] = Math.round(value);
    }
  });

  return next;
}

function normalizeTopicDraft(topic) {
  return {
    name: typeof topic?.name === "string" ? topic.name : "",
    prompts: Array.isArray(topic?.prompts) ? topic.prompts.map((prompt) => String(prompt)) : [],
  };
}

function persistLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function renderGameTabs() {
  renderTabSet(playGameTabs, GAME_TYPES, state.currentGameKey, selectPlayGame, "game");
  renderTabSet(adminGameTabs, GAME_TYPES, state.adminGameKey, selectAdminGame, "game");
}

function renderStageTabs() {
  renderTabSet(playStageTabs, STAGES, state.currentStageKey, selectPlayStage, "stage", !state.currentGameKey);
  renderTabSet(adminStageTabs, STAGES, state.adminStageKey, selectAdminStage, "stage");
}

function renderTabSet(container, items, activeKey, onClick, type, disabled = false) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${type}-tab-button`;
    button.textContent = item.label;
    button.disabled = disabled;

    if (item.key === activeKey) {
      button.classList.add("active");
    }

    button.addEventListener("click", () => onClick(item.key));
    container.appendChild(button);
  });
}

function renderAdminArea() {
  if (!adminForm) {
    return;
  }

  syncTimerInputFromAdminGame();

  const adminGame = getGameByKey(state.adminGameKey);
  adminTimerTitle.textContent = `${adminGame.label} 기본 타이머를 설정하세요`;
  charadesAdminTools?.classList.toggle("is-hidden", adminGame.kind !== "topics");
  adminForm.classList.toggle("is-hidden", adminGame.kind !== "topics");
  drawingEditor?.classList.toggle("is-hidden", adminGame.kind !== "phrases");

  if (adminGame.kind === "topics") {
    renderCharadesAdminEditors();
  } else {
    renderDrawingAdminEditor();
  }
}

function renderCharadesAdminEditors() {
  if (!adminForm || !topicEditorTemplate) {
    return;
  }

  adminForm.innerHTML = "";

  if (getAdminTopics().length === 0) {
    state.data.charades[state.adminStageKey] = [createEmptyTopic()];
  }

  getAdminTopics().forEach((topic, index) => {
    const fragment = topicEditorTemplate.content.cloneNode(true);
    const editor = fragment.querySelector(".topic-editor");
    const header = fragment.querySelector(".topic-editor-header");
    const badge = fragment.querySelector(".topic-badge");
    const nameInput = fragment.querySelector(".topic-name-input");
    const promptsInput = fragment.querySelector(".topic-prompts-input");

    badge.textContent = String(index + 1);
    nameInput.value = topic.name;
    promptsInput.value = topic.prompts.join("\n");

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-topic-button";
    removeButton.textContent = "삭제";
    removeButton.addEventListener("click", () => removeAdminTopic(index));

    header.appendChild(removeButton);
    editor.dataset.topicIndex = String(index);
    adminForm.appendChild(fragment);
  });
}

function renderDrawingAdminEditor() {
  if (drawingPromptsInput) {
    drawingPromptsInput.value = getAdminDrawingPhrases().join("\n");
  }
}

function getAdminTopics() {
  return state.data.charades[state.adminStageKey];
}

function getAdminDrawingPhrases() {
  return state.data.drawing[state.adminStageKey];
}

function createEmptyTopic() {
  return { name: "", prompts: [] };
}

function addAdminTopic() {
  if (state.adminGameKey !== "charades") {
    return;
  }

  syncAdminDrafts();
  state.data.charades[state.adminStageKey].push(createEmptyTopic());
  renderCharadesAdminEditors();
}

function removeAdminTopic(index) {
  syncAdminDrafts();
  const topics = state.data.charades[state.adminStageKey];

  if (topics.length <= 1) {
    state.data.charades[state.adminStageKey] = [createEmptyTopic()];
  } else {
    topics.splice(index, 1);
  }

  renderCharadesAdminEditors();
}

function syncAdminDrafts() {
  syncAdminTimerDraft();

  if (state.adminGameKey === "charades") {
    if (!adminForm) {
      return;
    }

    const nameInputs = [...adminForm.querySelectorAll(".topic-name-input")];
    const promptInputs = [...adminForm.querySelectorAll(".topic-prompts-input")];

    state.data.charades[state.adminStageKey] = nameInputs.map((input, index) => ({
      name: input.value,
      prompts: (promptInputs[index]?.value || "").split("\n"),
    })).map(normalizeTopicDraft);
  } else if (drawingPromptsInput) {
    state.data.drawing[state.adminStageKey] = drawingPromptsInput.value
      .split("\n")
      .map((item) => item.trimEnd());
  }
}

function syncAdminTimerDraft() {
  if (!timerSecondsInput) {
    return;
  }

  const value = Number(timerSecondsInput.value);
  if (!Number.isFinite(value)) {
    return;
  }

  const normalized = normalizeSettings({
    ...state.settings,
    [state.adminGameKey]: value,
  });
  state.settings[state.adminGameKey] = normalized[state.adminGameKey];
}

function syncTimerInputFromAdminGame() {
  if (timerSecondsInput) {
    timerSecondsInput.value = String(state.settings[state.adminGameKey]);
  }
}

function pruneEmptyAdminData(data) {
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

async function handleSave() {
  syncAdminDrafts();
  state.data = pruneEmptyAdminData(state.data);
  persistLocalState();
  syncTimerToCurrentGame();
  resetTimer();

  if (state.supabase) {
    try {
      await Promise.all([saveDataToSupabase(state.data), saveSettingsToSupabase(state.settings)]);
      state.storageMode = "supabase";
      state.connectionStatus = "Supabase 저장 완료";
      state.lastRemoteError = "";
    } catch (error) {
      state.storageMode = "local";
      state.lastRemoteError = getErrorMessage(error);
      state.connectionStatus = `원격 저장 실패: ${state.lastRemoteError}`;
    }
  }

  if (!currentSelectionStillValid()) {
    restartFlow();
  } else {
    renderTopicButtons();
    renderOptionButtons();
    updatePlayView();
    updateTimerView();
  }

  updateConnectionLabels();

  if (window.location.pathname.endsWith("/admin.html")) {
    window.location.href = "./play.html";
  }
}

async function handleClear() {
  state.data = createEmptyGameData();
  state.settings = createDefaultSettings();
  clearCurrentSelection();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SETTINGS_KEY);
  resetTimer();

  if (state.supabase) {
    try {
      await Promise.all([clearDataInSupabase(), resetSettingsInSupabase()]);
      state.storageMode = "supabase";
      state.connectionStatus = "Supabase 초기화 완료";
      state.lastRemoteError = "";
    } catch (error) {
      state.storageMode = "local";
      state.lastRemoteError = getErrorMessage(error);
      state.connectionStatus = `원격 초기화 실패: ${state.lastRemoteError}`;
    }
  }

  renderAll();
}

function handleFillSample() {
  syncAdminDrafts();
  state.data = normalizeGameData(sampleData);
  state.settings = createDefaultSettings();
  renderAll();
}

function currentSelectionStillValid() {
  if (!state.currentGameKey || !state.currentStageKey) {
    return false;
  }

  if (state.currentGameKey === "charades") {
    return Boolean(getCurrentTopic());
  }

  return getCurrentPromptSource().length > 0;
}

function selectAdminGame(gameKey) {
  syncAdminDrafts();
  state.adminGameKey = gameKey;
  renderGameTabs();
  renderAdminArea();
}

function selectAdminStage(stageKey) {
  syncAdminDrafts();
  state.adminStageKey = stageKey;
  renderStageTabs();
  renderAdminArea();
}

function selectPlayGame(gameKey) {
  state.currentGameKey = gameKey;
  state.currentStageKey = null;
  state.currentTopicIndex = null;
  state.currentOptionKey = null;
  state.promptQueue = [];
  state.promptHistory = [];
  state.currentPrompt = "";
  syncTimerToCurrentGame();
  pauseTimer();
  renderGameTabs();
  renderStageTabs();
  renderTopicButtons();
  renderOptionButtons();
  updatePlayView();
  updateTimerView();
}

function selectPlayStage(stageKey) {
  state.currentStageKey = stageKey;
  state.currentTopicIndex = null;
  state.currentOptionKey = null;
  state.promptQueue = [];
  state.promptHistory = [];
  state.currentPrompt = "";
  renderStageTabs();
  renderTopicButtons();
  renderOptionButtons();
  updatePlayView();
}

function renderTopicButtons() {
  if (!topicGrid) {
    return;
  }

  const game = getCurrentGame();
  const shouldShowTopics = game?.kind === "topics" && Boolean(state.currentStageKey);
  topicGrid.classList.toggle("is-hidden", !shouldShowTopics);
  topicGrid.innerHTML = "";

  if (!shouldShowTopics) {
    return;
  }

  getCurrentTopics().forEach((topic, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "topic-button";
    button.textContent = topic.name || `주제 ${index + 1}`;
    button.disabled = !topic.name || topic.prompts.length === 0;

    if (index === state.currentTopicIndex) {
      button.classList.add("active");
    }

    button.addEventListener("click", () => selectTopic(index));
    topicGrid.appendChild(button);
  });
}

function selectTopic(index) {
  state.currentTopicIndex = index;
  state.currentOptionKey = null;
  state.promptQueue = [];
  state.promptHistory = [];
  state.currentPrompt = "";
  renderTopicButtons();
  renderOptionButtons();
  updatePlayView();
}

function renderOptionButtons() {
  if (!optionButtons || !optionPanel) {
    return;
  }

  const options = buildPromptOptions(getCurrentPromptSource());
  optionButtons.innerHTML = "";
  optionPanel.classList.toggle("is-hidden", options.length === 0);

  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-button";
    button.textContent = `${option.label} (${option.prompts.length}개)`;

    if (option.key === state.currentOptionKey) {
      button.classList.add("active");
    }

    button.addEventListener("click", () => selectPromptOption(option.key));
    optionButtons.appendChild(button);
  });
}

function selectPromptOption(optionKey) {
  state.currentOptionKey = optionKey;
  buildPromptQueue();
  renderOptionButtons();
  updatePlayView();
}

function getCurrentPromptSource() {
  const game = getCurrentGame();

  if (!game || !state.currentStageKey) {
    return [];
  }

  if (game.kind === "topics") {
    return getCurrentTopic()?.prompts || [];
  }

  return state.data.drawing[state.currentStageKey] || [];
}

function buildPromptOptions(prompts) {
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

function getCurrentOption() {
  if (!state.currentOptionKey) {
    return null;
  }

  return (
    buildPromptOptions(getCurrentPromptSource()).find(
      (option) => option.key === state.currentOptionKey
    ) || null
  );
}

function buildPromptQueue() {
  const option = getCurrentOption();

  if (!option) {
    state.promptQueue = [];
    state.promptHistory = [];
    state.currentPrompt = "";
    return;
  }

  state.promptQueue = shuffle(option.prompts);
  state.promptHistory = [];
  state.currentPrompt = START_MESSAGE;
}

function getCurrentGame() {
  if (!state.currentGameKey) {
    return null;
  }

  return getGameByKey(state.currentGameKey);
}

function getCurrentStage() {
  if (!state.currentStageKey) {
    return null;
  }

  return STAGES.find((stage) => stage.key === state.currentStageKey) || null;
}

function getGameByKey(gameKey) {
  return GAME_TYPES.find((game) => game.key === gameKey) || null;
}

function getCurrentTopics() {
  if (!state.currentStageKey) {
    return [];
  }

  return state.data.charades[state.currentStageKey] || [];
}

function getCurrentTopic() {
  if (state.currentTopicIndex === null) {
    return null;
  }

  return getCurrentTopics()[state.currentTopicIndex] || null;
}

function updatePlayView() {
  const game = getCurrentGame();
  const stage = getCurrentStage();
  const option = getCurrentOption();
  const topicName = game?.kind === "phrases" ? DRAWING_TOPIC_NAME : getCurrentTopic()?.name;

  if (currentGameName) {
    currentGameName.textContent = game?.label || "없음";
  }

  if (currentStageName) {
    currentStageName.textContent = stage?.label || "없음";
  }

  if (currentTopicName) {
    currentTopicName.textContent = topicName || "없음";
  }

  if (currentOptionName) {
    currentOptionName.textContent = option?.label || "없음";
  }

  if (solvedCount) {
    solvedCount.textContent = String(state.promptHistory.length);
  }

  if (remainingCount) {
    remainingCount.textContent = String(state.promptQueue.length);
  }

  if (nextPromptButton) {
    nextPromptButton.disabled = !option;
  }

  if (resetTopicButton) {
    resetTopicButton.disabled = !option;
  }

  if (shuffleCurrentButton) {
    shuffleCurrentButton.disabled = !option;
  }

  if (restartFlowButton) {
    restartFlowButton.disabled =
      !game && !stage && state.promptHistory.length === 0 && !state.currentPrompt;
  }

  if (!promptText) {
    return;
  }

  if (!game) {
    promptText.textContent = "먼저 게임을 선택해 주세요";
    updatePresentationStage();
    return;
  }

  if (!stage) {
    promptText.textContent = "단계를 선택해 주세요";
    updatePresentationStage();
    return;
  }

  if (game.kind === "topics" && !getCurrentTopic()) {
    promptText.textContent = "주제를 선택해 주세요";
    updatePresentationStage();
    return;
  }

  if (!option) {
    promptText.textContent = "1안 또는 2안을 선택해 시작해 주세요";
    updatePresentationStage();
    return;
  }

  promptText.textContent = state.currentPrompt || START_MESSAGE;
  updatePresentationStage();
}

function reshuffleCurrentSelection() {
  if (!getCurrentOption()) {
    return;
  }

  buildPromptQueue();
  updatePlayView();
}

function resetCurrentTopic() {
  if (!getCurrentOption()) {
    return;
  }

  buildPromptQueue();
  updatePlayView();
}

function restartFlow() {
  clearCurrentSelection();
  pauseTimer();
  syncTimerToCurrentGame();
  resetTimer();
  renderGameTabs();
  renderStageTabs();
  renderTopicButtons();
  renderOptionButtons();
  updatePlayView();
}

function clearCurrentSelection() {
  state.currentGameKey = null;
  state.currentStageKey = null;
  state.currentTopicIndex = null;
  state.currentOptionKey = null;
  state.promptQueue = [];
  state.promptHistory = [];
  state.currentPrompt = "";
}

function showNextPrompt() {
  if (!getCurrentOption()) {
    return;
  }

  if (state.currentPrompt && isActualPrompt(state.currentPrompt)) {
    state.promptHistory.push(state.currentPrompt);
  }

  if (state.promptQueue.length === 0) {
    state.currentPrompt = FINISHED_MESSAGE;
    updatePlayView();
    return;
  }

  state.currentPrompt = state.promptQueue.shift();
  updatePlayView();
}

function showPreviousPrompt() {
  if (!getCurrentOption() || state.promptHistory.length === 0) {
    return;
  }

  if (isActualPrompt(state.currentPrompt)) {
    state.promptQueue.unshift(state.currentPrompt);
  }

  state.currentPrompt = state.promptHistory.pop();
  updatePlayView();
}

function isActualPrompt(prompt) {
  return Boolean(prompt) && prompt !== START_MESSAGE && prompt !== FINISHED_MESSAGE;
}

function syncTimerToCurrentGame() {
  const gameKey = state.currentGameKey || GAME_TYPES[0].key;
  state.timerRemaining = state.settings[gameKey];
}

function updateTimerView() {
  if (timerDisplay) {
    timerDisplay.textContent = formatTime(state.timerRemaining);
    timerDisplay.classList.toggle("is-danger", state.timerRemaining <= 10);
  }

  if (timerDefaultLabel) {
    const gameKey = state.currentGameKey || GAME_TYPES[0].key;
    timerDefaultLabel.textContent = `${state.settings[gameKey]}초`;
  }
}

function startTimer() {
  if (state.timerRunning) {
    return;
  }

  state.timerRunning = true;
  state.timerIntervalId = window.setInterval(() => {
    if (state.timerRemaining <= 1) {
      state.timerRemaining = 0;
      pauseTimer();
      updateTimerView();
      return;
    }

    state.timerRemaining -= 1;
    updateTimerView();
  }, 1000);
}

function pauseTimer() {
  state.timerRunning = false;

  if (state.timerIntervalId) {
    window.clearInterval(state.timerIntervalId);
    state.timerIntervalId = null;
  }
}

function resetTimer() {
  pauseTimer();
  const gameKey = state.currentGameKey || GAME_TYPES[0].key;
  state.timerRemaining = state.settings[gameKey];
  updateTimerView();
}

async function togglePresentationMode() {
  if (state.isPresentationMode) {
    await exitPresentationMode();
    return;
  }

  clearCurrentSelection();
  resetTimer();
  state.isPresentationMode = true;
  renderGameTabs();
  renderStageTabs();
  renderTopicButtons();
  renderOptionButtons();
  updatePlayView();
  applyPresentationMode();

  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen();
    } catch (error) {
      syncPresentationModeWithFullscreen();
    }
  }
}

async function exitPresentationMode() {
  state.isPresentationMode = false;
  applyPresentationMode();

  if (document.fullscreenElement && document.exitFullscreen) {
    try {
      await document.exitFullscreen();
    } catch (error) {
      syncPresentationModeWithFullscreen();
    }
  }
}

function syncPresentationModeWithFullscreen() {
  state.isPresentationMode = Boolean(document.fullscreenElement);
  applyPresentationMode();
}

function applyPresentationMode() {
  document.body.classList.toggle("presentation-mode", state.isPresentationMode);
  presentationToggleButton?.classList.toggle("active", state.isPresentationMode);

  const label = state.isPresentationMode ? "발표 화면 종료" : "발표 화면 최대화";
  presentationToggleButton?.setAttribute("aria-label", label);
  presentationToggleButton?.setAttribute("title", label);
  updatePresentationStage();
}

function updatePresentationStage() {
  document.body.dataset.presentationStage = getPresentationStage();
}

function getPresentationStage() {
  if (!state.isPresentationMode) {
    return "normal";
  }

  if (!state.currentGameKey) {
    return "games";
  }

  if (!state.currentStageKey) {
    return "stages";
  }

  if (getCurrentGame()?.kind === "topics" && !getCurrentTopic()) {
    return "topics";
  }

  if (!getCurrentOption()) {
    return "options";
  }

  return "live";
}

function handlePresentationShortcuts(event) {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showPreviousPrompt();
    return;
  }

  if (!state.isPresentationMode) {
    return;
  }

  if (event.key === " " || event.key === "ArrowRight") {
    event.preventDefault();
    showNextPrompt();
  }
}

function updateConnectionLabels() {
  if (connectionStatusLabel) {
    connectionStatusLabel.textContent = state.storageMode === "supabase" ? "연결됨" : "연결안됨";
  }
}

function getErrorMessage(error) {
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
  } catch (stringifyError) {
    return "알 수 없는 오류";
  }
}

function setMode(mode) {
  state.currentMode = mode;
  modePanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.modePanel === mode);
  });
}

function shuffle(items) {
  const array = [...items];

  for (let index = array.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
  }

  return array;
}

function seededShuffle(items, seedSource) {
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

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function fetchDataFromSupabase() {
  const { data, error } = await state.supabase
    .from("charades_topics")
    .select("id, name, prompts")
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  const next = createEmptyGameData();

  data.forEach((row) => {
    const meta = row.prompts || {};
    const gameKey = GAME_TYPES.some((game) => game.key === meta.game) ? meta.game : "charades";
    const stageKey = STAGES.some((stage) => stage.key === meta.stage) ? meta.stage : STAGES[0].key;
    const items = Array.isArray(meta.items) ? meta.items : [];

    if (gameKey === "charades") {
      next.charades[stageKey].push({ name: row.name || "", prompts: items });
    } else {
      next.drawing[stageKey] = items;
    }
  });

  return normalizeGameData(next);
}

async function fetchSettingsFromSupabase() {
  const { data, error } = await state.supabase
    .from("charades_settings")
    .select("id, timer_seconds")
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  const next = createDefaultSettings();

  data.forEach((row) => {
    if (row.id === 1) {
      next.charades = row.timer_seconds;
    }
    if (row.id === 2) {
      next.drawing = row.timer_seconds;
    }
  });

  return normalizeSettings(next);
}

async function saveDataToSupabase(data) {
  const payload = [];
  let id = 1;

  STAGES.forEach((stage) => {
    data.charades[stage.key].forEach((topic) => {
      payload.push({
        id,
        name: topic.name,
        prompts: { game: "charades", stage: stage.key, items: topic.prompts },
        updated_at: new Date().toISOString(),
      });
      id += 1;
    });

    payload.push({
      id,
      name: DRAWING_TOPIC_NAME,
      prompts: { game: "drawing", stage: stage.key, items: data.drawing[stage.key] },
      updated_at: new Date().toISOString(),
    });
    id += 1;
  });

  await clearDataInSupabase();

  const { error } = await state.supabase
    .from("charades_topics")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    throw error;
  }
}

async function saveSettingsToSupabase(settings) {
  const { error } = await state.supabase
    .from("charades_settings")
    .upsert(
      [
        { id: 1, timer_seconds: settings.charades, updated_at: new Date().toISOString() },
        { id: 2, timer_seconds: settings.drawing, updated_at: new Date().toISOString() },
      ],
      { onConflict: "id" }
    );

  if (error) {
    throw error;
  }
}

async function clearDataInSupabase() {
  const { error } = await state.supabase.from("charades_topics").delete().gte("id", 1);

  if (error) {
    throw error;
  }
}

async function resetSettingsInSupabase() {
  const { error } = await state.supabase
    .from("charades_settings")
    .upsert(
      [
        { id: 1, timer_seconds: 60, updated_at: new Date().toISOString() },
        { id: 2, timer_seconds: 10, updated_at: new Date().toISOString() },
      ],
      { onConflict: "id" }
    );

  if (error) {
    throw error;
  }
}
