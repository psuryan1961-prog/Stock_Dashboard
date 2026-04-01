// CONFIG
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTDPJzNg13VRBu_oTE24ZfdH_G7TpyeZg1Dtk7Z8HDMPF4p92HcTdxnHipI9fm49zzL89zAq3bo-WyH/pub?output=csv";
const NSE_API_BASE = "http://nse-api-khaki.vercel.app:5000/stock?symbol="; // free Indianâ€‘market API [web:2]

// state
let stocks = [];
let chart = null;
let lastBuySignals = new Set(); // avoids duplicate BUY popups

// 1. Load Google Sheet (CSV)
async function loadSheet() {
  const res = await fetch(SHEET_CSV_URL);
  const text = await res.text();
  const lines = text.split("\n").filter(line => line.trim());
  const headers = lines[0].split(",");
  const rows = lines.slice(1).map(line => {
    const cells = line.split(",");
    const row = {};
    headers.forEach((h, i) => row[h] = cells[i] || "");
    return row;
  });
  return rows;
}

// 2. Load NSE price for one symbol
async function getPrice(symbol) {
  try {
    const res = await fetch(NSE_API_BASE + encodeURIComponent(symbol));
    if (!res.ok) throw new Error("API error");
    const json = await res.json();
    return json.ltp || json.price || json.last || null;
  } catch (err) {
    console.warn(`Price fetch failed for ${symbol}`, err);
    return null;
  }
}

// 3. Render left watchlist
function renderWatchlist() {
  const ul = document.getElementById("stocks");
  ul.innerHTML = "";

  stocks.forEach(stock => {
    const item = document.createElement("li");
    item.className = "watchlist-item";
    item.innerHTML = `
      <strong>${stock["Stock Name"] || "â€“"}</strong>
      <span class="signal">${stock["Final Signal"] || "â€“"}</span>
    `;
    item.dataset.nse = stock["NSE Code"] || "";
    item.dataset.name = stock["Stock Name"] || "";
    item.addEventListener("click", () => loadStock(stock));
    ul.appendChild(item);
  });
}

// 4. Load & show one stock (right panel)
async function loadStock(stock) {
  const name = stock["Stock Name"] || "Unknown";
  const nseCode = stock["NSE Code"] || "";

  document.getElementById("selected-name").textContent = name;
  document.getElementById("signal").textContent = stock["Final Signal"] || "â€“";
  document.getElementById("confidence").textContent = stock["Confidence"] || "â€“";

  // highlight in list
  document.querySelectorAll(".watchlist-item").forEach(el => {
    el.classList.remove("selected");
    if (el.dataset.nse === nseCode) el.classList.add("selected");
  });

  // price (async)
  if (nseCode) {
    const price = await getPrice(nseCode);
    document.getElementById("price").textContent = price || "â€“";
  }

  // dummy price data (you can later fetch from API)
  const dummyData = generateDummyPriceData(60); // 60 points
  updateChart(dummyData);

  // dummy news (youâ€™d replace with real news API)
  renderNews([
    {title: "Regular news item 1", breaking: false},
    {title: "ðŸš¨ BREAKING: Govt announces new policy", breaking: true},
    {title: "Regular news item 2", breaking: false}
  ]);
}

// 5. dummy price data (remove once you get real OHLC)
function generateDummyPriceData(n) {
  const now = new Date();
  const series = [];
  let price = 100;
  for (let i = 0; i < n; ++i) {
    price += (Math.random() - 0.5) * 5;
    const t = new Date(now.getTime() - (n - i) * 1000 * 60); // 1â€‘min steps
    series.push({t: t.getTime() / 1000, value: price});
  }
  return series;
}

// 6. price chart (Chart.js)
function initChart() {
  const ctx = document.getElementById("price-chart").getContext("2d");
  chart = new Chart(ctx, {
    type: "line",
    data: {datasets: [{label: "Price", data: [], borderColor: "#1976d2", tension: 0}]},
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: {type: "time", time: {unit: "minute"}}}
    }
  });
}

function updateChart(data) {
  if (!chart) return;
  chart.data.datasets[0].data = data.map(p => ({x: p.t, y: p.value}));
  chart.update();
}

// 7. dummy news
function renderNews(newsList) {
  const ul = document.getElementById("news-list");
  ul.innerHTML = "";

  newsList.forEach(n => {
    const li = document.createElement("li");
    li.textContent = n.title;
    if (n.breaking) li.classList.add("breaking");
    ul.appendChild(li);
  });
}

// 8. popup / alert system
function showPopup(text) {
  const div = document.createElement("div");
  div.className = "popup";
  div.textContent = text;

  div.addEventListener("click", () => document.body.removeChild(div));
  setTimeout(() => document.body.contains(div) && document.body.removeChild(div), 8000);

  document.body.appendChild(div);

  // sound alert (optional)
  const snd = new Audio("data:audio/wav;base64,//uQRAAgA..."); // replace with your short sound
  snd.play().catch(() => {});
}

// 9. check for new BUY signals and show top opportunities
function checkSignals() {
  const strongBuys = stocks
    .filter(s => s["Final Signal"] === "BUY" && +s["Confidence"] >= 4)
    .sort((a, b) => (b["Confidence"] || 0) - (a["Confidence"] || 0));

  strongBuys.forEach(s => {
    const key = s["NSE Code"];
    const wasKnown = lastBuySignals.has(key);
    const isNow = s["Final Signal"] === "BUY";

    if (isNow && !wasKnown) {
      showPopup(`${s["Stock Name"]} â€” BUY signal triggered!`);
    }

    if (isNow) lastBuySignals.add(key);
    else lastBuySignals.delete(key);
  });

  // log top 5 (you can render them in a small div if you want)
  console.log("Top 5 strong BUY opportunities:", strongBuys.slice(0, 5));
}

// 10. main
async function init() {
  initChart();

  // first load
  stocks = await loadSheet();
  renderWatchlist();

  // load first stock if available
  if (stocks.length > 0) await loadStock(stocks[0]);

  // autoâ€‘refresh every 5 minutes
  setInterval(async () => {
    const newStocks = await loadSheet();
    stocks = newStocks;
    renderWatchlist();
    // optionally reload selected stock:
    const selected = document.querySelector(".watchlist-item.selected");
    if (selected) {
      const nse = selected.dataset.nse;
      const stock = stocks.find(s => s["NSE Code"] === nse);
      if (stock) await loadStock(stock);
    }
    checkSignals(); // scans for new BUY signals
  }, 5 * 60 * 1000);
}

// start app
document.addEventListener("DOMContentLoaded", init);