const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── CONFIG ── set these as Render environment variables
const TEAM_PASSWORD = process.env.TEAM_PASSWORD || 'stretchlab2024';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

app.post('/generate', async (req, res) => {
  const { password, messages, max_tokens } = req.body;

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
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('StretchLab proxy running on port', PORT));
