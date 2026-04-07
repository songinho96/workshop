import { createClient } from "@supabase/supabase-js";
import { GAME_TYPES, STAGES } from "./constants.js";
import {
  createDefaultSettings,
  createEmptyGameData,
  getDrawingTopicName,
  normalizeGameData,
  normalizeSettings,
} from "./game-utils.js";

export function createSupabaseBrowserClient() {
  const config = window.SUPABASE_CONFIG || null;

  if (
    !config ||
    !config.url ||
    !config.anonKey ||
    config.url.includes("YOUR_PROJECT_REF") ||
    config.anonKey.includes("YOUR_SUPABASE_ANON_KEY")
  ) {
    return null;
  }

  return createClient(config.url, config.anonKey);
}

export async function fetchDataFromSupabase(supabase) {
  const { data, error } = await supabase
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

export async function fetchSettingsFromSupabase(supabase) {
  const { data, error } = await supabase
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

export async function saveDataToSupabase(supabase, data) {
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
      name: getDrawingTopicName(),
      prompts: { game: "drawing", stage: stage.key, items: data.drawing[stage.key] },
      updated_at: new Date().toISOString(),
    });
    id += 1;
  });

  await clearDataInSupabase(supabase);

  const { error } = await supabase.from("charades_topics").upsert(payload, { onConflict: "id" });

  if (error) {
    throw error;
  }
}

export async function saveSettingsToSupabase(supabase, settings) {
  const { error } = await supabase
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

export async function clearDataInSupabase(supabase) {
  const { error } = await supabase.from("charades_topics").delete().gte("id", 1);

  if (error) {
    throw error;
  }
}

export async function resetSettingsInSupabase(supabase) {
  const { error } = await supabase
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
