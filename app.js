const STORAGE_KEY = "charades-quiz-topics-v1";
const SETTINGS_KEY = "charades-quiz-settings-v1";
const TOPIC_COUNT = 5;
const initialMode = document.body.dataset.initialMode || "play";
const supabaseConfig = window.SUPABASE_CONFIG || null;

const sampleTopics = [
  {
    name: "동물",
    prompts: ["기린", "펭귄", "원숭이", "고양이", "캥거루", "악어"],
  },
  {
    name: "직업",
    prompts: ["의사", "소방관", "요리사", "가수", "축구선수", "사진작가"],
  },
  {
    name: "영화",
    prompts: ["타이타닉", "겨울왕국", "어벤져스", "알라딘", "쥬라기공원"],
  },
  {
    name: "음식",
    prompts: ["김밥", "피자", "떡볶이", "햄버거", "라면", "아이스크림"],
  },
  {
    name: "운동",
    prompts: ["수영", "농구", "복싱", "양궁", "탁구", "배드민턴"],
  },
];

const state = {
  topics: [],
  currentMode: "play",
  currentTopicIndex: null,
  promptQueue: [],
  currentPrompt: "",
  storageMode: "local",
  connectionStatus: "로컬 저장",
  supabase: null,
  settings: {
    timerSeconds: 60,
  },
  timerRemaining: 60,
  timerIntervalId: null,
  timerRunning: false,
};

const topicGrid = document.querySelector("#topic-grid");
const currentTopicName = document.querySelector("#current-topic-name");
const remainingCount = document.querySelector("#remaining-count");
const promptText = document.querySelector("#prompt-text");
const adminForm = document.querySelector("#admin-form");
const topicEditorTemplate = document.querySelector("#topic-editor-template");
const modePanels = document.querySelectorAll("[data-mode-panel]");
const storageModeLabel = document.querySelector("#storage-mode-label");
const connectionStatusLabel = document.querySelector("#connection-status-label");
const timerSecondsInput = document.querySelector("#timer-seconds-input");
const timerDisplay = document.querySelector("#timer-display");
const timerDefaultLabel = document.querySelector("#timer-default-label");
const timerStartButton = document.querySelector("#timer-start-button");
const timerPauseButton = document.querySelector("#timer-pause-button");
const timerResetButton = document.querySelector("#timer-reset-button");

document.querySelector("#save-button").addEventListener("click", handleSave);
document.querySelector("#clear-button").addEventListener("click", handleClear);
document
  .querySelector("#fill-sample-button")
  .addEventListener("click", handleFillSample);
document
  .querySelector("#next-prompt-button")
  .addEventListener("click", showNextPrompt);
document
  .querySelector("#reset-topic-button")
  .addEventListener("click", resetCurrentTopic);
document
  .querySelector("#shuffle-current-button")
  .addEventListener("click", reshuffleCurrentTopic);
timerStartButton?.addEventListener("click", startTimer);
timerPauseButton?.addEventListener("click", pauseTimer);
timerResetButton?.addEventListener("click", resetTimer);

init().catch(() => {
  state.topics = createEmptyTopics();
  state.settings = loadSettingsFromLocal();
  state.timerRemaining = state.settings.timerSeconds;
  renderAdminEditors();
  renderTopicButtons();
  setMode(initialMode);
  updatePlayView();
  updateTimerView();
});

async function init() {
  setupSupabase();
  const data = await loadAppData();
  state.topics = data.topics;
  state.settings = data.settings;
  state.timerRemaining = state.settings.timerSeconds;
  state.currentMode = initialMode;
  renderAdminEditors();
  renderTopicButtons();
  setMode(initialMode);
  updatePlayView();
  updateTimerView();
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
    state.connectionStatus = "설정 전";
    updateConnectionLabels();
    return;
  }

  state.supabase = window.supabase.createClient(
    supabaseConfig.url,
    supabaseConfig.anonKey
  );
  state.storageMode = "supabase";
  state.connectionStatus = "연결 확인 중";
  updateConnectionLabels();
}

async function loadAppData() {
  if (state.supabase) {
    try {
      const [remoteTopics, remoteSettings] = await Promise.all([
        fetchTopicsFromSupabase(),
        fetchSettingsFromSupabase(),
      ]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteTopics));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(remoteSettings));
      state.connectionStatus = "Supabase 연결됨";
      updateConnectionLabels();
      return {
        topics: remoteTopics,
        settings: remoteSettings,
      };
    } catch (error) {
      state.storageMode = "local";
      state.connectionStatus = "원격 실패, 로컬 사용";
      updateConnectionLabels();
    }
  }

  return {
    topics: loadTopicsFromLocal(),
    settings: loadSettingsFromLocal(),
  };
}

