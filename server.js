const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const TEAM_PASSWORD  = process.env.TEAM_PASSWORD  || 'stretchlab2024';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2024';
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY || '';

const LOG_FILE = '/tmp/sl_usage.json';

function loadLog() {
  try {
    if (fs.existsSync(LOG_FILE)) return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  } catch(e) {}
  return { total: 0, byDate: {}, byFlex: {} };
}

function saveLog(log) {
  try { fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2)); } catch(e) {}
}

function recordUsage(flexologist) {
  const log = loadLog();
  const today = new Date().toISOString().slice(0, 10);
  log.total = (log.total || 0) + 1;
  log.byDate[today] = (log.byDate[today] || 0) + 1;
  const key = (flexologist || 'unknown').toLowerCase().trim();
  log.byFlex[key] = (log.byFlex[key] || 0) + 1;
  saveLog(log);
}

app.post('/generate', async (req, res) => {
  const { password, messages, max_tokens, flexologist } = req.body;

  if (!password || password !== TEAM_PASSWORD) {
    return res.status(401).json({ error: 'Invalid team password.' });
  }
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'API key not configured on server.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: max_tokens || 1024,
        messages
      })
    });

    const data = await response.json();
    if (response.ok) recordUsage(flexologist);
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/stats', (req, res) => {
  if (!req.query.pw || req.query.pw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin password.' });
  }
  const log = loadLog();
  const estimatedCost = ((log.total || 0) * 0.004).toFixed(2);
  res.json({
    total_notes: log.total || 0,
    estimated_api_cost_usd: '$' + estimatedCost,
    by_flexologist: Object.fromEntries(Object.entries(log.byFlex || {}).sort(([,a],[,b]) => b - a)),
    last_30_days: Object.fromEntries(Object.entries(log.byDate || {}).sort(([a],[b]) => b.localeCompare(a)).slice(0,30))
  });
});

app.get('/dashboard', (req, res) => {
  if (!req.query.pw || req.query.pw !== ADMIN_PASSWORD) {
    return res.status(401).send('<h2>Add ?pw=yourAdminPassword to the URL</h2>');
  }
  const log = loadLog();
  const byDate = log.byDate || {};
  const byFlex = log.byFlex || {};
  const estimatedCost = ((log.total || 0) * 0.004).toFixed(2);
  const sortedDates = Object.entries(byDate).sort(([a],[b]) => b.localeCompare(a)).slice(0,30);
  const sortedFlex  = Object.entries(byFlex).sort(([,a],[,b]) => b - a);
  const dateRows = sortedDates.map(([d,n]) => `<tr><td>${d}</td><td>${n}</td></tr>`).join('');
  const flexRows = sortedFlex.map(([f,n]) => `<tr><td>${f}</td><td>${n}</td></tr>`).join('');

  res.send(`<!DOCTYPE html><html><head><title>StretchLab Usage</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:system-ui,sans-serif;background:#f0f7f6;color:#1b2631;margin:0;padding:24px}
  h1{color:#1a7a6e;margin-bottom:4px}
  .sub{color:#4a5568;font-size:.85rem;margin-bottom:24px}
  .cards{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:28px}
  .card{background:white;border-radius:12px;padding:20px 28px;border:1.5px solid #d1e8e4;min-width:150px}
  .card .num{font-size:2rem;font-weight:700;color:#1a7a6e}
  .card .lbl{font-size:.75rem;color:#4a5568;margin-top:2px;text-transform:uppercase;letter-spacing:1px}
  h2{color:#1a7a6e;font-size:.9rem;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px}
  table{background:white;border-radius:12px;border:1.5px solid #d1e8e4;border-collapse:collapse;width:100%;max-width:460px;margin-bottom:28px}
  th{background:#1a7a6e;color:white;padding:10px 16px;text-align:left;font-size:.78rem;letter-spacing:1px}
  th:first-child{border-radius:10px 0 0 0}th:last-child{border-radius:0 10px 0 0}
  td{padding:9px 16px;border-top:1px solid #e8f5f3;font-size:.88rem}
  tr:hover td{background:#f0f7f6}
</style></head><body>
<h1>🤸 StretchLab Note Usage</h1>
<div class="sub">Live stats · refresh page to update</div>
<div class="cards">
  <div class="card"><div class="num">${log.total||0}</div><div class="lbl">Total Notes</div></div>
  <div class="card"><div class="num">$${estimatedCost}</div><div class="lbl">Est. API Cost</div></div>
  <div class="card"><div class="num">${sortedFlex.length}</div><div class="lbl">Flexologists</div></div>
</div>
<h2>By Flexologist</h2>
<table><thead><tr><th>Flexologist (email)</th><th>Notes Generated</th></tr></thead>
<tbody>${flexRows||'<tr><td colspan="2">No data yet</td></tr>'}</tbody></table>
<h2>Last 30 Days</h2>
<table><thead><tr><th>Date</th><th>Notes Generated</th></tr></thead>
<tbody>${dateRows||'<tr><td colspan="2">No data yet</td></tr>'}</tbody></table>
</body></html>`);
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('StretchLab proxy running on port', PORT));
