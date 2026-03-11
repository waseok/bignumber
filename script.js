const state = {
  settings: {
    playerCount: 4,
    difficulty: "medium",
    mode: "mixed",
    totalRounds: 8,
    secondsPerRound: 15,
  },
  players: [],
  currentRound: 0,
  currentQuestion: null,
  timerId: null,
  timeLeft: 15,
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
  startButton: document.getElementById("start-button"),
  nextButton: document.getElementById("next-button"),
  restartButton: document.getElementById("restart-button"),
  playerGrid: document.getElementById("player-grid"),
  playerTemplate: document.getElementById("player-card-template"),
  roundLabel: document.getElementById("round-label"),
  timerValue: document.getElementById("timer-value"),
  questionTypeLabel: document.getElementById("question-type-label"),
  questionBadge: document.getElementById("question-badge"),
  questionTitle: document.getElementById("question-title"),
  questionBody: document.getElementById("question-body"),
  questionHint: document.getElementById("question-hint"),
  questionCard: document.getElementById("question-card"),
  roundFeedback: document.getElementById("round-feedback"),
  playerCount: document.getElementById("player-count"),
  difficulty: document.getElementById("difficulty"),
  mode: document.getElementById("mode"),
  roundCount: document.getElementById("round-count"),
};

const difficultyConfig = {
  low: {
    label: "하",
    readMin: 10000,
    readMax: 99999999,
    compareMin: 10000,
    compareMax: 99999999,
    closeGap: 9000,
  },
  medium: {
    label: "중",
    readMin: 100000,
    readMax: 999999999,
    compareMin: 100000,
    compareMax: 9999999999,
    closeGap: 900000,
  },
  high: {
    label: "상",
    readMin: 10000000,
    readMax: 9999999999999,
    compareMin: 10000000,
    compareMax: 9999999999999,
    closeGap: 900000000,
  },
};

const koreanDigits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const smallUnits = ["", "십", "백", "천"];
const largeUnits = ["", "만", "억", "조"];

elements.startButton.addEventListener("click", startGame);
elements.nextButton.addEventListener("click", handleNextRound);
elements.restartButton.addEventListener("click", resetToSetup);
elements.teacherToggle.addEventListener("click", toggleTeacherPanel);
elements.teacherClose.addEventListener("click", closeTeacherPanel);
elements.soundToggle.addEventListener("click", toggleSound);

function startGame() {
  state.settings.playerCount = Number(elements.playerCount.value);
  state.settings.difficulty = elements.difficulty.value;
  state.settings.mode = elements.mode.value;
  state.settings.totalRounds = Number(elements.roundCount.value);
  state.settings.secondsPerRound = 15;
  state.currentRound = 0;
  state.players = Array.from({ length: state.settings.playerCount }, (_, index) => ({
    id: index + 1,
    name: `플레이어 ${index + 1}`,
    score: 0,
    answer: null,
    answeredAt: null,
    isCorrect: false,
  }));

  ensureAudioContext();
  playToneSequence([440, 554.37], 0.05);
  elements.setupPanel.classList.add("hidden");
  elements.gamePanel.classList.remove("hidden");
  elements.restartButton.classList.add("hidden");
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
  state.currentRound += 1;
  state.timeLeft = state.settings.secondsPerRound;
  state.currentQuestion = generateQuestion(state.settings.mode, state.settings.difficulty);

  for (const player of state.players) {
    player.answer = null;
    player.answeredAt = null;
    player.isCorrect = false;
  }

  renderRound();
  playToneSequence([659.25], 0.05);
  startTimer();
}

function renderRound() {
  const { currentQuestion } = state;
  elements.roundLabel.textContent = `${state.currentRound} / ${state.settings.totalRounds}`;
  elements.questionTypeLabel.textContent = currentQuestion.type === "read" ? "읽기" : "비교";
  elements.questionBadge.textContent = currentQuestion.type === "read" ? "읽기 문제" : "비교 문제";
  elements.questionTitle.textContent = currentQuestion.prompt;
  elements.questionHint.textContent = currentQuestion.hint;
  elements.roundFeedback.textContent = "모두 함께 가장 빠르고 정확하게 답해 보세요.";
  elements.nextButton.classList.add("hidden");
  elements.restartButton.classList.add("hidden");
  renderTimer();
  renderQuestionBody();
  renderPlayers();
  animateQuestionCard();
}

