const state = {
  settings: {
    playerCount: 2,
    difficulty: "low",
    mode: "mixed",
    totalRounds: 8,
    secondsPerRound: 30,
  },
  players: [],
  currentRound: 0,
  currentQuestion: null,
  timerId: null,
  timeLeft: 30,
  soundEnabled: true,
  audioContext: null,
};

const elements = {
  setupPanel: document.getElementById("setup-panel"),
  gamePanel: document.getElementById("game-panel"),
  teacherPanel: document.getElementById("teacher-panel"),
  teacherToggle: document.getElementById("teacher-toggle"),
  teacherClose: document.getElementById("teacher-close"),
  soundToggle: document.getElementById("sound-toggle"),
  gameSoundToggle: document.getElementById("game-sound-toggle"),
  homeButton: document.getElementById("home-button"),
  startButton: document.getElementById("start-button"),
  nextButton: document.getElementById("next-button"),
  restartButton: document.getElementById("restart-button"),
  playerGrid: document.getElementById("player-grid"),
  playerTemplate: document.getElementById("player-card-template"),
  roundLabel: document.getElementById("round-label"),
  timerValue: document.getElementById("timer-value"),
  questionBadge: document.getElementById("question-badge"),
  questionTitle: document.getElementById("question-title"),
  questionBody: document.getElementById("question-body"),
  questionHint: document.getElementById("question-hint"),
  questionCard: document.getElementById("question-card"),
  roundFeedback: document.getElementById("round-feedback"),
};

const settingsGroups = document.querySelectorAll("[data-setting]");

const difficultyConfig = {
  low: { label: "하", groups: [2], zeroChance: 0.05, compareGapDigits: 2, secondsPerRound: 30 },
  medium: { label: "중", groups: [2, 3], zeroChance: 0.2, compareGapDigits: 3, secondsPerRound: 45 },
  high: { label: "상", groups: [3, 4], zeroChance: 0.3, compareGapDigits: 4, secondsPerRound: 60 },
};

const koreanDigits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const smallUnits = ["", "십", "백", "천"];
const largeUnits = ["", "만", "억", "조"];

elements.startButton.addEventListener("click", startGame);
elements.nextButton.addEventListener("click", handleNextRound);
elements.restartButton.addEventListener("click", resetToSetup);
elements.homeButton.addEventListener("click", resetToSetup);
elements.teacherToggle.addEventListener("click", toggleTeacherPanel);
elements.teacherClose.addEventListener("click", closeTeacherPanel);
elements.soundToggle.addEventListener("click", toggleSound);
elements.gameSoundToggle.addEventListener("click", toggleSound);

settingsGroups.forEach((group) => {
  group.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) {
      return;
    }
    group.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    const key = group.dataset.setting;
    state.settings[key] = Number.isNaN(Number(button.dataset.value)) ? button.dataset.value : Number(button.dataset.value);
  });
});

function startGame() {
  state.settings.secondsPerRound = difficultyConfig[state.settings.difficulty].secondsPerRound;
  state.currentRound = 0;
  state.timeLeft = state.settings.secondsPerRound;
  state.players = Array.from({ length: state.settings.playerCount }, (_, index) => ({
    id: index + 1,
    name: `플레이어 ${index + 1}`,
    score: 0,
    answer: null,
    answeredAt: null,
    answerOrder: null,
    isCorrect: false,
  }));

  ensureAudioContext();
  playToneSequence([440, 554.37], 0.05);
  elements.setupPanel.classList.add("hidden");
  elements.gamePanel.classList.remove("hidden");
  elements.restartButton.classList.add("hidden");
  syncSoundButtons();
  nextRound();
}

function handleNextRound() {
  if (state.currentRound >= state.settings.totalRounds) {
    resetToSetup();
    return;
  }
  nextRound();
}

function nextRound() {
  clearInterval(state.timerId);
  state.settings.secondsPerRound = difficultyConfig[state.settings.difficulty].secondsPerRound;
  state.currentRound += 1;
  state.timeLeft = state.settings.secondsPerRound;
  state.currentQuestion = generateQuestion(state.settings.mode, state.settings.difficulty);

  state.players.forEach((player) => {
    player.answer = null;
    player.answeredAt = null;
    player.answerOrder = null;
    player.isCorrect = false;
  });

  renderRound();
  playToneSequence([659.25], 0.05);
  startTimer();
}

