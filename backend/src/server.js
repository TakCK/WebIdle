const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'idle_game',
  user: process.env.DB_USER || 'idle_user',
  password: process.env.DB_PASSWORD || 'idle_password'
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_progress (
      player_id TEXT PRIMARY KEY,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', db: 'down', message: error.message });
  }
});

app.get('/api/progress/:playerId', async (req, res) => {
  const { playerId } = req.params;
  try {
    const result = await pool.query(
      'SELECT payload, updated_at FROM game_progress WHERE player_id = $1',
      [playerId]
    );

    if (!result.rows.length) {
      return res.json({ playerId, payload: null, updatedAt: null });
    }

    return res.json({
      playerId,
      payload: result.rows[0].payload,
      updatedAt: result.rows[0].updated_at
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/progress/:playerId', async (req, res) => {
  const { playerId } = req.params;
  const payload = req.body && typeof req.body === 'object' ? req.body : {};

  try {
    await pool.query(
      `
      INSERT INTO game_progress (player_id, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (player_id)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `,
      [playerId, JSON.stringify(payload)]
    );

    return res.json({ ok: true, playerId });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`backend listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('db init failed:', error);
    process.exit(1);
  });
