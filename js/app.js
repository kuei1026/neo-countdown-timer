/* =========================================================
   Neo Countdown Timer
   app.js

   這個檔案負責：
   1. 取得畫面上的 DOM 元素
   2. 管理倒數計時器的狀態
   3. 處理開始 / 暫停 / 重設
   4. 更新倒數時間與圓形進度條
   5. 時間到時播放提醒音
========================================================= */


/* =========================================================
   1) 取得畫面上的 DOM 元素
   ---------------------------------------------------------
   這一區的目的：
   先把 HTML 裡需要操作的元素抓出來，後面 JS 才能控制它們。
========================================================= */

const minutesInput = document.getElementById('minutes');      // 分鐘輸入框
const secondsInput = document.getElementById('seconds');      // 秒數輸入框

const startBtn = document.getElementById('startBtn');         // 開始按鈕
const pauseBtn = document.getElementById('pauseBtn');         // 暫停按鈕
const resetBtn = document.getElementById('resetBtn');         // 重設按鈕

const progressRing = document.getElementById('progressRing'); // SVG 圓形進度條
const timeDisplay = document.getElementById('timeDisplay');   // 中間的大型時間顯示
const statusText = document.getElementById('statusText');     // 狀態文字，例如 Ready / Running / Paused
const hintText = document.getElementById('hintText');         // 提示文字
const readout = document.getElementById('readout');           // 包住狀態與時間顯示的區塊
const panel = document.getElementById('panel');               // 右側面板，用於時間到閃爍效果

// 把所有快捷預設按鈕抓成陣列，後面方便一次綁事件
const presetButtons = [...document.querySelectorAll('.chip')];

const lightThemeBtn = document.getElementById('lightThemeBtn');
const darkThemeBtn = document.getElementById('darkThemeBtn');
// 預設初始模式
let currentTheme = localStorage.getItem('neo-theme') || 'light';
function applyTheme(theme) {
  currentTheme = theme;
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('neo-theme', theme);

  lightThemeBtn.classList.toggle('active', theme === 'light');
  darkThemeBtn.classList.toggle('active', theme === 'dark');
}

// 滾輪音效
function playWheelTick() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.03, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  } catch (err) {
    console.warn('無法播放滾輪音效', err);
  }
}

function adjustNumberInput(inputEl, delta, min, max) {
  const currentValue = parseInt(inputEl.value || '0', 10) || 0;
  const nextValue = Math.max(min, Math.min(max, currentValue + delta));

  if (nextValue === currentValue) return;

  inputEl.value = nextValue;
  playWheelTick();
  syncIdleState();
}
minutesInput.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (minutesInput.disabled) return;

  const delta = event.deltaY < 0 ? 1 : -1;
  adjustNumberInput(minutesInput, delta, 0, 999);
}, { passive: false });

secondsInput.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (secondsInput.disabled) return;

  const delta = event.deltaY < 0 ? 1 : -1;
  adjustNumberInput(secondsInput, delta, 0, 59);
}, { passive: false });

const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', () => {
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
});
/* =========================================================
   2) 常數與全域狀態
   ---------------------------------------------------------
   這一區的目的：
   儲存計時器運作時會一直用到的資料。
========================================================= */

// 圓周長公式：2 * π * r
// 我們的 SVG 圓半徑 r = 140，所以先算好圓周長
const CIRCUMFERENCE = 2 * Math.PI * 140;

// 先設定進度條的總長度
progressRing.style.strokeDasharray = String(CIRCUMFERENCE);
// 一開始先全部藏起來，等更新時再顯示
progressRing.style.strokeDashoffset = String(CIRCUMFERENCE);

// totalSeconds：這次倒數的總秒數
let totalSeconds = getInputSeconds();

// remainingSeconds：目前還剩幾秒
let remainingSeconds = totalSeconds;

// timerId：setInterval 回傳的 id，用來停止計時器
let timerId = null;

// endTime：倒數結束的「絕對時間點」(時間戳)
// 用這種方式比每秒單純 -1 更準
let endTime = null;

// audioCtx：Web Audio API 的音訊上下文，用來播放提醒音
let audioCtx = null;


/* =========================================================
   3) 工具函式：處理輸入值
   ---------------------------------------------------------
   這一區的目的：
   確保使用者輸入的是合理的時間。
========================================================= */

/**
 * 將輸入框的值修正到合法範圍
 * - 分鐘：0 ~ 999
 * - 秒數：0 ~ 59
 */