function renderQuestionBody() {
  const question = state.currentQuestion;
  if (question.type === "read") {
    elements.questionBody.textContent = formatNumber(question.number);
    return;
  }

  elements.questionBody.innerHTML = `
    <div class="compare-layout">
      <span>A. ${formatNumber(question.left)}</span>
      <strong>?</strong>
      <span>B. ${formatNumber(question.right)}</span>
    </div>
  `;
}

function renderPlayers() {
  elements.playerGrid.innerHTML = "";
  for (const player of state.players) {
    const fragment = elements.playerTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".player-card");
    const playerName = fragment.querySelector(".player-name");
    const scorePill = fragment.querySelector(".score-pill");
    const answerGrid = fragment.querySelector(".answer-grid");
    const status = fragment.querySelector(".player-status");

    playerName.textContent = player.name;
    scorePill.textContent = `${player.score}점`;
    status.textContent = player.answer !== null ? "답을 골랐어요." : "아직 답을 고르지 않았어요.";

    if (player.answer !== null) {
      card.classList.add("answered");
      if (state.currentQuestion.reveal) {
        card.classList.add(player.isCorrect ? "correct" : "incorrect");
      }
    }

    state.currentQuestion.options.forEach((option, optionIndex) => {
      const button = document.createElement("button");
      button.className = "answer-button";
      button.type = "button";
      button.textContent = option.label;
      button.disabled = player.answer !== null || state.currentQuestion.reveal;
      button.addEventListener("click", () => submitAnswer(player.id, optionIndex));

      if (state.currentQuestion.reveal) {
        if (optionIndex === state.currentQuestion.correctIndex) {
          button.classList.add("correct-answer");
        } else if (optionIndex === player.answer && !player.isCorrect) {
          button.classList.add("wrong-answer");
        }
      }

      answerGrid.appendChild(button);
    });

    elements.playerGrid.appendChild(fragment);
  }
}

function submitAnswer(playerId, optionIndex) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player || player.answer !== null || state.currentQuestion.reveal) {
    return;
  }

  ensureAudioContext();
  player.answer = optionIndex;
  player.answeredAt = state.settings.secondsPerRound - state.timeLeft;
  player.isCorrect = optionIndex === state.currentQuestion.correctIndex;

  if (player.isCorrect) {
    player.score += Math.max(10, 22 - player.answeredAt);
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
      playToneSequence([523.25], 0.025);
    }

    if (state.timeLeft <= 0) {
      finishRound();
    }
  }, 1000);
}

function renderTimer() {
  const ratio = (state.timeLeft / state.settings.secondsPerRound) * 100;
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
    elements.nextButton.textContent = "다음 문제";
    elements.nextButton.classList.remove("hidden");
  } else {
    showFinalResults();
  }
}

function buildRoundFeedback() {
  const question = state.currentQuestion;
  const answerLabel = question.options[question.correctIndex].label;
  const correctPlayers = state.players.filter((player) => player.isCorrect).length;

  return `
    <strong>정답:</strong> ${answerLabel}<br>
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
  const isHidden = elements.teacherPanel.classList.contains("hidden");
  elements.teacherPanel.classList.toggle("hidden", !isHidden);
  elements.teacherToggle.textContent = isHidden ? "교사용 설명 숨기기" : "교사용 설명 보기";
}

function closeTeacherPanel() {
  elements.teacherPanel.classList.add("hidden");
  elements.teacherToggle.textContent = "교사용 설명 보기";
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  elements.soundToggle.textContent = state.soundEnabled ? "효과음 켜짐" : "효과음 꺼짐";
  elements.soundToggle.setAttribute("aria-pressed", String(state.soundEnabled));
  if (state.soundEnabled) {
    ensureAudioContext();
    playToneSequence([523.25, 659.25], 0.04);
  }
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
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gainNode.gain.setValueAtTime(0.0001, startAt + index * duration);
    gainNode.gain.exponentialRampToValueAtTime(0.08, startAt + index * duration + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + index * duration + duration);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startAt + index * duration);
    oscillator.stop(startAt + index * duration + duration);
  });
}

function animateQuestionCard() {
  elements.questionCard.classList.remove("animate-in");
  requestAnimationFrame(() => {
    elements.questionCard.classList.add("animate-in");
  });
}

function generateQuestion(mode, difficulty) {
  const selectedMode = mode === "mixed" ? (Math.random() > 0.5 ? "read" : "compare") : mode;
  return selectedMode === "read" ? createReadQuestion(difficulty) : createCompareQuestion(difficulty);
}

function createReadQuestion(difficulty) {
  const config = difficultyConfig[difficulty];
  const number = createFriendlyNumber(config.readMin, config.readMax, difficulty);
  const correctText = numberToKorean(number);
  const wrongOptions = new Set();

  while (wrongOptions.size < 3) {
    const variant = mutateReading(correctText);
    if (variant !== correctText) {
      wrongOptions.add(variant);
    }
  }

  const options = shuffle([
    { label: correctText, correct: true },
    ...Array.from(wrongOptions, (label) => ({ label, correct: false })),
  ]);

  return {
    type: "read",
    prompt: "아래 수를 바르게 읽은 것을 고르세요.",
    hint: `${difficultyConfig[difficulty].label} 난이도 · 큰 수를 읽을 때는 만, 억, 조 단위로 끊어 보세요.`,
    number,
    options,
    correctIndex: options.findIndex((option) => option.correct),
    explanation: `${formatNumber(number)}는 \"${correctText}\"라고 읽어요.`,
    reveal: false,
  };
}