function renderRound() {
  const question = state.currentQuestion;
  elements.roundLabel.textContent = `${state.currentRound} / ${state.settings.totalRounds}`;
  elements.questionBadge.textContent = question.badge;
  elements.questionTitle.textContent = question.prompt;
  elements.questionHint.textContent = `${question.hint} 제한 시간 ${state.settings.secondsPerRound}초`;
  elements.roundFeedback.textContent = "각자 자기 칸에서 답을 눌러 보세요. 빠를수록 점수가 더 높고, 먼저 맞히면 가산점도 받아요.";
  elements.nextButton.classList.add("hidden");
  elements.restartButton.classList.add("hidden");
  renderTimer();
  renderQuestionBody(question);
  renderPlayers();
  animateQuestionCard();
}

function renderQuestionBody(question) {
  if (question.type === "read-number") {
    elements.questionBody.innerHTML = `<div class="question-number">${formatNumber(question.number)}</div>`;
    return;
  }

  if (question.type === "write-number") {
    elements.questionBody.innerHTML = `<div>${question.korean}</div>`;
    return;
  }

  elements.questionBody.innerHTML = `
    <div class="compare-layout">
      <div class="compare-box">
        <span class="compare-label">A</span>
        <div>${question.leftDisplay}</div>
      </div>
      <div class="compare-symbol">?</div>
      <div class="compare-box">
        <span class="compare-label">B</span>
        <div>${question.rightDisplay}</div>
      </div>
    </div>
  `;
}

function renderPlayers() {
  elements.playerGrid.innerHTML = "";

  const fastestCorrect = [...state.players]
    .filter((entry) => entry.isCorrect && entry.answerOrder !== null)
    .sort((a, b) => a.answerOrder - b.answerOrder)[0];

  state.players.forEach((player) => {
    const fragment = elements.playerTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".player-card");
    const bonusBadge = fragment.querySelector(".bonus-badge");
    const playerName = fragment.querySelector(".player-name");
    const scorePill = fragment.querySelector(".score-pill");
    const answerGrid = fragment.querySelector(".answer-grid");
    const status = fragment.querySelector(".player-status");

    playerName.textContent = player.name;
    scorePill.textContent = `${player.score}점`;

    if (player.answer !== null && player.answerOrder !== null) {
      status.textContent = `${player.answerOrder + 1}번째로 답했어요.`;
    } else {
      status.textContent = "아직 답을 고르지 않았어요.";
    }

    if (player.answer !== null) {
      card.classList.add("answered");
      if (state.currentQuestion.reveal) {
        card.classList.add(player.isCorrect ? "correct" : "incorrect");
      }
    }

    if (state.currentQuestion.reveal && fastestCorrect && fastestCorrect.id === player.id) {
      bonusBadge.classList.remove("hidden");
      bonusBadge.innerHTML = '<span class="bonus-icon">1</span><strong>선착순 보너스</strong>';
    }

    state.currentQuestion.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "answer-button";
      button.textContent = option.label;
      button.disabled = player.answer !== null || state.currentQuestion.reveal;
      button.addEventListener("click", () => submitAnswer(player.id, index));

      if (state.currentQuestion.reveal) {
        if (index === state.currentQuestion.correctIndex) {
          button.classList.add("correct-answer");
        } else if (index === player.answer && !player.isCorrect) {
          button.classList.add("wrong-answer");
        }
      }

      answerGrid.appendChild(button);
    });

    elements.playerGrid.appendChild(fragment);
  });
}

function submitAnswer(playerId, optionIndex) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player || player.answer !== null || state.currentQuestion.reveal) {
    return;
  }

  ensureAudioContext();
  player.answer = optionIndex;
  player.answeredAt = state.settings.secondsPerRound - state.timeLeft;
  player.answerOrder = state.players.filter((entry) => entry.answer !== null).length - 1;
  player.isCorrect = optionIndex === state.currentQuestion.correctIndex;

  if (player.isCorrect) {
    const speedScore = Math.max(10, state.settings.secondsPerRound + 7 - player.answeredAt);
    const orderBonus = Math.max(0, state.players.length - 1 - player.answerOrder) * 3;
    player.score += speedScore + orderBonus;
    playToneSequence([784, 988], 0.04);
  } else {
    playToneSequence([294, 220], 0.05, "sawtooth");
  }

  renderPlayers();

  if (state.players.every((entry) => entry.answer !== null)) {
    finishRound();
  }
}

