const minutesPicker = document.getElementById('minutesPicker');
const secondsPicker = document.getElementById('secondsPicker');

const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');

const progressRing = document.getElementById('progressRing');
const timeDisplay = document.getElementById('timeDisplay');
const statusText = document.getElementById('statusText');
const hintText = document.getElementById('hintText');
const readout = document.getElementById('readout');
const panel = document.getElementById('panel');
const presetButtons = [...document.querySelectorAll('.chip')];
const themeToggle = document.getElementById('themeToggle');

const CIRCUMFERENCE = 2 * Math.PI * 140;
progressRing.style.strokeDasharray = String(CIRCUMFERENCE);
progressRing.style.strokeDashoffset = String(CIRCUMFERENCE);

let currentTheme = localStorage.getItem('neo-theme') || 'dark';

let minutesValue = 5;
let secondsValue = 0;

let totalSeconds = getInputSeconds();
let remainingSeconds = totalSeconds;
let timerId = null;
let endTime = null;
let audioCtx = null;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getInputSeconds() {
  return minutesValue * 60 + secondsValue;
}

function secondsToParts(total) {
  const safe = Math.max(0, total);
  return {
    minutes: Math.floor(safe / 60),
    seconds: safe % 60,
  };
}

function formatTime(total) {
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${pad2(mins)}:${pad2(secs)}`;
}

function applyTheme(theme) {
  currentTheme = theme;
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('neo-theme', theme);
}

function renderPicker(container, value, min, max) {
  const windowEl = document.createElement('div');
  windowEl.className = 'picker-window';

  for (let offset = -2; offset <= 2; offset++) {
    const displayValue = Math.max(min, Math.min(max, value + offset));
    const item = document.createElement('div');
    item.className = 'picker-item';
    item.textContent = pad2(displayValue);

    if (offset === 0) {
      item.classList.add('active');
    } else if (Math.abs(offset) === 1) {
      item.classList.add('near');
    }

    windowEl.appendChild(item);
  }

  container.innerHTML = '';
  container.appendChild(windowEl);

  const centerLine = document.createElement('div');
  centerLine.className = 'picker-center-line';
  container.appendChild(centerLine);
}

function syncPickers() {
  renderPicker(minutesPicker, minutesValue, 0, 999);
  renderPicker(secondsPicker, secondsValue, 0, 59);

  minutesPicker.setAttribute('aria-valuenow', String(minutesValue));
  secondsPicker.setAttribute('aria-valuenow', String(secondsValue));
}

function updateRing() {
  if (totalSeconds <= 0) {
    progressRing.style.strokeDashoffset = String(CIRCUMFERENCE);
    return;
  }

  const progress = remainingSeconds / totalSeconds;
  const offset = CIRCUMFERENCE * (1 - progress);
  progressRing.style.strokeDashoffset = String(offset);
}

function updateDisplay() {
  timeDisplay.textContent = formatTime(remainingSeconds);
  updateRing();
}

function setPickerValuesFromSeconds(total) {
  const parts = secondsToParts(total);
  minutesValue = Math.min(999, parts.minutes);
  secondsValue = parts.seconds;
  syncPickers();
}

function syncIdleState() {
  totalSeconds = getInputSeconds();
  remainingSeconds = totalSeconds;

  updateDisplay();

  statusText.textContent = '';
  hintText.textContent = '';

  readout.classList.remove('done', 'flash');
  panel.classList.remove('flash');

  startBtn.disabled = totalSeconds <= 0;
  pauseBtn.disabled = true;
}

function setInputsDisabled(disabled) {
  minutesPicker.style.pointerEvents = disabled ? 'none' : 'auto';
  secondsPicker.style.pointerEvents = disabled ? 'none' : 'auto';

  if (disabled) {
    minutesPicker.setAttribute('tabindex', '-1');
    secondsPicker.setAttribute('tabindex', '-1');
  } else {
    minutesPicker.setAttribute('tabindex', '0');
    secondsPicker.setAttribute('tabindex', '0');
  }

  presetButtons.forEach((btn) => {
    btn.disabled = disabled;
  });
}

function startTimer() {
  if (timerId) return;

  if (remainingSeconds <= 0) {
    totalSeconds = getInputSeconds();
    remainingSeconds = totalSeconds;
  }

  if (remainingSeconds <= 0) return;

  statusText.textContent = '';
  hintText.textContent = '';
  startBtn.disabled = true;
  pauseBtn.disabled = false;
  setInputsDisabled(true);

  readout.classList.remove('done', 'flash');
  panel.classList.remove('flash');

  endTime = Date.now() + remainingSeconds * 1000;

  timerId = setInterval(() => {
    remainingSeconds = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    updateDisplay();

    if (remainingSeconds <= 0) {
      finishTimer();
    }
  }, 200);
}

function pauseTimer() {
  if (!timerId) return;

  clearInterval(timerId);
  timerId = null;

  statusText.textContent = 'Paused';
  hintText.textContent = '';
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  setInputsDisabled(false);
}

function resetTimer() {
  clearInterval(timerId);
  timerId = null;
  setInputsDisabled(false);
  syncIdleState();
}

function finishTimer() {
  clearInterval(timerId);
  timerId = null;
  remainingSeconds = 0;

  updateDisplay();

  statusText.textContent = 'Time Up';
  hintText.textContent = '';
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  setInputsDisabled(false);

  readout.classList.add('done', 'flash');
  panel.classList.add('flash');

  playAlarm();
}

function playAlarm() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;

    for (let i = 0; i < 4; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, now + i * 0.28);

      gain.gain.setValueAtTime(0.0001, now + i * 0.28);
      gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.28 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.28 + 0.22);

      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + i * 0.28);
      osc.stop(now + i * 0.28 + 0.24);
    }
  } catch (err) {
    console.warn('無法播放提醒音', err);
  }
}

function playWheelTick() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.028, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  } catch (err) {
    console.warn('無法播放滾輪音效', err);
  }
}

function adjustPicker(type, delta) {
  if (type === 'minutes') {
    const next = Math.max(0, Math.min(999, minutesValue + delta));
    if (next === minutesValue) return;
    minutesValue = next;
  }

  if (type === 'seconds') {
    const next = Math.max(0, Math.min(59, secondsValue + delta));
    if (next === secondsValue) return;
    secondsValue = next;
  }

  playWheelTick();
  syncPickers();
  syncIdleState();
}

function handlePickerWheel(type, event) {
  event.preventDefault();
  if (timerId) return;

  const delta = event.deltaY < 0 ? 1 : -1;
  adjustPicker(type, delta);
}

function handlePickerKeydown(type, event) {
  if (timerId) return;

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    adjustPicker(type, 1);
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    adjustPicker(type, -1);
  }
}

minutesPicker.addEventListener(
  'wheel',
  (event) => handlePickerWheel('minutes', event),
  { passive: false }
);

secondsPicker.addEventListener(
  'wheel',
  (event) => handlePickerWheel('seconds', event),
  { passive: false }
);

minutesPicker.addEventListener('keydown', (event) => handlePickerKeydown('minutes', event));
secondsPicker.addEventListener('keydown', (event) => handlePickerKeydown('seconds', event));

presetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    minutesValue = parseInt(btn.dataset.minutes, 10) || 0;
    secondsValue = 0;
    syncPickers();
    syncIdleState();
  });
});

themeToggle.addEventListener('click', () => {
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
});

startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
resetBtn.addEventListener('click', resetTimer);

document.addEventListener('visibilitychange', () => {
  if (document.hidden || !timerId) return;

  remainingSeconds = Math.max(0, Math.round((endTime - Date.now()) / 1000));
  updateDisplay();

  if (remainingSeconds <= 0) {
    finishTimer();
  }
});

applyTheme(currentTheme);
syncPickers();
setPickerValuesFromSeconds(remainingSeconds);
syncIdleState();