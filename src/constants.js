export const STORAGE_KEY = "workshop-games-data-v3";
export const SETTINGS_KEY = "workshop-games-settings-v3";

export const GAME_TYPES = [
  { key: "charades", label: "몸으로 말해요", kind: "topics" },
  { key: "drawing", label: "10초 그림 그리기", kind: "phrases" },
];

export const STAGES = [
  { key: "preliminary", label: "예선전" },
  { key: "semifinal", label: "준결승전" },
  { key: "final", label: "결승전" },
];

export const START_MESSAGE = "다음으로 넘길 시 시작!";
export const FINISHED_MESSAGE = "이 안의 제시어를 모두 봤어요";
export const DRAWING_TOPIC_NAME = "속담";

export const sampleData = {
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