function createCompareQuestion(difficulty) {
  const config = difficultyConfig[difficulty];
  let left = createFriendlyNumber(config.compareMin, config.compareMax, difficulty);
  let right = createFriendlyNumber(config.compareMin, config.compareMax, difficulty);

  if (Math.random() < 0.2) {
    right = left;
  } else if (Math.abs(left - right) > config.closeGap && Math.random() > 0.4) {
    right = left + randomInt(-config.closeGap, config.closeGap);
  }

  if (right < config.compareMin) {
    right = config.compareMin + randomInt(1, config.closeGap);
  }
  if (right > config.compareMax) {
    right = config.compareMax - randomInt(1, config.closeGap);
  }

  const relation = left === right ? "=" : left > right ? ">" : "<";
  const options = [
    { label: "A가 더 크다", value: ">" },
    { label: "B가 더 크다", value: "<" },
    { label: "두 수가 같다", value: "=" },
  ];
  const correctIndex = options.findIndex((option) => option.value === relation);

  return {
    type: "compare",
    prompt: "두 수를 비교해 알맞은 답을 고르세요.",
    hint: `${difficultyConfig[difficulty].label} 난이도 · 가장 큰 자리부터 차례대로 비교해 보세요.`,
    left,
    right,
    options,
    correctIndex,
    explanation: buildCompareExplanation(left, right),
    reveal: false,
  };
}

function buildCompareExplanation(left, right) {
  if (left === right) {
    return `${formatNumber(left)}와 ${formatNumber(right)}는 같은 수예요.`;
  }

  const biggerLabel = left > right ? "A" : "B";
  const biggerValue = left > right ? left : right;
  const smallerValue = left > right ? right : left;
  return `${biggerLabel}의 수 ${formatNumber(biggerValue)}가 ${formatNumber(smallerValue)}보다 크므로 ${biggerLabel}가 더 커요.`;
}

function createFriendlyNumber(min, max, difficulty) {
  let groups;

  if (difficulty === "low") {
    groups = [randomInt(1, 9999), randomInt(1, 9999)];
  } else if (difficulty === "medium") {
    groups = [randomInt(1, 9999), maybeZeroGroup(0.25), randomInt(1, 9999)];
  } else {
    groups = [randomInt(1, 9999), maybeZeroGroup(0.35), maybeZeroGroup(0.3), randomInt(1, 9999)];
  }

  let value = 0;
  groups.forEach((group, index) => {
    value += group * (10000 ** (groups.length - index - 1));
  });

  return clamp(value, min, max);
}

function maybeZeroGroup(probability) {
  return Math.random() < probability ? 0 : randomInt(1, 9999);
}

function mutateReading(text) {
  const replacements = [
    ["조", "억"],
    ["억", "만"],
    ["만", "억"],
    ["천", "백"],
    ["백", "십"],
    ["십", ""],
  ];

  for (const [from, to] of shuffle([...replacements])) {
    if (text.includes(from)) {
      return text.replace(from, to || " ").replace(/\s+/g, " ").trim();
    }
  }

  return `${text} 일`;
}

function numberToKorean(number) {
  if (number === 0) {
    return "영";
  }

  const groups = [];
  let current = number;
  while (current > 0) {
    groups.unshift(current % 10000);
    current = Math.floor(current / 10000);
  }

  const result = groups
    .map((group, index) => {
      if (group === 0) {
        return "";
      }
      const chunk = fourDigitToKorean(group);
      const unit = largeUnits[groups.length - index - 1];
      return `${chunk}${unit}`;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return result || "영";
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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
