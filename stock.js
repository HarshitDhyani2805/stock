const prices = window.STOCK_PRICES || {};
const storageKey = 'folio-desk-positions-v1';
const palette = ['#678365', '#b08c58', '#8295a0', '#9c7162', '#99a56e', '#68786e'];
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
let positions = loadPositions();
let toastTimer;

function loadPositions() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(saved) ? saved.filter((item) => prices[item.ticker] && Number.isInteger(item.quantity) && item.quantity > 0) : [];
  } catch {
    return [];
  }
}

function savePositions() {
  localStorage.setItem(storageKey, JSON.stringify(positions));
}

function message(text, isError = false) {
  const target = document.querySelector('#form-message');
  target.textContent = text;
  target.style.color = isError ? '#9b5247' : '#55744f';
}

function showToast(text) {
  const toast = document.querySelector('#toast');
  toast.textContent = text;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
}

function totalValue() {
  return positions.reduce((sum, item) => sum + prices[item.ticker] * item.quantity, 0);
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function render() {
  const total = totalValue();
  const shareCount = positions.reduce((sum, item) => sum + item.quantity, 0);
  const body = document.querySelector('#holdings-body');
  const empty = positions.length === 0;
  document.querySelector('#total-value').textContent = currency.format(total);
  document.querySelector('#position-count').textContent = positions.length;
  document.querySelector('#share-count').textContent = shareCount;
  document.querySelector('#nav-count').textContent = positions.length;
  document.querySelector('#holdings-caption').textContent = `${positions.length} ${positions.length === 1 ? 'position' : 'positions'}`;
  document.querySelector('#empty-state').hidden = !empty;
  body.innerHTML = positions.map((item, index) => {
    const value = prices[item.ticker] * item.quantity;
    const allocation = total ? (value / total) * 100 : 0;
    return `<tr>
      <td><div class="asset-cell"><span class="asset-mark">${escapeText(item.ticker.slice(0, 1))}</span><span><span class="asset-name">${escapeText(item.ticker)}</span><span class="asset-sub">US equity</span></span></div></td>
      <td class="cell-mono">${item.quantity}</td><td class="cell-mono">${currency.format(prices[item.ticker])}</td>
      <td class="allocation-cell"><div class="allocation-line"><span style="width:${allocation.toFixed(2)}%"></span></div><span class="allocation-percent">${allocation.toFixed(1)}%</span></td>
      <td class="value-cell">${currency.format(value)}</td><td><button class="remove-button" type="button" data-remove="${index}" aria-label="Remove ${escapeText(item.ticker)} position" title="Remove position">×</button></td>
    </tr>`;
  }).join('');
  renderAllocation(total);
}

function renderAllocation(total) {
  const aggregated = new Map();
  positions.forEach((item) => aggregated.set(item.ticker, (aggregated.get(item.ticker) || 0) + prices[item.ticker] * item.quantity));
  const rows = [...aggregated.entries()].sort((first, second) => second[1] - first[1]);
  document.querySelector('#allocation-total').textContent = total ? '100%' : '0%';
  document.querySelector('#allocation-list').innerHTML = rows.length ? rows.map(([ticker, value], index) => {
    const percent = total ? (value / total) * 100 : 0;
    return `<div class="allocation-row"><span class="allocation-swatch" style="--swatch:${palette[index % palette.length]}"></span><span class="allocation-symbol">${escapeText(ticker)} <span>· ${percent.toFixed(1)}%</span></span><strong>${currency.format(value)}</strong></div>`;
  }).join('') : '<p class="allocation-empty">Your allocation will appear here.</p>';
}

async function calculateOnServer() {
  const response = await fetch('/api/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ positions }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not calculate this portfolio.');
  return result;
}

async function exportPortfolio(fileType) {
  try {
    const response = await fetch(`/export/${fileType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions }),
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Export failed.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = response.headers.get('Content-Disposition')?.match(/filename=([^;]+)/)?.[1] || `portfolio.${fileType}`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(`${fileType.toUpperCase()} summary downloaded`);
  } catch (error) {
    showToast(error.message);
  }
}

function updateEstimate() {
  const ticker = document.querySelector('#ticker').value;
  const quantity = Math.max(1, Number.parseInt(document.querySelector('#quantity').value, 10) || 1);
  document.querySelector('#estimated-value').textContent = currency.format((prices[ticker] || 0) * quantity);
}

document.querySelector('#position-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const ticker = document.querySelector('#ticker').value;
  const quantity = Number.parseInt(document.querySelector('#quantity').value, 10);
  if (!prices[ticker] || !Number.isInteger(quantity) || quantity <= 0) {
    message('Choose a stock and enter a whole number of shares.', true);
    return;
  }
  const existing = positions.find((item) => item.ticker === ticker);
  if (existing) existing.quantity += quantity;
  else positions.push({ ticker, quantity });
  try {
    const result = await calculateOnServer();
    positions = result.positions.map(({ ticker: symbol, quantity: shares }) => ({ ticker: symbol, quantity: shares }));
    savePositions();
    render();
    message(`${ticker} added to your portfolio.`);
    document.querySelector('#quantity').value = '1';
    updateEstimate();
  } catch (error) {
    positions = loadPositions();
    render();
    message(error.message, true);
  }
});

document.querySelector('#holdings-body').addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove]');
  if (!button) return;
  const [removed] = positions.splice(Number(button.dataset.remove), 1);
  savePositions();
  render();
  message(`${removed.ticker} removed from your portfolio.`);
});

document.querySelector('#ticker').addEventListener('change', updateEstimate);
document.querySelector('#quantity').addEventListener('input', updateEstimate);
document.querySelector('#quantity-minus').addEventListener('click', () => {
  const input = document.querySelector('#quantity');
  input.value = Math.max(1, (Number.parseInt(input.value, 10) || 1) - 1);
  updateEstimate();
});
document.querySelector('#quantity-plus').addEventListener('click', () => {
  const input = document.querySelector('#quantity');
  input.value = (Number.parseInt(input.value, 10) || 1) + 1;
  updateEstimate();
});
document.querySelector('#export-csv').addEventListener('click', () => exportPortfolio('csv'));
document.querySelector('#export-txt').addEventListener('click', () => exportPortfolio('txt'));
document.querySelector('#jump-to-basket').addEventListener('click', () => document.querySelector('#ticker').focus());
document.querySelector('#empty-add').addEventListener('click', () => document.querySelector('#ticker').focus());
document.querySelector('#today-date').textContent = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date());
render();
updateEstimate();
