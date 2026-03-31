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

let minutesValue = 10;
let secondsValue = 0;

let totalSeconds = getInputSeconds();
let remainingSeconds = totalSeconds;
let timerId = null;
let endTime = null;
let audioCtx = null;

const PICKER_ITEM_HEIGHT = 36;
const SECONDS_REPEAT = 7;
const secondsMiddleCycle = Math.floor(SECONDS_REPEAT / 2);
const SCROLL_END_DELAY = 90;

const pickerState = {
  minutes: null,
  seconds: null,
};

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
  const safe = Math.max(0, total);
  return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
}

function applyTheme(theme) {
  currentTheme = theme;
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('neo-theme', theme);
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
    osc.frequency.setValueAtTime(560, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.016, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  } catch (err) {
    console.warn('無法播放滾輪音效', err);
  }
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

  statusText.textContent = '';
  hintText.textContent = '';

  readout.classList.remove('done', 'flash');
  panel.classList.remove('flash');

  startBtn.disabled = totalSeconds <= 0;
  pauseBtn.disabled = true;
}

function setInputsDisabled(disabled) {
  [minutesPicker, secondsPicker].forEach((picker) => {
    picker.classList.toggle('is-disabled', disabled);
    picker.setAttribute('tabindex', disabled ? '-1' : '0');
  });

  presetButtons.forEach((btn) => {
    btn.disabled = disabled;
  });
}

function clampMinutes(value) {
  return Math.max(0, Math.min(999, value));
}

function wrapSeconds(value) {
  return ((value % 60) + 60) % 60;
}

function createPicker(container, type, min, max, loop = false) {
  const scroller = document.createElement('div');
  scroller.className = 'picker-scroller';

  const items = [];
  const values = [];
  const range = max - min + 1;

  if (loop) {
    for (let cycle = 0; cycle < SECONDS_REPEAT; cycle++) {
      for (let value = min; value <= max; value++) {
        values.push(value);
      }
    }
  } else {
    for (let value = min; value <= max; value++) {
      values.push(value);
    }
  }

  values.forEach((value, index) => {
    const item = document.createElement('div');
    item.className = 'picker-item';
    item.textContent = pad2(value);
    item.dataset.index = String(index);
    item.dataset.value = String(value);
    scroller.appendChild(item);
    items.push(item);
  });

  const focusBand = document.createElement('div');
  focusBand.className = 'picker-focus-band';

  container.innerHTML = '';
  container.appendChild(scroller);
  container.appendChild(focusBand);

  const state = {
    container,
    scroller,
    items,
    min,
    max,
    range,
    loop,
    type,
    currentValue: loop ? secondsValue : minutesValue,
    scrollEndTimer: null,
    rafVisual: null,
    isDragging: false,
    dragStartY: 0,
    dragStartScrollTop: 0,
  };

  scroller.addEventListener(
    'wheel',
    (event) => {
      if (timerId) return;
      event.preventDefault();

      const boost = event.shiftKey ? 2.4 : 1.15;
      scroller.scrollTop += event.deltaY * boost;
      playWheelTick();
      scheduleScrollEnd(state);
    },
    { passive: false }
  );

  scroller.addEventListener('scroll', () => {
    if (timerId) return;

    syncValueFromScroll(state);
    recenterLoopIfNeeded(state);
    requestPickerVisualUpdate(state);
    scheduleScrollEnd(state);
  });

  container.addEventListener('keydown', (event) => {
    if (timerId) return;

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      adjustPicker(type, 1);
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      adjustPicker(type, -1);
    }

    if (event.key === 'PageUp') {
      event.preventDefault();
      adjustPicker(type, type === 'minutes' ? 5 : 10);
    }

    if (event.key === 'PageDown') {
      event.preventDefault();
      adjustPicker(type, type === 'minutes' ? -5 : -10);
    }
  });

  scroller.addEventListener('pointerdown', (event) => {
    if (timerId) return;
    state.isDragging = true;
    state.dragStartY = event.clientY;
    state.dragStartScrollTop = scroller.scrollTop;
    scroller.setPointerCapture(event.pointerId);
  });

  scroller.addEventListener('pointermove', (event) => {
    if (!state.isDragging || timerId) return;

    const deltaY = event.clientY - state.dragStartY;
    scroller.scrollTop = state.dragStartScrollTop - deltaY;
  });

  scroller.addEventListener('pointerup', (event) => {
    if (!state.isDragging) return;
    state.isDragging = false;
    scroller.releasePointerCapture(event.pointerId);
    snapToNearest(state, true);
  });

  scroller.addEventListener('pointercancel', () => {
    state.isDragging = false;
    snapToNearest(state, true);
  });

  return state;
}

function getIndexForValue(state, value) {
  if (!state.loop) {
    return value - state.min;
  }

  return secondsMiddleCycle * state.range + wrapSeconds(value);
}

function getScrollTopForIndex(index) {
  return index * PICKER_ITEM_HEIGHT;
}

function getNearestIndexFromScroll(state) {
  return Math.round(state.scroller.scrollTop / PICKER_ITEM_HEIGHT);
}