function startTimer() {
  state.currentQuestion.reveal = false;
  state.timerId = setInterval(() => {
    state.timeLeft -= 1;
    renderTimer();

    if (state.timeLeft > 0 && state.timeLeft <= 3) {
      playToneSequence([523.25], 0.03);
    }

    if (state.timeLeft <= 0) {
      finishRound();
    }
  }, 1000);
}

function renderTimer() {
  const ratio = (Math.max(0, state.timeLeft) / state.settings.secondsPerRound) * 100;
  elements.timerValue.textContent = String(Math.max(0, state.timeLeft));
  document.documentElement.style.setProperty("--timer-progress", ratio);
}

function finishRound() {
  clearInterval(state.timerId);
  state.currentQuestion.reveal = true;
  renderPlayers();
  elements.roundFeedback.innerHTML = buildRoundFeedback();

  if (state.players.some((player) => player.isCorrect)) {
    playToneSequence([659.25, 784, 1046.5], 0.05);
  } else {
    playToneSequence([196, 174.61], 0.08, "triangle");
  }

  if (state.currentRound < state.settings.totalRounds) {
    elements.nextButton.classList.remove("hidden");
  } else {
    showFinalResults();
  }
}

function buildRoundFeedback() {
  const question = state.currentQuestion;
  const answer = question.options[question.correctIndex].label;
  const correctPlayers = state.players.filter((player) => player.isCorrect).length;
  const fastestCorrect = [...state.players]
    .filter((player) => player.isCorrect)
    .sort((a, b) => a.answerOrder - b.answerOrder)[0];
  const bonusLine = fastestCorrect
    ? `<div class="bonus-highlight"><div class="bonus-highlight-icon">1</div><div><strong>선착순 보너스</strong><span>${fastestCorrect.name}이 가장 먼저 정답을 맞혀 추가 점수를 받았어요.</span></div></div>`
    : "";

  return `
    ${bonusLine}
    <strong>정답:</strong> ${answer}<br>
    <strong>해설:</strong> ${question.explanation}<br>
    <strong>이번 라운드 정답 인원:</strong> ${correctPlayers}명 / ${state.players.length}명
  `;
}

function showFinalResults() {
  const ranking = [...state.players].sort((a, b) => b.score - a.score);
  const rows = ranking.map((player, index) => `
    <article>
      <strong>${index + 1}위 ${player.name}</strong>
      <span>${player.score}점</span>
    </article>
  `).join("");

  elements.roundFeedback.innerHTML = `
    <div class="results-board">
      <h3>최종 결과</h3>
      ${rows}
    </div>
  `;
  playToneSequence([523.25, 659.25, 783.99, 1046.5], 0.06);
  elements.nextButton.classList.add("hidden");
  elements.restartButton.classList.remove("hidden");
}

function resetToSetup() {
  clearInterval(state.timerId);
  elements.setupPanel.classList.remove("hidden");
  elements.gamePanel.classList.add("hidden");
}

function toggleTeacherPanel() {
  const willShow = elements.teacherPanel.classList.contains("hidden");
  elements.teacherPanel.classList.toggle("hidden", !willShow);
}

function closeTeacherPanel() {
  elements.teacherPanel.classList.add("hidden");
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  syncSoundButtons();
  if (state.soundEnabled) {
    ensureAudioContext();
    playToneSequence([523.25, 659.25], 0.04);
  }
}

function syncSoundButtons() {
  const label = state.soundEnabled ? "효과음 켜짐" : "효과음 꺼짐";
  elements.soundToggle.textContent = label;
  elements.gameSoundToggle.textContent = label;
  elements.soundToggle.setAttribute("aria-pressed", String(state.soundEnabled));
  elements.gameSoundToggle.setAttribute("aria-pressed", String(state.soundEnabled));
}

function ensureAudioContext() {
  if (!state.soundEnabled) {
    return null;
  }

  if (!state.audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }
    state.audioContext = new AudioCtor();
  }

  if (state.audioContext.state === "suspended") {
    state.audioContext.resume();
  }

  return state.audioContext;
}

function playToneSequence(frequencies, duration = 0.05, type = "sine") {
  if (!state.soundEnabled) {
    return;
  }
  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  const startAt = context.currentTime;
  frequencies.forEach((frequency, index) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, startAt + index * duration);
    gain.gain.exponentialRampToValueAtTime(0.08, startAt + index * duration + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + index * duration + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(startAt + index * duration);
    osc.stop(startAt + index * duration + duration);
  });
}