function sanitizeInputs() {
  const mins = Math.max(0, Math.min(999, parseInt(minutesInput.value || '0', 10) || 0));
  const secs = Math.max(0, Math.min(59, parseInt(secondsInput.value || '0', 10) || 0));

  minutesInput.value = mins;
  secondsInput.value = secs;
}

/**
 * 把輸入框中的分鐘 + 秒數，轉成總秒數
 * 例如：
 * 5 分 30 秒 -> 330 秒
 */
function getInputSeconds() {
  sanitizeInputs();

  const mins = parseInt(minutesInput.value || '0', 10) || 0;
  const secs = parseInt(secondsInput.value || '0', 10) || 0;

  return mins * 60 + secs;
}


/* =========================================================
   4) 工具函式：顯示格式處理
   ---------------------------------------------------------
   這一區的目的：
   把數字轉成畫面上比較好看的格式。
========================================================= */

/**
 * 將秒數格式化成 mm:ss
 * 例如：
 * 300 -> 05:00
 * 65  -> 01:05
 */
function formatTime(total) {
  const mins = Math.floor(total / 60);
  const secs = total % 60;

  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}


/* =========================================================
   5) 畫面更新：圓形進度條
   ---------------------------------------------------------
   這一區的目的：
   依照剩餘時間，更新 SVG 圓環顯示。
========================================================= */

/**
 * 更新圓形進度條
 *
 * 概念：
 * - totalSeconds = 一開始總時間
 * - remainingSeconds = 目前剩餘時間
 * - progress = 剩餘比例
 *
 * SVG 圓環利用 strokeDashoffset 控制顯示長度：
 * - 0              -> 全部顯示
 * - CIRCUMFERENCE  -> 全部隱藏
 */
function updateRing() {
  if (totalSeconds <= 0) {
    progressRing.style.strokeDashoffset = String(CIRCUMFERENCE);
    return;
  }

  const progress = remainingSeconds / totalSeconds;
  const offset = CIRCUMFERENCE * (1 - progress);

  progressRing.style.strokeDashoffset = String(offset);
}


/* =========================================================
   6) 畫面更新：時間與進度整體更新
   ---------------------------------------------------------
   這一區的目的：
   每次剩餘秒數變化時，更新畫面顯示。
========================================================= */

/**
 * 更新中間時間顯示 + 圓形進度條
 */
function updateDisplay() {
  timeDisplay.textContent = formatTime(remainingSeconds);
  updateRing();
}


/* =========================================================
   7) 畫面狀態：回到待機模式
   ---------------------------------------------------------
   這一區的目的：
   在剛進頁面、修改輸入、或重設時，讓畫面回到「尚未開始」狀態。
========================================================= */

/**
 * 同步待機狀態
 * 用在：
 * - 初次載入
 * - 修改輸入框
 * - 按下重設
 */
function syncIdleState() {
  totalSeconds = getInputSeconds();
  remainingSeconds = totalSeconds;

  updateDisplay();

  statusText.textContent = '';
  hintText.textContent = '';

  // 清掉完成狀態與閃爍效果
  readout.classList.remove('done', 'flash');
  panel.classList.remove('flash');

  // 如果時間是 0，就不能開始
  startBtn.disabled = totalSeconds <= 0;
  pauseBtn.disabled = true;
}


/* =========================================================
   8) 工具函式：控制輸入區是否可編輯
   ---------------------------------------------------------
   這一區的目的：
   當倒數開始後，避免使用者一邊計時一邊改輸入值造成混亂。
========================================================= */

/**
 * 控制輸入框與預設按鈕能不能操作
 */
function setInputsDisabled(disabled) {
  minutesInput.disabled = disabled;
  secondsInput.disabled = disabled;

  presetButtons.forEach((btn) => {
    btn.disabled = disabled;
  });
}


/* =========================================================
   9) 核心功能：開始倒數
   ---------------------------------------------------------
   這一區的目的：
   啟動倒數計時器。
========================================================= */

/**
 * 開始計時
 */
function startTimer() {
  // 如果目前已經在跑，就不要重複啟動
  if (timerId) return;

  // 如果剩餘秒數 <= 0，代表可能剛完成或還沒設定
  // 就重新從輸入框抓一次時間
  if (remainingSeconds <= 0) {
    totalSeconds = getInputSeconds();
    remainingSeconds = totalSeconds;
  }

  // 如果還是 <= 0，代表沒有合法時間，直接不啟動
  if (remainingSeconds <= 0) return;

  // 更新畫面狀態
  statusText.textContent = '';
  hintText.textContent = '';
  startBtn.disabled = true;
  pauseBtn.disabled = false;
  setInputsDisabled(true);

  // 清掉完成特效
  readout.classList.remove('done', 'flash');
  panel.classList.remove('flash');

  // 這次倒數會在什麼時間點結束
  endTime = Date.now() + remainingSeconds * 1000;

  // 每 200ms 更新一次畫面
  // 不直接每秒 -1，而是用 endTime - Date.now() 重新計算
  // 這樣比較準確，避免瀏覽器卡頓造成時間漂移
  timerId = setInterval(() => {
    remainingSeconds = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    updateDisplay();

    if (remainingSeconds <= 0) {
      finishTimer();
    }
  }, 200);
}