function getValueFromIndex(state, index) {
  if (!state.loop) {
    return clampMinutes(index + state.min);
  }

  return wrapSeconds(index % state.range);
}

function setExternalValue(type, value) {
  if (type === 'minutes') {
    minutesValue = clampMinutes(value);
    minutesPicker.setAttribute('aria-valuenow', String(minutesValue));
  } else {
    secondsValue = wrapSeconds(value);
    secondsPicker.setAttribute('aria-valuenow', String(secondsValue));
  }
}

function syncValueFromScroll(state) {
  const nearestIndex = getNearestIndexFromScroll(state);
  const value = getValueFromIndex(state, nearestIndex);

  state.currentValue = value;
  setExternalValue(state.type, value);

  totalSeconds = getInputSeconds();
  remainingSeconds = totalSeconds;
  updateDisplay();
  startBtn.disabled = totalSeconds <= 0;
  pauseBtn.disabled = true;
}

function recenterLoopIfNeeded(state) {
  if (!state.loop) return;

  const currentIndex = getNearestIndexFromScroll(state);
  const lowerBound = state.range;
  const upperBound = state.range * (SECONDS_REPEAT - 2);

  if (currentIndex < lowerBound || currentIndex > upperBound) {
    const centeredIndex = getIndexForValue(state, state.currentValue);
    state.scroller.scrollTop = getScrollTopForIndex(centeredIndex);
  }
}

function updatePickerVisual(state) {
  const center = state.scroller.scrollTop + state.scroller.clientHeight / 2;

  state.items.forEach((item) => {
    const itemCenter = item.offsetTop + item.offsetHeight / 2;
    const distancePx = Math.abs(center - itemCenter);
    const distanceStep = Math.round(distancePx / PICKER_ITEM_HEIGHT);
    item.dataset.distance = String(Math.min(distanceStep, 3));
  });
}

function requestPickerVisualUpdate(state) {
  if (state.rafVisual) return;

  state.rafVisual = requestAnimationFrame(() => {
    updatePickerVisual(state);
    state.rafVisual = null;
  });
}

function scheduleScrollEnd(state) {
  clearTimeout(state.scrollEndTimer);
  state.scrollEndTimer = setTimeout(() => {
    snapToNearest(state, true);
  }, SCROLL_END_DELAY);
}

function snapToNearest(state, animated = true) {
  const targetIndex = getIndexForValue(state, state.currentValue);
  const targetTop = getScrollTopForIndex(targetIndex);

  state.scroller.scrollTo({
    top: targetTop,
    behavior: animated ? 'smooth' : 'auto',
  });

  requestPickerVisualUpdate(state);
}

function setPickerValue(state, value, animated = true) {
  const safeValue = state.type === 'minutes' ? clampMinutes(value) : wrapSeconds(value);
  state.currentValue = safeValue;
  setExternalValue(state.type, safeValue);

  const targetIndex = getIndexForValue(state, safeValue);
  const targetTop = getScrollTopForIndex(targetIndex);

  state.scroller.scrollTo({
    top: targetTop,
    behavior: animated ? 'smooth' : 'auto',
  });

  requestPickerVisualUpdate(state);
}

function adjustPicker(type, delta) {
  if (type === 'minutes') {
    setPickerValue(pickerState.minutes, minutesValue + delta, true);
  }

  if (type === 'seconds') {
    setPickerValue(pickerState.seconds, secondsValue + delta, true);
  }

  playWheelTick();
  totalSeconds = getInputSeconds();
  remainingSeconds = totalSeconds;
  updateDisplay();
  startBtn.disabled = totalSeconds <= 0;
  pauseBtn.disabled = true;
}

function setPickerValuesFromSeconds(total, animated = false) {
  const parts = secondsToParts(total);
  setPickerValue(pickerState.minutes, parts.minutes, animated);
  setPickerValue(pickerState.seconds, parts.seconds, animated);

  totalSeconds = getInputSeconds();
  remainingSeconds = totalSeconds;
  updateDisplay();
  startBtn.disabled = totalSeconds <= 0;
  pauseBtn.disabled = true;
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

  statusText.textContent = '';
  hintText.textContent = '';
  readout.classList.remove('done', 'flash');
  panel.classList.remove('flash');

  setPickerValuesFromSeconds(getInputSeconds(), true);
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

function initPickers() {
  pickerState.minutes = createPicker(minutesPicker, 'minutes', 0, 999, false);
  pickerState.seconds = createPicker(secondsPicker, 'seconds', 0, 59, true);

  requestAnimationFrame(() => {
    setPickerValue(pickerState.minutes, minutesValue, false);
    setPickerValue(pickerState.seconds, secondsValue, false);
    updatePickerVisual(pickerState.minutes);
    updatePickerVisual(pickerState.seconds);
    syncIdleState();
  });
}

presetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (timerId) return;

    minutesValue = parseInt(btn.dataset.minutes, 10) || 0;
    secondsValue = 0;

    setPickerValue(pickerState.minutes, minutesValue, true);
    setPickerValue(pickerState.seconds, secondsValue, true);
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
initPickers();
syncIdleState();