function animateQuestionCard() {
  elements.questionCard.classList.remove("animate-in");
  requestAnimationFrame(() => elements.questionCard.classList.add("animate-in"));
}

function generateQuestion(mode, difficulty) {
  const candidates = {
    mixed: ["read-number", "write-number", "compare-number", "compare-korean"],
    read: ["read-number"],
    write: ["write-number"],
    compare: ["compare-number", "compare-korean"],
  }[mode];

  const type = pickRandom(candidates);

  if (type === "read-number") {
    return createReadQuestion(difficulty);
  }
  if (type === "write-number") {
    return createWriteQuestion(difficulty);
  }
  if (type === "compare-number") {
    return createCompareQuestion(difficulty, false);
  }
  return createCompareQuestion(difficulty, true);
}

function createReadQuestion(difficulty) {
  const number = generateBigNumber(difficulty);
  const correct = numberToKorean(number);
  const distractors = new Set();

  while (distractors.size < 3) {
    const candidate = numberToKorean(createNearbyNumber(number, difficulty));
    if (candidate !== correct) {
      distractors.add(candidate);
    }
  }

  const options = shuffle([
    { label: correct, correct: true },
    ...Array.from(distractors, (label) => ({ label, correct: false })),
  ]);

  return {
    type: "read-number",
    badge: "숫자 읽기",
    prompt: "아래 숫자를 바르게 읽은 것을 고르세요.",
    hint: `${difficultyConfig[difficulty].label} 난이도 · 만, 억, 조 단위로 끊어 읽어 보세요.`,
    number,
    options,
    correctIndex: options.findIndex((option) => option.correct),
    explanation: `${formatNumber(number)}는 "${correct}"라고 읽어요.`,
    reveal: false,
  };
}

function createWriteQuestion(difficulty) {
  const number = generateBigNumber(difficulty);
  const korean = numberToKorean(number);
  const distractors = new Set();

  while (distractors.size < 3) {
    const candidate = formatNumber(createNearbyNumber(number, difficulty));
    if (candidate !== formatNumber(number)) {
      distractors.add(candidate);
    }
  }

  const options = shuffle([
    { label: formatNumber(number), correct: true },
    ...Array.from(distractors, (label) => ({ label, correct: false })),
  ]);

  return {
    type: "write-number",
    badge: "한글 수를 숫자로",
    prompt: "아래 한글 수를 숫자로 바르게 나타낸 것을 고르세요.",
    hint: `${difficultyConfig[difficulty].label} 난이도 · 큰 단위를 먼저 읽고 뒤의 수를 이어 보세요.`,
    korean,
    options,
    correctIndex: options.findIndex((option) => option.correct),
    explanation: `"${korean}"는 숫자로 ${formatNumber(number)}입니다.`,
    reveal: false,
  };
}

function createCompareQuestion(difficulty, useKorean) {
  const pair = generateComparePair(difficulty);
  const leftDisplay = useKorean ? numberToKorean(pair.left) : formatNumber(pair.left);
  const rightDisplay = useKorean ? numberToKorean(pair.right) : formatNumber(pair.right);
  const relation = pair.left === pair.right ? "=" : pair.left > pair.right ? ">" : "<";

  const options = [
    { label: "A가 더 크다", value: ">" },
    { label: "B가 더 크다", value: "<" },
    { label: "두 수가 같다", value: "=" },
  ];

  return {
    type: useKorean ? "compare-korean" : "compare-number",
    badge: useKorean ? "한글 수 비교" : "숫자 비교",
    prompt: useKorean ? "두 한글 수를 비교해 알맞은 답을 고르세요." : "두 숫자를 비교해 알맞은 답을 고르세요.",
    hint: `${difficultyConfig[difficulty].label} 난이도 · 어떤 문제는 비슷한 수, 어떤 문제는 자리 수 자체가 다른 수가 나와요.`,
    leftDisplay,
    rightDisplay,
    options,
    correctIndex: options.findIndex((option) => option.value === relation),
    explanation: buildCompareExplanation(pair.left, pair.right),
    reveal: false,
  };
}

function generateBigNumber(difficulty, forcedGroupCount = null) {
  const config = difficultyConfig[difficulty];
  const groupCount = forcedGroupCount ?? pickRandom(config.groups);
  const groups = [];

  for (let index = 0; index < groupCount; index += 1) {
    if (index === 0) {
      groups.push(randomInt(1, 9999));
    } else {
      const shouldZero = Math.random() < config.zeroChance;
      groups.push(shouldZero ? 0 : randomInt(1, 9999));
    }
  }

  if (groups.slice(1).every((group) => group === 0)) {
    groups[groupCount - 1] = randomInt(1, 9999);
  }

  return groupsToNumber(groups);
}