function loadTopicsFromLocal() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return createEmptyTopics();
  }

  try {
    const parsed = JSON.parse(saved);
    return normalizeTopics(parsed);
  } catch (error) {
    return createEmptyTopics();
  }
}

function loadSettingsFromLocal() {
  const saved = localStorage.getItem(SETTINGS_KEY);

  if (!saved) {
    return { timerSeconds: 60 };
  }

  try {
    const parsed = JSON.parse(saved);
    return normalizeSettings(parsed);
  } catch (error) {
    return { timerSeconds: 60 };
  }
}

function createEmptyTopics() {
  return Array.from({ length: TOPIC_COUNT }, () => ({
    name: "",
    prompts: [],
  }));
}

function normalizeTopics(topics) {
  return Array.from({ length: TOPIC_COUNT }, (_, index) => {
    const topic = topics[index] || {};
    return {
      name: typeof topic.name === "string" ? topic.name.trim() : "",
      prompts: Array.isArray(topic.prompts)
        ? topic.prompts
            .map((prompt) => String(prompt).trim())
            .filter(Boolean)
        : [],
    };
  });
}

function normalizeSettings(settings) {
  const timerSeconds = Number(settings?.timerSeconds);

  return {
    timerSeconds:
      Number.isFinite(timerSeconds) && timerSeconds >= 10 && timerSeconds <= 600
        ? Math.round(timerSeconds)
        : 60,
  };
}

function renderAdminEditors() {
  if (adminForm) {
    adminForm.innerHTML = "";
  }

  if (timerSecondsInput) {
    timerSecondsInput.value = String(state.settings.timerSeconds);
  }

  state.topics.forEach((topic, index) => {
    const fragment = topicEditorTemplate.content.cloneNode(true);
    const badge = fragment.querySelector(".topic-badge");
    const nameInput = fragment.querySelector(".topic-name-input");
    const promptsInput = fragment.querySelector(".topic-prompts-input");

    badge.textContent = index + 1;
    nameInput.value = topic.name;
    promptsInput.value = topic.prompts.join("\n");
    nameInput.dataset.topicIndex = index;
    promptsInput.dataset.topicIndex = index;

    adminForm?.appendChild(fragment);
  });
}

function collectTopicsFromForm() {
  const nameInputs = [...document.querySelectorAll(".topic-name-input")];
  const promptInputs = [...document.querySelectorAll(".topic-prompts-input")];

  return Array.from({ length: TOPIC_COUNT }, (_, index) => {
    const name = nameInputs[index]?.value.trim() || "";
    const promptsRaw = promptInputs[index]?.value || "";
    const prompts = promptsRaw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    return { name, prompts };
  });
}

async function handleSave() {
  state.topics = normalizeTopics(collectTopicsFromForm());
  state.settings = normalizeSettings({
    timerSeconds: timerSecondsInput?.value || state.settings.timerSeconds,
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.topics));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  resetTimer();

  if (state.supabase) {
    try {
      await Promise.all([
        saveTopicsToSupabase(state.topics),
        saveSettingsToSupabase(state.settings),
      ]);
      state.storageMode = "supabase";
      state.connectionStatus = "Supabase 저장 완료";
    } catch (error) {
      state.storageMode = "local";
      state.connectionStatus = "원격 저장 실패, 로컬 저장";
    }
  }

  const hasCurrentTopic =
    state.currentTopicIndex !== null &&
    state.topics[state.currentTopicIndex] &&
    state.topics[state.currentTopicIndex].prompts.length > 0;

  if (!hasCurrentTopic) {
    state.currentTopicIndex = null;
    state.promptQueue = [];
    state.currentPrompt = "";
  } else {
    buildPromptQueue(state.currentTopicIndex);
  }

  renderTopicButtons();
  updatePlayView();
  updateTimerView();
  updateConnectionLabels();
  if (window.location.pathname.endsWith("/admin.html")) {
    window.location.href = "./play.html";
    return;
  }

  setMode("play");
}

async function handleClear() {
  state.topics = createEmptyTopics();
  state.settings = { timerSeconds: 60 };
  state.currentTopicIndex = null;
  state.promptQueue = [];
  state.currentPrompt = "";
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SETTINGS_KEY);
  resetTimer();

  if (state.supabase) {
    try {
      await Promise.all([clearTopicsInSupabase(), resetSettingsInSupabase()]);
      state.storageMode = "supabase";
      state.connectionStatus = "Supabase 초기화 완료";
    } catch (error) {
      state.storageMode = "local";
      state.connectionStatus = "원격 초기화 실패";
    }
  }

  renderAdminEditors();
  renderTopicButtons();
  updatePlayView();
  updateTimerView();
  updateConnectionLabels();
}

