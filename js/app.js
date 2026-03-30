const minutesInput = document.getElementById('minutes');
const secondsInput = document.getElementById('seconds');
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

const CIRCUMFERENCE = 2 * Math.PI * 140;
progressRing.style.strokeDasharray = String(CIRCUMFERENCE);
progressRing.style.strokeDashoffset = String(CIRCUMFERENCE);

let totalSeconds = getInputSeconds();
let remainingSeconds = totalSeconds;
let timerId = null;
let endTime = null;
let audioCtx = null;

function sanitizeInputs() {
  const mins = Math.max(0, Math.min(999, parseInt(minutesInput.value || '0', 10) || 0));
  const secs = Math.max(0, Math.min(59, parseInt(secondsInput.value || '0', 10) || 0));

  minutesInput.value = mins;
  secondsInput.value = secs;
}

function getInputSeconds() {
  sanitizeInputs();

  const mins = parseInt(minutesInput.value || '0', 10) || 0;
  const secs = parseInt(secondsInput.value || '0', 10) || 0;

  return mins * 60 + secs;
}

function formatTime(total) {
  const mins = Math.floor(total / 60);
  const secs = total % 60;

  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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

function syncIdleState() {
  totalSeconds = getInputSeconds();
  remainingSeconds = totalSeconds;

  updateDisplay();

  statusText.textContent = 'Ready';
  hintText.textContent = totalSeconds > 0 ? '設定好時間後按下開始' : '請先輸入倒數時間';

  readout.classList.remove('done', 'flash');
  panel.classList.remove('flash');

  startBtn.disabled = totalSeconds <= 0;
  pauseBtn.disabled = true;
}

function setInputsDisabled(disabled) {
  minutesInput.disabled = disabled;
  secondsInput.disabled = disabled;

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

  statusText.textContent = 'Running';
  hintText.textContent = '倒數中';
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
  hintText.textContent = '已暫停，可繼續倒數';
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  setInputsDisabled(false);

  minutesInput.value = Math.floor(remainingSeconds / 60);
  secondsInput.value = remainingSeconds % 60;
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
  hintText.textContent = '時間到了';
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

presetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    minutesInput.value = btn.dataset.minutes;
    secondsInput.value = 0;
    syncIdleState();
  });
});

[minutesInput, secondsInput].forEach((el) => {
  el.addEventListener('input', syncIdleState);
  el.addEventListener('change', syncIdleState);
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

syncIdleState();