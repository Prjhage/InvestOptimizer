'use strict';

// ── State ────────────────────────────────────────────────
let chartInstance = null;
let currentChartType = 'bar';
let lastResults = null;

// ── Inline Stock Data (no server/fetch needed) ────────────
const stocks = [
  { name: "TCS", price: 3500, return: 12, risk: 6 },
  { name: "INFY", price: 1500, return: 10, risk: 4 },
  { name: "RELIANCE", price: 2500, return: 15, risk: 8 },
  { name: "HDFC", price: 2000, return: 11, risk: 5 },
  { name: "ICICI", price: 1800, return: 13, risk: 7 },
  { name: "WIPRO", price: 1200, return: 9, risk: 3 }
];

// ── Init on page load ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderStockTable(stocks);
  document.getElementById('stock-count-badge').textContent =
    `${stocks.length} Stocks Loaded`;
  document.getElementById('budget').addEventListener('keydown', e => {
    if (e.key === 'Enter') runAnalysis();
  });
  // Draw the Risk vs Return scatter chart immediately on load
  drawRiskReturnChart(stocks);
});

// ── Render Stock Table ────────────────────────────────────
function renderStockTable(data) {
  const tbody = document.getElementById('stock-tbody');
  const efficiencies = data.map(s => s.return / s.price * 100);
  const maxEff = Math.max(...efficiencies);

  tbody.innerHTML = data.map((s, i) => {
    const eff = (s.return / s.price * 100).toFixed(4);
    const barPct = ((eff / maxEff) * 100).toFixed(1);
    return `
      <tr>
        <td style="color:var(--text-muted);font-size:0.8rem;">${i + 1}</td>
        <td style="font-weight:600;">${s.name}</td>
        <td class="mono">&#8377;${s.price.toLocaleString('en-IN')}</td>
        <td class="mono" style="color:var(--accent2);">${s.return}%</td>
        <td>
          <div class="efficiency-bar">
            <div class="bar-fill" style="width:${barPct}%;min-width:4px;"></div>
            <span class="bar-val">${eff}</span>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ── Quick Budget Setter ───────────────────────────────────
function setBudget(amount) {
  document.getElementById('budget').value = amount;
  document.getElementById('budget').focus();
}

/* ==========================================================
   ALGORITHM 1: GREEDY
   Sort by return/price ratio descending, pick greedily.
   Time: O(n log n)
   ========================================================== */
function greedy(stockList, budget) {
  const sorted = [...stockList].sort(
    (a, b) => b.return / b.price - a.return / a.price
  );
  let spent = 0, profit = 0;
  const selected = [];
  for (const stock of sorted) {
    if (spent + stock.price <= budget) {
      spent += stock.price;
      profit += stock.return;
      selected.push(stock.name);
    }
  }
  return { profit, selected, spent };
}

/* ==========================================================
   ALGORITHM 2: DYNAMIC PROGRAMMING — 0/1 Knapsack
   Fill DP table, then backtrack to find selected items.
   Time: O(n x W)   Space: O(n x W)
   ========================================================== */
function dpKnapsack(stockList, budget) {
  const n = stockList.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(budget + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    const { price, return: ret } = stockList[i - 1];
    for (let w = 0; w <= budget; w++) {
      if (price <= w) {
        dp[i][w] = Math.max(ret + dp[i - 1][w - price], dp[i - 1][w]);
      } else {
        dp[i][w] = dp[i - 1][w];
      }
    }
  }

  // Backtrack to find selected stocks
  const selected = [];
  let w = budget;
  for (let i = n; i > 0; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      selected.push(stockList[i - 1].name);
      w -= stockList[i - 1].price;
    }
  }

  const profit = dp[n][budget];
  const spent = stockList
    .filter(s => selected.includes(s.name))
    .reduce((acc, s) => acc + s.price, 0);

  return { profit, selected: selected.reverse(), spent };
}

/* ==========================================================
   ALGORITHM 3: BRANCH & BOUND — DFS with pruning
   Explore include/exclude branches; prune using fractional UB.
   Time: O(2^n) worst, much faster with pruning in practice
   ========================================================== */
function branchAndBound(stockList, budget) {
  let maxProfit = 0;
  let bestSet = [];

  // Fractional upper-bound estimate from index idx
  function upperBound(idx, costLeft, currentProfit) {
    let bound = currentProfit;
    let cap = costLeft;
    for (let i = idx; i < stockList.length; i++) {
      if (stockList[i].price <= cap) {
        cap -= stockList[i].price;
        bound += stockList[i].return;
      } else {
        bound += stockList[i].return * (cap / stockList[i].price);
        break;
      }
    }
    return bound;
  }

  function dfs(i, cost, profit, chosen) {
    if (cost > budget) return;
    if (profit > maxProfit) {
      maxProfit = profit;
      bestSet = [...chosen];
    }
    if (i >= stockList.length) return;
    if (upperBound(i, budget - cost, profit) <= maxProfit) return;

    // Include stock i
    dfs(i + 1, cost + stockList[i].price, profit + stockList[i].return,
      [...chosen, stockList[i].name]);
    // Exclude stock i
    dfs(i + 1, cost, profit, chosen);
  }

  // Sort by efficiency for better pruning
  const sorted = [...stockList].sort(
    (a, b) => b.return / b.price - a.return / a.price
  );

  dfs(0, 0, 0, []);

  const spent = sorted
    .filter(s => bestSet.includes(s.name))
    .reduce((acc, s) => acc + s.price, 0);

  return { profit: maxProfit, selected: bestSet, spent };
}

/* ==========================================================
   MAIN — Run Analysis
   ========================================================== */
function runAnalysis() {
  const budgetInput = document.getElementById('budget');
  const budget = parseInt(budgetInput.value, 10);

  // Validation
  if (!budget || budget <= 0) {
    budgetInput.focus();
    budgetInput.style.outline = '2px solid #ff6b6b';
    setTimeout(() => { budgetInput.style.outline = ''; }, 1500);
    return;
  }

  showLoading(true);

  // Defer so the DOM can repaint before computation
  setTimeout(() => {
    try {
      const t0 = performance.now();
      const gResult = greedy(stocks, budget);
      const t1 = performance.now();

      const dResult = dpKnapsack(stocks, budget);
      const t2 = performance.now();

      const bResult = branchAndBound(stocks, budget);
      const t3 = performance.now();

      const gTime = (t1 - t0).toFixed(4);
      const dTime = (t2 - t1).toFixed(4);
      const bTime = (t3 - t2).toFixed(4);

      lastResults = { gResult, dResult, bResult, gTime, dTime, bTime, budget };

      renderResults(lastResults);
      renderSummary(lastResults);
      drawChart(gResult.profit, dResult.profit, bResult.profit, currentChartType);

      document.getElementById('results-section').classList.remove('hidden');
      document.getElementById('summary-section').classList.remove('hidden');
      document.getElementById('chart-card').classList.remove('hidden');

      document.getElementById('results-section')
        .scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
    } finally {
      showLoading(false);
    }
  }, 60);
}

// ── Loading state ─────────────────────────────────────────
function showLoading(show) {
  const el = document.getElementById('loading');
  const btn = document.getElementById('run-btn');
  if (show) {
    el.classList.remove('hidden');
    btn.disabled = true;
    btn.style.opacity = '0.6';
  } else {
    el.classList.add('hidden');
    btn.disabled = false;
    btn.style.opacity = '';
  }
}

// ── Render result cards ───────────────────────────────────
function renderResults({ gResult, dResult, bResult, gTime, dTime, bTime }) {
  fillCard('greedy', gResult, gTime);
  fillCard('dp', dResult, dTime);
  fillCard('bb', bResult, bTime);
}

function fillCard(key, result, time) {
  document.getElementById(`${key}-profit`).textContent = result.profit;
  document.getElementById(`${key}-time`).textContent = `${time} ms`;
  document.getElementById(`${key}-count`).textContent = result.selected.length;

  const container = document.getElementById(`${key}-stocks`);
  if (result.selected.length === 0) {
    container.innerHTML =
      `<span style="color:var(--text-muted);font-size:0.8rem;">No stocks fit the budget</span>`;
  } else {
    container.innerHTML = result.selected
      .map(name => `<span class="stock-tag">${name}</span>`)
      .join('');
  }
}

// ── Render summary ────────────────────────────────────────
function renderSummary({ gResult, dResult, bResult, gTime, dTime, bTime, budget }) {
  const profits = [
    { label: 'Greedy', val: gResult.profit, time: gTime, color: '#9b8fff' },
    { label: 'DP', val: dResult.profit, time: dTime, color: '#00d4aa' },
    { label: 'B&B', val: bResult.profit, time: bTime, color: '#ff9f43' }
  ];

  const bestProfit = Math.max(...profits.map(p => p.val));
  const fastestTime = Math.min(...profits.map(p => parseFloat(p.time)));
  const winner = profits.find(p => p.val === bestProfit);
  const fastest = profits.find(p => parseFloat(p.time) === fastestTime);

  document.getElementById('summary-content').innerHTML = `
    <div class="summary-stat">
      <div class="summary-stat-label">Budget</div>
      <div class="summary-stat-value" style="color:var(--accent);">&#8377;${budget.toLocaleString('en-IN')}</div>
      <div class="summary-stat-note">${stocks.length} stocks available</div>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-label">Best Profit</div>
      <div class="summary-stat-value" style="color:${winner.color};">${bestProfit}%</div>
      <div class="summary-stat-note">by ${winner.label}</div>
      <span class="winner-badge">&#127942; Optimal</span>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-label">Fastest Algorithm</div>
      <div class="summary-stat-value" style="color:var(--accent2);">${fastestTime.toFixed(4)} ms</div>
      <div class="summary-stat-note">${fastest.label}</div>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-label">DP vs Greedy Gap</div>
      <div class="summary-stat-value" style="color:var(--orange);">${dResult.profit - gResult.profit}%</div>
      <div class="summary-stat-note">extra return from DP</div>
    </div>
  `;
}

/* ==========================================================
   CHART — Bar or Radar
   ========================================================== */
function drawChart(g, d, b, type = 'bar') {
  const ctx = document.getElementById('chart').getContext('2d');

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const labels = ['Greedy', 'Dynamic Programming', 'Branch & Bound'];
  const values = [g, d, b];
  const colors = ['rgba(108,99,255,0.85)', 'rgba(0,212,170,0.85)', 'rgba(255,159,67,0.85)'];
  const borders = ['#9b8fff', '#00d4aa', '#ff9f43'];

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15,19,32,0.95)',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        titleColor: '#e8eaf0',
        bodyColor: '#7a7f9a',
        titleFont: { family: 'Inter', weight: '700', size: 13 },
        bodyFont: { family: 'JetBrains Mono', size: 12 },
        padding: 14,
        callbacks: {
          label: ctx => ` Profit: ${ctx.parsed.y ?? ctx.raw}%`
        }
      }
    },
    animation: { duration: 900, easing: 'easeOutQuart' }
  };

  if (type === 'bar') {
    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Profit (%)',
          data: values,
          backgroundColor: colors,
          borderColor: borders,
          borderWidth: 2,
          borderRadius: 10,
          borderSkipped: false
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#7a7f9a', font: { family: 'Inter', weight: '600' } }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: {
              color: '#7a7f9a',
              font: { family: 'JetBrains Mono' },
              callback: v => v + '%'
            },
            beginAtZero: true
          }
        }
      }
    });
  } else {
    // Radar chart
    chartInstance = new Chart(ctx, {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          label: 'Profit (%)',
          data: values,
          backgroundColor: 'rgba(108,99,255,0.2)',
          borderColor: '#9b8fff',
          borderWidth: 2,
          pointBackgroundColor: borders,
          pointRadius: 5
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          r: {
            grid: { color: 'rgba(255,255,255,0.08)' },
            angleLines: { color: 'rgba(255,255,255,0.08)' },
            ticks: {
              color: '#7a7f9a',
              backdropColor: 'transparent',
              font: { family: 'JetBrains Mono', size: 10 },
              callback: v => v + '%'
            },
            pointLabels: {
              color: '#e8eaf0',
              font: { family: 'Inter', weight: '600', size: 12 }
            }
          }
        }
      }
    });
  }
}
let riskChartInstance = null;

function drawRiskReturnChart(stockList) {
  const ctx = document.getElementById('riskChart').getContext('2d');

  if (riskChartInstance) {
    riskChartInstance.destroy();
    riskChartInstance = null;
  }

  // One dataset per stock for individual colors + labels
  const palette = [
    '#9b8fff', '#00d4aa', '#ff9f43', '#ff6b6b', '#48dbfb', '#1dd1a1'
  ];

  const datasets = stockList.map((stock, i) => ({
    label: stock.name,
    data: [{ x: stock.risk, y: stock.return }],
    backgroundColor: palette[i % palette.length] + 'cc',
    borderColor: palette[i % palette.length],
    borderWidth: 2,
    pointRadius: 10,
    pointHoverRadius: 14,
  }));

  riskChartInstance = new Chart(ctx, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#e8eaf0',
            font: { family: 'Inter', weight: '600', size: 12 },
            usePointStyle: true,
            pointStyleWidth: 10,
            padding: 18
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15,19,32,0.95)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#e8eaf0',
          bodyColor: '#7a7f9a',
          titleFont: { family: 'Inter', weight: '700', size: 13 },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          padding: 14,
          callbacks: {
            title: items => items[0].dataset.label,
            label: item =>
              `  Risk: ${item.parsed.x}  |  Return: ${item.parsed.y}%`
          }
        }
      },
      animation: { duration: 900, easing: 'easeOutQuart' },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Risk Level →',
            color: '#7a7f9a',
            font: { family: 'Inter', weight: '600', size: 12 }
          },
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: '#7a7f9a', font: { family: 'JetBrains Mono', size: 11 } },
          min: 0
        },
        y: {
          title: {
            display: true,
            text: 'Return (%) →',
            color: '#7a7f9a',
            font: { family: 'Inter', weight: '600', size: 12 }
          },
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: {
            color: '#7a7f9a',
            font: { family: 'JetBrains Mono', size: 11 },
            callback: v => v + '%'
          },
          min: 0
        }
      }
    }
  });
}

// ── Chart type switcher ───────────────────────────────────
function switchChart(type) {
  if (!lastResults) return;
  currentChartType = type;
  document.getElementById('toggle-bar').classList.toggle('active', type === 'bar');
  document.getElementById('toggle-radar').classList.toggle('active', type === 'radar');
  drawChart(
    lastResults.gResult.profit,
    lastResults.dResult.profit,
    lastResults.bResult.profit,
    type
  );
}
