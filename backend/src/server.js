const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
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

function normalizeUsername(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

function validUsername(username) {
  return /^[a-z0-9_\-]{3,24}$/.test(username);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, packed) {
  if (!packed || typeof packed !== 'string') return false;
  const parts = packed.split(':');
  if (parts.length !== 2) return false;
  const [salt, savedHash] = parts;
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'utf8'), Buffer.from(savedHash, 'utf8'));
}

function issueToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_progress (
      player_id TEXT PRIMARY KEY,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      combat_power BIGINT NOT NULL DEFAULT 0,
      max_stage_index INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE game_progress
    ADD COLUMN IF NOT EXISTS combat_power BIGINT NOT NULL DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE game_progress
    ADD COLUMN IF NOT EXISTS max_stage_index INTEGER NOT NULL DEFAULT 1
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_game_progress_power
    ON game_progress (combat_power DESC, updated_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_game_progress_stage
    ON game_progress (max_stage_index DESC, updated_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_tokens (
      token TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    DELETE FROM game_progress
    WHERE player_id !~ '^user:[0-9]+$'
  `);
}

async function createSession(userId) {
  const token = issueToken();
  await pool.query('INSERT INTO user_tokens (token, user_id) VALUES ($1, $2)', [token, userId]);
  return token;
}

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return res.status(401).json({ ok: false, message: '인증 토큰이 필요합니다' });

  try {
    const result = await pool.query(
      `
      SELECT u.id, u.username
      FROM user_tokens t
      JOIN users u ON u.id = t.user_id
      WHERE t.token = $1
      `,
      [token]
    );

    if (!result.rows.length) return res.status(401).json({ ok: false, message: '유효하지 않은 토큰입니다' });

    req.auth = {
      token,
      user: {
        id: Number(result.rows[0].id),
        username: result.rows[0].username
      }
    };
    return next();
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
}

function normalizeCombatPower(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function normalizeStagePart(raw, fallback, min, max) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.floor(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function stageIndexFromPayload(payload) {
  const chapter = normalizeStagePart(payload?.chapter, 1, 1, 20);
  const stageRaw = payload?.currentStage ?? payload?.stage;
  const stage = normalizeStagePart(stageRaw, 1, 1, 20);
  return (chapter - 1) * 20 + stage;
}

function unpackProgressPayload(rawBody) {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return { payload: {}, combatPower: 0, maxStageIndex: 1 };
  }

  const body = { ...rawBody };
  const combatPower = normalizeCombatPower(body.__combatPower);
  const maxStageIndex = stageIndexFromPayload(body);
  delete body.__combatPower;
  return { payload: body, combatPower, maxStageIndex };
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', db: 'down', message: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!validUsername(username)) {
    return res.status(400).json({ ok: false, message: '아이디는 3~24자의 영문/숫자/_/-만 가능합니다' });
  }
  if (password.length < 4 || password.length > 128) {
    return res.status(400).json({ ok: false, message: '비밀번호는 4~128자여야 합니다' });
  }

  try {
    const packed = hashPassword(password);
    const inserted = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, packed]
    );

    const user = inserted.rows[0];
    const token = await createSession(user.id);
    return res.json({ ok: true, token, user: { id: Number(user.id), username: user.username } });
  } catch (error) {
    if (String(error.message || '').includes('duplicate key')) {
      return res.status(409).json({ ok: false, message: '이미 존재하는 아이디입니다' });
    }
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    return res.status(400).json({ ok: false, message: '아이디/비밀번호를 입력하세요' });
  }

  try {
    const result = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
    if (!result.rows.length) return res.status(401).json({ ok: false, message: '아이디 또는 비밀번호가 올바르지 않습니다' });

    const row = result.rows[0];
    if (!verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ ok: false, message: '아이디 또는 비밀번호가 올바르지 않습니다' });
    }

    const token = await createSession(row.id);
    return res.json({ ok: true, token, user: { id: Number(row.id), username: row.username } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM user_tokens WHERE token = $1', [req.auth.token]);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  return res.json({ ok: true, user: req.auth.user });
});

app.get('/api/progress/me', authMiddleware, async (req, res) => {
  const playerId = `user:${req.auth.user.id}`;
  try {
    const result = await pool.query('SELECT payload, updated_at FROM game_progress WHERE player_id = $1', [playerId]);

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

app.post('/api/progress/me', authMiddleware, async (req, res) => {
  const playerId = `user:${req.auth.user.id}`;
  const { payload, combatPower, maxStageIndex } = unpackProgressPayload(req.body);

  try {
    await pool.query(
      `
      INSERT INTO game_progress (player_id, payload, combat_power, max_stage_index, updated_at)
      VALUES ($1, $2::jsonb, $3, $4, NOW())
      ON CONFLICT (player_id)
      DO UPDATE SET payload = EXCLUDED.payload, combat_power = EXCLUDED.combat_power, max_stage_index = EXCLUDED.max_stage_index, updated_at = NOW()
      `,
      [playerId, JSON.stringify(payload), combatPower, maxStageIndex]
    );

    return res.json({ ok: true, playerId });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/progress/:playerId', async (req, res) => {
  const { playerId } = req.params;
  try {
    const result = await pool.query('SELECT payload, updated_at FROM game_progress WHERE player_id = $1', [playerId]);

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
  const { payload, combatPower, maxStageIndex } = unpackProgressPayload(req.body);

  try {
    await pool.query(
      `
      INSERT INTO game_progress (player_id, payload, combat_power, max_stage_index, updated_at)
      VALUES ($1, $2::jsonb, $3, $4, NOW())
      ON CONFLICT (player_id)
      DO UPDATE SET payload = EXCLUDED.payload, combat_power = EXCLUDED.combat_power, max_stage_index = EXCLUDED.max_stage_index, updated_at = NOW()
      `,
      [playerId, JSON.stringify(payload), combatPower, maxStageIndex]
    );

    return res.json({ ok: true, playerId });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

async function fetchRanking(type, limit) {
  const byStage = type === 'stage';
  const orderClause = byStage
    ? 'gp.max_stage_index DESC, gp.combat_power DESC, gp.updated_at DESC'
    : 'gp.combat_power DESC, gp.max_stage_index DESC, gp.updated_at DESC';
  const valueClause = byStage ? 'gp.max_stage_index > 0' : 'gp.combat_power > 0';

  const result = await pool.query(
    `
    SELECT
      gp.player_id,
      gp.combat_power,
      gp.max_stage_index,
      gp.updated_at,
      u.username
    FROM game_progress gp
    JOIN users u
      ON gp.player_id = ('user:' || u.id::text)
    WHERE gp.player_id LIKE 'user:%'
      AND u.username <> 'admin'
      AND ${valueClause}
    ORDER BY ${orderClause}
    LIMIT $1
    `,
    [limit]
  );

  return result.rows.map((row, index) => ({
    rank: index + 1,
    playerId: row.player_id,
    playerName: row.username,
    combatPower: Number(row.combat_power) || 0,
    maxStageIndex: Number(row.max_stage_index) || 1,
    updatedAt: row.updated_at
  }));
}

app.get('/api/ranking', async (req, res) => {
  const type = req.query.type === 'stage' ? 'stage' : 'power';
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(100, Math.floor(rawLimit)))
    : 20;

  try {
    const ranking = await fetchRanking(type, limit);
    return res.json({ ok: true, type, ranking });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/ranking/power', async (req, res) => {
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(100, Math.floor(rawLimit)))
    : 20;

  try {
    const ranking = await fetchRanking('power', limit);
    return res.json({ ok: true, type: 'power', ranking });
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






