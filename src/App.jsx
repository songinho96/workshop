import { useEffect, useRef, useState } from "react";
import {
  DRAWING_TOPIC_NAME,
  FINISHED_MESSAGE,
  GAME_TYPES,
  sampleData,
  STAGES,
  START_MESSAGE,
} from "./constants.js";
import {
  buildPromptOptions,
  clearLocalState,
  createDefaultSettings,
  createEmptyGameData,
  createEmptyTopic,
  formatTime,
  getErrorMessage,
  getPresentationStage,
  isActualPrompt,
  loadDataFromLocal,
  loadSettingsFromLocal,
  normalizeGameData,
  normalizeSettings,
  persistLocalState,
  pruneEmptyAdminData,
  shuffle,
} from "./game-utils.js";
import {
  clearDataInSupabase,
  createSupabaseBrowserClient,
  fetchDataFromSupabase,
  fetchSettingsFromSupabase,
  resetSettingsInSupabase,
  saveDataToSupabase,
  saveSettingsToSupabase,
} from "./supabase-client.js";

function TabSet({ items, activeKey, onClick, type, disabled = false }) {
  return (
    <div className={`${type}-tabs`}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`${type}-tab-button${item.key === activeKey ? " active" : ""}`}
          disabled={disabled}
          onClick={() => onClick(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function TopicEditor({ index, topic, onChange, onRemove }) {
  const promptCount = topic.prompts.filter((prompt) => prompt.trim()).length;

  return (
    <section className="topic-editor">
      <div className="topic-editor-header">
        <span className="topic-badge">{index + 1}</span>
        <input
          className="topic-name-input"
          type="text"
          maxLength={30}
          placeholder="주제 이름"
          value={topic.name}
          onChange={(event) => onChange(index, { ...topic, name: event.target.value })}
        />
        <span className="prompt-count-badge">{promptCount}개</span>
        <button type="button" className="remove-topic-button" onClick={() => onRemove(index)}>
          삭제
        </button>
      </div>
      <textarea
        className="topic-prompts-input"
        rows={8}
        placeholder="제시어를 한 줄에 하나씩 입력해 주세요"
        value={topic.prompts.join("\n")}
        onChange={(event) =>
          onChange(index, {
            ...topic,
            prompts: event.target.value.split("\n"),
          })
        }
      />
    </section>
  );
}

export default function App({ initialMode }) {
  const supabaseRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const [data, setData] = useState(() => createEmptyGameData());
  const [settings, setSettings] = useState(() => createDefaultSettings());
  const [adminTimerDrafts, setAdminTimerDrafts] = useState(() => ({
    charades: String(createDefaultSettings().charades),
    drawing: String(createDefaultSettings().drawing),
  }));
  const [adminGameKey, setAdminGameKey] = useState(GAME_TYPES[0].key);
  const [adminStageKey, setAdminStageKey] = useState(STAGES[0].key);
  const [currentGameKey, setCurrentGameKey] = useState(null);
  const [currentStageKey, setCurrentStageKey] = useState(null);
  const [currentTopicIndex, setCurrentTopicIndex] = useState(null);
  const [currentOptionKey, setCurrentOptionKey] = useState(null);
  const [promptQueue, setPromptQueue] = useState([]);
  const [promptHistory, setPromptHistory] = useState([]);
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [storageMode, setStorageMode] = useState("local");
  const [connectionStatus, setConnectionStatus] = useState("설정 필요");
  const [timerRemaining, setTimerRemaining] = useState(settings.charades);
  const [timerRunning, setTimerRunning] = useState(false);
  const [isPresentationMode, setIsPresentationMode] = useState(false);

  const currentGame = GAME_TYPES.find((game) => game.key === currentGameKey) || null;
  const currentStage = STAGES.find((stage) => stage.key === currentStageKey) || null;
  const currentTopics = currentStageKey ? data.charades[currentStageKey] || [] : [];
  const currentTopic = currentTopicIndex === null ? null : currentTopics[currentTopicIndex] || null;
  const currentPromptSource = getCurrentPromptSource();
  const promptOptions = buildPromptOptions(currentPromptSource, getOptionCount());
  const currentOption =
    promptOptions.find((option) => option.key === currentOptionKey) || null;
  const presentationStage = getPresentationStage({
    isPresentationMode,
    currentGameKey,
    currentStageKey,
    currentGame,
    currentTopic,
    currentOption,
  });
  const adminGame = GAME_TYPES.find((game) => game.key === adminGameKey) || GAME_TYPES[0];
  const adminTopics = data.charades[adminStageKey] || [];
  const drawingPhrases = data.drawing[adminStageKey] || [];
  const drawingPromptCount = drawingPhrases.filter((phrase) => phrase.trim()).length;

  function getCurrentPromptSource() {
    if (!currentGame || !currentStageKey) {
      return [];
    }

    if (currentGame.kind === "topics") {
      return currentTopic?.prompts || [];
    }

    return data.drawing[currentStageKey] || [];
  }

  function getOptionCount() {
    if (currentGameKey === "drawing" && currentStageKey === "semifinal") {
      return 4;
    }

    return 2;
  }

  function pauseTimer() {
    setTimerRunning(false);

    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }

  function resetTimer(nextGameKey) {
    pauseTimer();
    const targetGameKey = nextGameKey || currentGameKey || GAME_TYPES[0].key;
    setTimerRemaining(settings[targetGameKey]);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const supabase = createSupabaseBrowserClient();
      supabaseRef.current = supabase;

      if (!supabase) {
        if (!cancelled) {
          setStorageMode("local");
          setConnectionStatus("설정 필요");
          const localData = loadDataFromLocal();
          const localSettings = loadSettingsFromLocal();
          setData(localData);
          setSettings(localSettings);
          setTimerRemaining(localSettings.charades);
        }
        return;
      }

      if (!cancelled) {
        setStorageMode("supabase");
        setConnectionStatus("연결 확인 중");
      }

      try {
        const [remoteData, remoteSettings] = await Promise.all([
          fetchDataFromSupabase(supabase),
          fetchSettingsFromSupabase(supabase),
        ]);

        if (cancelled) {
          return;
        }

        persistLocalState(remoteData, remoteSettings);
        setData(remoteData);
        setSettings(remoteSettings);
        setTimerRemaining(remoteSettings.charades);
        setConnectionStatus("연결됨");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setStorageMode("local");
        setConnectionStatus(`원격 실패: ${getErrorMessage(error)}`);
        const localData = loadDataFromLocal();
        const localSettings = loadSettingsFromLocal();
        setData(localData);
        setSettings(localSettings);
        setTimerRemaining(localSettings.charades);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      if (timerIntervalRef.current) {
        window.clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setAdminTimerDrafts({
      charades: String(settings.charades),
      drawing: String(settings.drawing),
    });
  }, [settings]);

  useEffect(() => {
    document.body.classList.toggle("presentation-mode", isPresentationMode);
    document.body.dataset.presentationStage = presentationStage;
  }, [isPresentationMode, presentationStage]);

  useEffect(() => {
    function syncPresentationModeWithFullscreen() {
      setIsPresentationMode(Boolean(document.fullscreenElement));
    }

    function handlePresentationShortcuts(event) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPreviousPrompt();
        return;
      }

      if (!isPresentationMode) {
        return;
      }

      if (event.key === " " || event.key === "ArrowRight") {
        event.preventDefault();
        showNextPrompt();
      }
    }

    document.addEventListener("fullscreenchange", syncPresentationModeWithFullscreen);
    document.addEventListener("keydown", handlePresentationShortcuts);

    return () => {
      document.removeEventListener("fullscreenchange", syncPresentationModeWithFullscreen);
      document.removeEventListener("keydown", handlePresentationShortcuts);
    };
  });

  function selectPlayGame(gameKey) {
    pauseTimer();
    setCurrentGameKey(gameKey);
    setCurrentStageKey(null);
    setCurrentTopicIndex(null);
    setCurrentOptionKey(null);
    setPromptQueue([]);
    setPromptHistory([]);
    setCurrentPrompt("");
    setTimerRemaining(settings[gameKey]);
  }

  function selectPlayStage(stageKey) {
    setCurrentStageKey(stageKey);
    setCurrentTopicIndex(null);
    setCurrentOptionKey(null);
    setPromptQueue([]);
    setPromptHistory([]);
    setCurrentPrompt("");
  }

  function selectTopic(index) {
    setCurrentTopicIndex(index);
    setCurrentOptionKey(null);
    setPromptQueue([]);
    setPromptHistory([]);
    setCurrentPrompt("");
  }

  function buildQueueForOption(optionKey) {
    const option = promptOptions.find((item) => item.key === optionKey) || null;
    if (!option) {
      setPromptQueue([]);
      setPromptHistory([]);
      setCurrentPrompt("");
      return;
    }

    setCurrentOptionKey(optionKey);
    setPromptQueue(shuffle(option.prompts));
    setPromptHistory([]);
    setCurrentPrompt(START_MESSAGE);
  }

  function reshuffleCurrentSelection() {
    if (!currentOption) {
      return;
    }

    buildQueueForOption(currentOption.key);
  }

  function resetCurrentTopic() {
    if (!currentOption) {
      return;
    }

    buildQueueForOption(currentOption.key);
  }

  function clearCurrentSelection() {
    setCurrentGameKey(null);
    setCurrentStageKey(null);
    setCurrentTopicIndex(null);
    setCurrentOptionKey(null);
    setPromptQueue([]);
    setPromptHistory([]);
    setCurrentPrompt("");
  }

  function restartFlow() {
    clearCurrentSelection();
    pauseTimer();
    setTimerRemaining(settings.charades);
  }

  function goBackPresentationStep() {
    if (!isPresentationMode) {
      return;
    }

    if (currentOptionKey) {
      setCurrentOptionKey(null);
      setPromptQueue([]);
      setPromptHistory([]);
      setCurrentPrompt("");
      pauseTimer();
      resetTimer();
      return;
    }

    if (currentGame?.kind === "topics" && currentTopicIndex !== null) {
      setCurrentTopicIndex(null);
      setPromptQueue([]);
      setPromptHistory([]);
      setCurrentPrompt("");
      return;
    }

    if (currentStageKey) {
      setCurrentStageKey(null);
      setCurrentTopicIndex(null);
      setCurrentOptionKey(null);
      setPromptQueue([]);
      setPromptHistory([]);
      setCurrentPrompt("");
      pauseTimer();
      resetTimer(currentGameKey || GAME_TYPES[0].key);
      return;
    }

    if (currentGameKey) {
      restartFlow();
    }
  }

  function showNextPrompt() {
    if (!currentOption) {
      return;
    }

    if (currentPrompt && isActualPrompt(currentPrompt)) {
      setPromptHistory((previous) => [...previous, currentPrompt]);
    }

    setPromptQueue((previous) => {
      if (previous.length === 0) {
        setCurrentPrompt(FINISHED_MESSAGE);
        return previous;
      }

      const [nextPrompt, ...rest] = previous;
      setCurrentPrompt(nextPrompt);
      return rest;
    });
  }

  function showPreviousPrompt() {
    if (!currentOption || promptHistory.length === 0) {
      return;
    }

    const nextHistory = [...promptHistory];
    const previousPrompt = nextHistory.pop();

    if (isActualPrompt(currentPrompt)) {
      setPromptQueue((previous) => [currentPrompt, ...previous]);
    }

    setPromptHistory(nextHistory);
    setCurrentPrompt(previousPrompt || START_MESSAGE);
  }

  function startTimer() {
    if (timerRunning) {
      return;
    }

    setTimerRunning(true);
    timerIntervalRef.current = window.setInterval(() => {
      setTimerRemaining((previous) => {
        if (previous <= 1) {
          pauseTimer();
          return 0;
        }

        return previous - 1;
      });
    }, 1000);
  }

  async function togglePresentationMode() {
    if (isPresentationMode) {
      await exitPresentationMode();
      return;
    }

    clearCurrentSelection();
    resetTimer();
    setIsPresentationMode(true);

    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        setIsPresentationMode(Boolean(document.fullscreenElement));
      }
    }
  }

  async function exitPresentationMode() {
    setIsPresentationMode(false);

    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        setIsPresentationMode(Boolean(document.fullscreenElement));
      }
    }
  }

  function updateCharadesTopics(nextTopics) {
    setData((previous) => ({
      ...previous,
      charades: {
        ...previous.charades,
        [adminStageKey]: nextTopics,
      },
    }));
  }

  function updateDrawingPhrases(value) {
    setData((previous) => ({
      ...previous,
      drawing: {
        ...previous.drawing,
        [adminStageKey]: value.split("\n"),
      },
    }));
  }

  function updateTimerSettingDraft(gameKey, value) {
    setAdminTimerDrafts((previous) => ({
      ...previous,
      [gameKey]: value,
    }));
  }

  function commitTimerSetting(gameKey) {
    const rawValue = adminTimerDrafts[gameKey];
    const nextSettings = normalizeSettings({
      ...settings,
      [gameKey]: Number(rawValue),
    });
    setSettings(nextSettings);
    setAdminTimerDrafts((previous) => ({
      ...previous,
      [gameKey]: String(nextSettings[gameKey]),
    }));

    if (currentGameKey === gameKey || (!currentGameKey && gameKey === GAME_TYPES[0].key)) {
      pauseTimer();
      setTimerRemaining(nextSettings[gameKey]);
    }
  }

  function addAdminTopic() {
    if (adminGameKey !== "charades") {
      return;
    }

    updateCharadesTopics([...adminTopics, createEmptyTopic()]);
  }

  function removeAdminTopic(index) {
    if (adminTopics.length <= 1) {
      updateCharadesTopics([createEmptyTopic()]);
      return;
    }

    updateCharadesTopics(adminTopics.filter((_, topicIndex) => topicIndex !== index));
  }

  function updateAdminTopic(index, nextTopic) {
    updateCharadesTopics(
      adminTopics.map((topic, topicIndex) => (topicIndex === index ? nextTopic : topic))
    );
  }

  async function handleSave() {
    const nextData = pruneEmptyAdminData(data);
    const nextSettings = normalizeSettings({
      ...settings,
      charades: Number(adminTimerDrafts.charades),
      drawing: Number(adminTimerDrafts.drawing),
    });

    setData(nextData);
    setSettings(nextSettings);
    persistLocalState(nextData, nextSettings);
    resetTimer();

    const supabase = supabaseRef.current;
    if (supabase) {
      try {
        await Promise.all([
          saveDataToSupabase(supabase, nextData),
          saveSettingsToSupabase(supabase, nextSettings),
        ]);
        setStorageMode("supabase");
        setConnectionStatus("연결됨");
      } catch (error) {
        setStorageMode("local");
        setConnectionStatus(`원격 저장 실패: ${getErrorMessage(error)}`);
      }
    }

    if (window.location.pathname.endsWith("/admin.html")) {
      window.location.href = "./play.html";
    }
  }

  async function handleClear() {
    const emptyData = createEmptyGameData();
    const defaultSettings = createDefaultSettings();

    setData(emptyData);
    setSettings(defaultSettings);
    clearCurrentSelection();
    clearLocalState();
    pauseTimer();
    setTimerRemaining(defaultSettings.charades);

    const supabase = supabaseRef.current;
    if (supabase) {
      try {
        await Promise.all([clearDataInSupabase(supabase), resetSettingsInSupabase(supabase)]);
        setStorageMode("supabase");
        setConnectionStatus("연결됨");
      } catch (error) {
        setStorageMode("local");
        setConnectionStatus(`원격 초기화 실패: ${getErrorMessage(error)}`);
      }
    }
  }

  function handleFillSample() {
    const nextData = normalizeGameData(sampleData);
    const nextSettings = createDefaultSettings();
    setData(nextData);
    setSettings(nextSettings);
    setTimerRemaining(nextSettings[currentGameKey || GAME_TYPES[0].key]);
  }

  const currentTopicName =
    currentGame?.kind === "phrases" ? DRAWING_TOPIC_NAME : currentTopic?.name || "없음";
  const displayPrompt = (() => {
    if (!currentGame) {
      return "먼저 게임을 선택해 주세요";
    }

    if (!currentStage) {
      return "단계를 선택해 주세요";
    }

    if (currentGame.kind === "topics" && !currentTopic) {
      return "주제를 선택해 주세요";
    }

    if (!currentOption) {
      return "1안 또는 2안을 선택해 시작해 주세요";
    }

    return currentPrompt || START_MESSAGE;
  })();

  const timerDefaultKey = currentGameKey || GAME_TYPES[0].key;

  return (
    <>
      <div className="background-shape shape-one"></div>
      <div className="background-shape shape-two"></div>

      <main className="app-shell">
        <header className="hero">
          <div>
            <p className="eyebrow">WORKSHOP GAME</p>
            <h1>{initialMode === "admin" ? "게임 관리자 페이지" : "게임 진행 보드"}</h1>
            <p className="hero-copy">
              {initialMode === "admin"
                ? "상단 게임 탭으로 `몸으로 말해요`와 `10초 그림 그리기`를 나눠 관리하고, 단계별로 내용을 저장할 수 있어요."
                : "몸으로 말해요와 10초 그림 그리기를 게임 탭으로 나눠 진행할 수 있어요."}
            </p>
          </div>

          <nav className="mode-switch page-links" aria-label="페이지 이동">
            <a className={`mode-button${initialMode === "play" ? " active" : ""}`} href="./play.html">
              사용 페이지
            </a>
            <a className={`mode-button${initialMode === "admin" ? " active" : ""}`} href="./admin.html">
              관리자 페이지
            </a>
          </nav>
        </header>

        {initialMode === "play" ? (
          <section className="panel play-panel active">
            <div className="panel-header">
              <div>
                <p className="section-label">PLAY MODE</p>
                <h2>게임과 단계를 선택해 진행하세요</h2>
              </div>
              <div className="play-header-actions">
                <button
                  className={`icon-button${isPresentationMode ? " active" : ""}`}
                  type="button"
                  aria-label={isPresentationMode ? "발표 화면 종료" : "발표 화면 최대화"}
                  title={isPresentationMode ? "발표 화면 종료" : "발표 화면 최대화"}
                  onClick={togglePresentationMode}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!currentOption}
                  onClick={reshuffleCurrentSelection}
                >
                  현재 안 다시 섞기
                </button>
              </div>
            </div>

            <div className="connection-bar">
              <div className="status-pill">
                연결 상태 <strong>{storageMode === "supabase" ? "연결됨" : "연결안됨"}</strong>
              </div>
              <div className="status-pill">
                상세 상태 <strong>{connectionStatus}</strong>
              </div>
            </div>

            <section className="stage-panel">
              <TabSet
                items={GAME_TYPES}
                activeKey={currentGameKey}
                onClick={selectPlayGame}
                type="game"
              />
              <TabSet
                items={STAGES}
                activeKey={currentStageKey}
                onClick={selectPlayStage}
                type="stage"
                disabled={!currentGameKey}
              />
            </section>

            <section className="timer-panel">
              <div className="timer-display-wrap">
                <p className="section-label">GAME TIMER</p>
                <div className={`timer-display${timerRemaining <= 10 ? " is-danger" : ""}`}>
                  {formatTime(timerRemaining)}
                </div>
                <p className="timer-meta">
                  기본 시간 <strong>{settings[timerDefaultKey]}초</strong>
                </p>
              </div>

              <div className="timer-controls">
                <button className="primary-button" type="button" onClick={startTimer}>
                  타이머 시작
                </button>
                <button className="secondary-button" type="button" onClick={pauseTimer}>
                  일시정지
                </button>
                <button className="ghost-button" type="button" onClick={() => resetTimer()}>
                  시간 리셋
                </button>
              </div>
            </section>

            {currentGame?.kind === "topics" && currentStageKey ? (
              <div className="topic-grid">
                {currentTopics.map((topic, index) => (
                  <button
                    key={`${topic.name}-${index}`}
                    type="button"
                    className={`topic-button${index === currentTopicIndex ? " active" : ""}`}
                    disabled={!topic.name || topic.prompts.length === 0}
                    onClick={() => selectTopic(index)}
                  >
                    {topic.name || `주제 ${index + 1}`}
                  </button>
                ))}
              </div>
            ) : null}

            {promptOptions.length > 0 ? (
              <section className="option-panel">
                <div className="option-panel-copy">
                  <p className="section-label">PROMPT SET</p>
                  <h3>사용할 안을 선택하세요</h3>
                </div>
                <div className="option-buttons">
                  {promptOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`option-button${option.key === currentOptionKey ? " active" : ""}`}
                      onClick={() => buildQueueForOption(option.key)}
                    >
                      {option.label} ({option.prompts.length}개)
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="card-area">
              <div className="status-row">
                <div className="status-pill">현재 게임 <strong>{currentGame?.label || "없음"}</strong></div>
                <div className="status-pill">선택한 단계 <strong>{currentStage?.label || "없음"}</strong></div>
                <div className="status-pill">선택한 주제 <strong>{currentTopicName}</strong></div>
                <div className="status-pill">선택한 안 <strong>{currentOption?.label || "없음"}</strong></div>
                <div className="status-pill">맞춘 개수 <strong>{promptHistory.length}</strong></div>
                <div className="status-pill">남은 제시어 <strong>{promptQueue.length}</strong></div>
              </div>

              <article className="prompt-card">
                <p className="prompt-card-label">랜덤 제시어</p>
                <h3>{displayPrompt}</h3>
              </article>

              <div className="card-actions">
                <button
                  className="primary-button"
                  type="button"
                  disabled={!currentOption}
                  onClick={showNextPrompt}
                >
                  다음 제시어 보기
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={!currentOption}
                  onClick={resetCurrentTopic}
                >
                  현재 안 처음부터
                </button>
                <button className="secondary-button" type="button" onClick={restartFlow}>
                  다시 시작
                </button>
              </div>
            </section>
          </section>
        ) : (
          <section className="panel admin-panel active">
            <div className="panel-header">
              <div>
                <p className="section-label">ADMIN MODE</p>
                <h2>게임별 주제와 제시어를 입력해 주세요</h2>
              </div>
              <button className="secondary-button" type="button" onClick={handleFillSample}>
                예시 데이터 넣기
              </button>
            </div>

            <p className="admin-help">
              몸으로 말해요는 주제와 제시어를, 10초 그림 그리기는 단계별 속담 목록만 입력합니다. 각 게임은 별도의 타이머를 가질 수 있어요.
            </p>

            <div className="connection-bar">
              <div className="status-pill">
                연결 상태 <strong>{storageMode === "supabase" ? "연결됨" : "연결안됨"}</strong>
              </div>
              <div className="status-pill">
                상세 상태 <strong>{connectionStatus}</strong>
              </div>
            </div>

            <section className="stage-panel admin-game-panel">
              <TabSet
                items={GAME_TYPES}
                activeKey={adminGameKey}
                onClick={setAdminGameKey}
                type="game"
              />
              <TabSet
                items={STAGES}
                activeKey={adminStageKey}
                onClick={setAdminStageKey}
                type="stage"
              />
            </section>

            <section className="timer-settings">
              <div className="timer-settings-copy">
                <p className="section-label">TIMER SETTING</p>
                <h3>{adminGame.label} 기본 타이머를 설정하세요</h3>
                <p className="admin-help">현재 선택한 게임 탭에만 적용되는 기본 시간입니다.</p>
              </div>

              <label className="timer-setting-field">
                <span>제한 시간(초)</span>
                <input
                  type="number"
                  min="5"
                  max="600"
                  step="5"
                  value={adminTimerDrafts[adminGameKey] ?? ""}
                  onChange={(event) => updateTimerSettingDraft(adminGameKey, event.target.value)}
                  onBlur={() => commitTimerSetting(adminGameKey)}
                />
              </label>
            </section>

            {adminGame.kind === "topics" ? (
              <>
                <section className="admin-stage-panel">
                  <button className="primary-button" type="button" onClick={addAdminTopic}>
                    + 주제 추가
                  </button>
                </section>

                <form className="admin-form">
                  {(adminTopics.length ? adminTopics : [createEmptyTopic()]).map((topic, index) => (
                    <TopicEditor
                      key={`topic-editor-${index}`}
                      index={index}
                      topic={topic}
                      onChange={updateAdminTopic}
                      onRemove={removeAdminTopic}
                    />
                  ))}
                </form>
              </>
            ) : (
              <section className="drawing-editor">
                <div className="topic-editor">
                  <div className="topic-editor-header">
                    <span className="topic-badge">속담</span>
                    <strong className="drawing-editor-title">단계별 속담 목록</strong>
                    <span className="prompt-count-badge">{drawingPromptCount}개</span>
                  </div>
                  <textarea
                    className="topic-prompts-input drawing-prompts-input"
                    rows={14}
                    placeholder="속담을 한 줄에 하나씩 입력해 주세요"
                    value={drawingPhrases.join("\n")}
                    onChange={(event) => updateDrawingPhrases(event.target.value)}
                  />
                </div>
              </section>
            )}

            <div className="admin-actions">
              <button className="primary-button" type="button" onClick={handleSave}>
                저장하기
              </button>
            </div>
          </section>
        )}
      </main>

      {initialMode === "play" ? (
        <button
          className="presentation-back-button"
          type="button"
          aria-label="이전 단계로 돌아가기"
          title="이전 단계로 돌아가기"
          onClick={goBackPresentationStep}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 18l-6-6 6-6"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <span>뒤로가기</span>
        </button>
      ) : null}

      {initialMode === "play" ? (
        <button
          className="presentation-exit-button"
          type="button"
          aria-label="발표 화면 종료"
          title="발표 화면 종료"
          onClick={exitPresentationMode}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M9 4H4v5M20 9V4h-5M15 20h5v-5M4 15v5h5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </button>
      ) : null}
    </>
  );
}