function generateComparePair(difficulty) {
  const config = difficultyConfig[difficulty];
  const compareStyle = Math.random();

  if (compareStyle < 0.3) {
    const leftGroupCount = pickRandom(config.groups);
    let rightGroupCount = pickRandom(config.groups);
    if (config.groups.length > 1) {
      while (rightGroupCount === leftGroupCount) {
        rightGroupCount = pickRandom(config.groups);
      }
    } else if (Math.random() < 0.5) {
      rightGroupCount = Math.max(1, leftGroupCount - 1);
    }

    const left = generateBigNumber(difficulty, leftGroupCount);
    const right = generateBigNumber(difficulty, rightGroupCount);
    return { left, right };
  }

  if (compareStyle < 0.65) {
    const base = generateBigNumber(difficulty);
    const gapDigits = config.compareGapDigits;
    const magnitude = 10 ** randomInt(0, gapDigits);
    const delta = randomInt(1, 9) * magnitude;
    const direction = pickRandom([-1, 1]);
    let right = Math.max(1, base + delta * direction);
    if (right === base) {
      right += 1;
    }
    return { left: base, right };
  }

  const left = generateBigNumber(difficulty);
  let right = generateBigNumber(difficulty);

  if (Math.random() < 0.15) {
    right = left;
  } else if (right === left) {
    right = createNearbyNumber(left, difficulty);
  }

  return { left, right };
}

function createNearbyNumber(number, difficulty) {
  const groupCount = Math.max(2, String(number).length <= 8 ? 2 : String(number).length <= 12 ? 3 : 4);
  const groups = numberToGroups(number, groupCount);
  const changedIndex = randomInt(0, groups.length - 1);
  const nextGroups = [...groups];
  const change = pickRandom([-1, 1]) * randomInt(1, 8);

  if (changedIndex === 0) {
    nextGroups[changedIndex] = clamp(nextGroups[changedIndex] + change, 1, 9999);
  } else {
    nextGroups[changedIndex] = clamp(nextGroups[changedIndex] + change * (10 ** randomInt(0, 2)), 0, 9999);
  }

  let candidate = groupsToNumber(nextGroups);
  if (candidate === number) {
    candidate += 1;
  }
  if (candidate < 1) {
    candidate = generateBigNumber(difficulty);
  }
  return candidate;
}

function numberToGroups(number, minimumGroups = 1) {
  const groups = [];
  let current = number;
  while (current > 0) {
    groups.unshift(current % 10000);
    current = Math.floor(current / 10000);
  }
  while (groups.length < minimumGroups) {
    groups.unshift(0);
  }
  return groups;
}

function groupsToNumber(groups) {
  return groups.reduce((total, group) => total * 10000 + group, 0);
}

function buildCompareExplanation(left, right) {
  if (left === right) {
    return `${formatNumber(left)}와 ${formatNumber(right)}는 같은 수예요.`;
  }
  const biggerLabel = left > right ? "A" : "B";
  const biggerValue = left > right ? left : right;
  const smallerValue = left > right ? right : left;
  return `${biggerLabel}의 수 ${formatNumber(biggerValue)}가 ${formatNumber(smallerValue)}보다 커요. 큰 자리부터 비교하면 차이를 확인할 수 있어요.`;
}

function numberToKorean(number) {
  if (number === 0) {
    return "영";
  }

  const groups = numberToGroups(number);
  return groups
    .map((group, index) => {
      if (group === 0) {
        return "";
      }
      const unitIndex = groups.length - index - 1;
      return `${fourDigitToKorean(group)}${largeUnits[unitIndex]}`;
    })
    .filter(Boolean)
    .join(" ");
}

function fourDigitToKorean(number) {
  const digits = String(number).padStart(4, "0").split("").map(Number);
  return digits
    .map((digit, index) => {
      if (digit === 0) {
        return "";
      }
      const unitIndex = digits.length - index - 1;
      const digitText = digit === 1 && unitIndex > 0 ? "" : koreanDigits[digit];
      return `${digitText}${smallUnits[unitIndex]}`;
    })
    .join("");
}

function formatNumber(number) {
  return new Intl.NumberFormat("ko-KR").format(number);
}

function shuffle(array) {
  const copy = [...array];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}