/* =========================================================
   10) 核心功能：暫停倒數
   ---------------------------------------------------------
   這一區的目的：
   停止目前的倒數，但保留剩餘時間。
========================================================= */

/**
 * 暫停計時
 */
function pauseTimer() {
  if (!timerId) return;

  clearInterval(timerId);
  timerId = null;

  statusText.textContent = '';
  hintText.textContent = '';
  startBtn.disabled = false;
  pauseBtn.disabled = true;

  // 暫停後允許重新編輯輸入
  setInputsDisabled(false);
}


/* =========================================================
   11) 核心功能：重設
   ---------------------------------------------------------
   這一區的目的：
   停止計時，並回到待機狀態。
========================================================= */

/**
 * 重設計時器
 */
function resetTimer() {
  clearInterval(timerId);
  timerId = null;

  setInputsDisabled(false);
  syncIdleState();
}


/* =========================================================
   12) 核心功能：時間到
   ---------------------------------------------------------
   這一區的目的：
   當倒數結束時，更新畫面並播放提醒音。
========================================================= */

/**
 * 倒數結束時執行
 */
function finishTimer() {
  clearInterval(timerId);
  timerId = null;
  remainingSeconds = 0;

  updateDisplay();

  statusText.textContent = '';
  hintText.textContent = '';
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  setInputsDisabled(false);

  // 加上完成狀態與閃爍效果
  readout.classList.add('done', 'flash');
  panel.classList.add('flash');

  playAlarm();
}


/* =========================================================
   13) 提醒音功能
   ---------------------------------------------------------
   這一區的目的：
   用 Web Audio API 直接合成提醒音，不需要額外音效檔。
========================================================= */

/**
 * 播放提醒音
 *
 * 做法：
 * - 建立 oscillator（振盪器）產生聲音
 * - 建立 gain 控制音量
 * - 做 4 段短音，形成提醒效果
 */
function playAlarm() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;

    for (let i = 0; i < 4; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      // sine = 比較柔和的提示音
      osc.type = 'sine';

      // 交替用兩種頻率，讓聲音比較像提醒音
      osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, now + i * 0.28);

      // 音量包絡：快速放大，再慢慢縮小
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


/* =========================================================
   14) 事件綁定：快捷預設按鈕
   ---------------------------------------------------------
   這一區的目的：
   點擊 1 / 5 / 10 / 25 / 45 分鐘時，自動幫使用者填入時間。
========================================================= */

presetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    minutesInput.value = btn.dataset.minutes;
    secondsInput.value = 0;
    syncIdleState();
  });
});


/* =========================================================
   15) 事件綁定：輸入框變更
   ---------------------------------------------------------
   這一區的目的：
   使用者修改分鐘或秒數後，立即刷新待機畫面。
========================================================= */

[minutesInput, secondsInput].forEach((el) => {
  el.addEventListener('input', syncIdleState);
  el.addEventListener('change', syncIdleState);
});


/* =========================================================
   16) 事件綁定：按鈕
   ---------------------------------------------------------
   這一區的目的：
   把按鈕點擊事件連到對應功能。
========================================================= */

startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
resetBtn.addEventListener('click', resetTimer);


/* =========================================================
   17) 特殊處理：分頁切換時修正時間
   ---------------------------------------------------------
   這一區的目的：
   如果使用者切到別的分頁再切回來，重新校正剩餘時間。
========================================================= */

document.addEventListener('visibilitychange', () => {
  // 如果頁面被藏起來，或根本沒在計時，就不用處理
  if (document.hidden || !timerId) return;

  remainingSeconds = Math.max(0, Math.round((endTime - Date.now()) / 1000));
  updateDisplay();

  if (remainingSeconds <= 0) {
    finishTimer();
  }
});


/* =========================================================
   18) 初始化
   ---------------------------------------------------------
   這一區的目的：
   網頁一打開就先同步一次畫面狀態。
========================================================= */

applyTheme(currentTheme);
syncIdleState();