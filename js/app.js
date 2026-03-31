const minutesPicker = document.getElementById('minutesPicker');
const secondsPicker = document.getElementById('secondsPicker');
const themeToggle = document.getElementById('themeToggle');
const timeDisplay = document.getElementById('timeDisplay');

let minutes = 5;
let seconds = 0;
let timer = null;
let currentTheme = localStorage.getItem("theme") || "light";

/* 主題 */
function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  currentTheme = theme;
}

themeToggle.onclick = () => {
  applyTheme(currentTheme === "dark" ? "light" : "dark");
};

/* picker render */
function renderPicker(el, value, max) {
  el.innerHTML = "";

  for (let i = value - 2; i <= value + 2; i++) {
    let v = Math.max(0, Math.min(max, i));
    const div = document.createElement("div");
    div.className = "picker-item" + (i === value ? " active" : "");
    div.innerText = String(v).padStart(2, "0");
    el.appendChild(div);
  }
}

function updateUI() {
  renderPicker(minutesPicker, minutes, 999);
  renderPicker(secondsPicker, seconds, 59);
  timeDisplay.innerText =
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0");
}

/* 滾輪 */
minutesPicker.onwheel = (e) => {
  e.preventDefault();
  minutes += e.deltaY < 0 ? 1 : -1;
  minutes = Math.max(0, Math.min(999, minutes));
  updateUI();
};

secondsPicker.onwheel = (e) => {
  e.preventDefault();
  seconds += e.deltaY < 0 ? 1 : -1;
  seconds = Math.max(0, Math.min(59, seconds));
  updateUI();
};

/* 初始化 */
applyTheme(currentTheme);
updateUI();