function handleFillSample() {
  state.topics = normalizeTopics(sampleTopics);
  renderAdminEditors();
}

function renderTopicButtons() {
  topicGrid.innerHTML = "";

  state.topics.forEach((topic, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "topic-button";

    if (!topic.name || topic.prompts.length === 0) {
      button.classList.add("empty");
      button.disabled = true;
      button.textContent = topic.name || `주제 ${index + 1}`;
    } else {
      button.textContent = topic.name;
      button.addEventListener("click", () => selectTopic(index));
    }

    if (state.currentTopicIndex === index) {
      button.classList.add("active");
    }

    topicGrid.appendChild(button);
  });
}

function selectTopic(index) {
  state.currentTopicIndex = index;
  buildPromptQueue(index);
  renderTopicButtons();
  updatePlayView();
}

function buildPromptQueue(index) {
  const prompts = [...state.topics[index].prompts];
  state.promptQueue = shuffle(prompts);
  state.currentPrompt = "";
  showNextPrompt();
}

function reshuffleCurrentTopic() {
  if (state.currentTopicIndex === null) {
    return;
  }

  buildPromptQueue(state.currentTopicIndex);
  updatePlayView();
}

function resetCurrentTopic() {
  if (state.currentTopicIndex === null) {
    return;
  }

  buildPromptQueue(state.currentTopicIndex);
  updatePlayView();
}

function showNextPrompt() {
  if (state.currentTopicIndex === null) {
    state.currentPrompt = "";
    updatePlayView();
    return;
  }

  if (state.promptQueue.length === 0) {
    state.currentPrompt = "제시어를 모두 봤어요";
    updatePlayView();
    return;
  }

  state.currentPrompt = state.promptQueue.shift();
  updatePlayView();
}

function updatePlayView() {
  const currentTopic =
    state.currentTopicIndex !== null ? state.topics[state.currentTopicIndex] : null;

  currentTopicName.textContent = currentTopic?.name || "없음";
  remainingCount.textContent = String(state.promptQueue.length);

  if (!currentTopic) {
    promptText.textContent = "먼저 주제를 선택해 주세요";
    return;
  }

  promptText.textContent =
    state.currentPrompt || "제시어를 준비 중입니다";
}

function updateTimerView() {
  if (timerDisplay) {
    timerDisplay.textContent = formatTime(state.timerRemaining);
    timerDisplay.classList.toggle("is-danger", state.timerRemaining <= 10);
  }

  if (timerDefaultLabel) {
    timerDefaultLabel.textContent = `${state.settings.timerSeconds}초`;
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
  state.timerRemaining = state.settings.timerSeconds;
  updateTimerView();
}

function updateConnectionLabels() {
  if (storageModeLabel) {
    storageModeLabel.textContent =
      state.storageMode === "supabase" ? "Supabase" : "브라우저 로컬";
  }

  if (connectionStatusLabel) {
    connectionStatusLabel.textContent = state.connectionStatus;
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

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function fetchTopicsFromSupabase() {
  const { data, error } = await state.supabase
    .from("charades_topics")
    .select("id, name, prompts")
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  const topics = createEmptyTopics();

  data.forEach((row) => {
    const index = Number(row.id) - 1;

    if (index >= 0 && index < TOPIC_COUNT) {
      topics[index] = {
        name: typeof row.name === "string" ? row.name.trim() : "",
        prompts: Array.isArray(row.prompts)
          ? row.prompts.map((prompt) => String(prompt).trim()).filter(Boolean)
          : [],
      };
    }
  });

  return normalizeTopics(topics);
}

async function fetchSettingsFromSupabase() {
  const { data, error } = await state.supabase
    .from("charades_settings")
    .select("timer_seconds")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeSettings({
    timerSeconds: data?.timer_seconds ?? 60,
  });
}

async function saveTopicsToSupabase(topics) {
  const payload = topics.map((topic, index) => ({
    id: index + 1,
    name: topic.name,
    prompts: topic.prompts,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await state.supabase
    .from("charades_topics")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    throw error;
  }
}

async function saveSettingsToSupabase(settings) {
  const { error } = await state.supabase.from("charades_settings").upsert(
    {
      id: 1,
      timer_seconds: settings.timerSeconds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    throw error;
  }
}

async function clearTopicsInSupabase() {
  const { error } = await state.supabase
    .from("charades_topics")
    .delete()
    .gte("id", 1)
    .lte("id", TOPIC_COUNT);

  if (error) {
    throw error;
  }
}

async function resetSettingsInSupabase() {
  const { error } = await state.supabase.from("charades_settings").upsert(
    {
      id: 1,
      timer_seconds: 60,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    throw error;
  }
}
