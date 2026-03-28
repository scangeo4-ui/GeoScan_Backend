import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config();
const app = express();
app.use(cors());
// Allow larger JSON bodies for non-file endpoints (safe moderate limit)
app.use(express.json({ limit: '10mb' }));

// --------------------
// MySQL (Aiven) Pool
// --------------------
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  multipleStatements: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false },
});

// Corrigir __dirname (pois em ES Modules ele não existe direto)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDatabase() {
  try {
    // Sobe uma pasta (de /src para /)
    const sqlPath = path.join(__dirname, "../init_db.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    console.log("🟢 Inicializando o banco de dados...");
    await pool.query(sql);
    
    console.log("✅ Banco de dados inicializado com sucesso!");
  } catch (err) {
    console.error("❌ Erro ao inicializar o banco de dados:", err.message);
  }
}

let lastRfidCode = null; // variável em memória que guarda o último código

// Endpoint que o ESP32 chama para enviar o código RFID
app.post('/rfid', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code é obrigatório' });

  lastRfidCode = code;
  console.log('RFID recebido:', code);
  return res.json({ ok: true });
});

// Endpoint que o frontend chama para obter o último código
app.get('/rfid', (req, res) => {
  return res.json({ code: lastRfidCode });
});

// --------------------
// VIBRATION SENSOR ENDPOINTS
// --------------------
// POST /vibration
// Body: { deviceId: string, value: number, timestamp?: ISOstring }
app.post('/vibration', async (req, res) => {
  try {
    const { deviceId, value, timestamp } = req.body || {};
    if (!deviceId || value === undefined) return res.status(400).json({ error: 'deviceId and value are required' });

    // If timestamp provided use it, otherwise let DB default to CURRENT_TIMESTAMP
    if (timestamp) {
      const sql = 'INSERT INTO vibrations (device_id, value, ts) VALUES (?, ?, ?)';
      await pool.query(sql, [deviceId, value, timestamp]);
    } else {
      const sql = 'INSERT INTO vibrations (device_id, value) VALUES (?, ?)';
      await pool.query(sql, [deviceId, value]);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('Error inserting vibration', err.message || err);
    return res.status(500).json({ error: 'Failed to save vibration' });
  }
});

// GET /vibration?limit=10  - returns latest readings (newest first)
app.get('/vibration', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '10', 10);
    const sql = 'SELECT id, device_id as deviceId, value, ts as timestamp FROM vibrations ORDER BY id DESC LIMIT ?';
    const [rows] = await pool.query(sql, [limit]);
    return res.json(rows);
  } catch (err) {
    console.error('Error fetching vibrations', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch vibrations' });
  }
});

// GET /vibration/latest - convenience endpoint for last 10
app.get('/vibration/latest', async (req, res) => {
  try {
    const sql = 'SELECT id, device_id as deviceId, value, ts as timestamp FROM vibrations ORDER BY id DESC LIMIT 10';
    const [rows] = await pool.query(sql);
    return res.json(rows);
  } catch (err) {
    console.error('Error fetching latest vibrations', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch latest vibrations' });
  }
});

// --------------------
// MAGNETOMETER SENSOR ENDPOINTS
// --------------------
// POST /magnetometer
// Body: { deviceId: string, value: number }
app.post('/magnetometer', async (req, res) => {
  try {
    const { deviceId, value } = req.body || {};
    if (!deviceId || value === undefined) return res.status(400).json({ error: 'deviceId and value are required' });

    const sql = 'INSERT INTO magnetometers (device_id, value) VALUES (?, ?)';
    await pool.query(sql, [deviceId, value]);

    return res.json({ ok: true });
  } catch (err) {
    console.error('Error inserting magnetometer data', err.message || err);
    return res.status(500).json({ error: 'Failed to save magnetometer data' });
  }
});

// GET /magnetometer?limit=10 - returns latest readings (newest first)
app.get('/magnetometer', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '10', 10);
    const sql = 'SELECT id, device_id as deviceId, value, ts as timestamp FROM magnetometers ORDER BY id DESC LIMIT ?';
    const [rows] = await pool.query(sql, [limit]);
    return res.json(rows);
  } catch (err) {
    console.error('Error fetching magnetometer data', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch magnetometer data' });
  }
});

// GET /magnetometer/latest - convenience endpoint for last 10
app.get('/magnetometer/latest', async (req, res) => {
  try {
    const sql = 'SELECT id, device_id as deviceId, value, ts as timestamp FROM magnetometers ORDER BY id DESC LIMIT 10';
    const [rows] = await pool.query(sql);
    return res.json(rows);
  } catch (err) {
    console.error('Error fetching latest magnetometer data', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch latest magnetometer data' });
  }
});

// GET /magnetometer/stats?deviceId=ESP32-001 - statistics for a device
app.get('/magnetometer/stats', async (req, res) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

    const sql = `
      SELECT 
        COUNT(*) as total,
        AVG(value) as average,
        MIN(value) as minimum,
        MAX(value) as maximum,
        STDDEV(value) as stdDev
      FROM magnetometers 
      WHERE device_id = ?
    `;
    const [rows] = await pool.query(sql, [deviceId]);
    return res.json(rows[0] || {});
  } catch (err) {
    console.error('Error fetching magnetometer stats', err.message || err);
    return res.status(500).json({ error: 'Failed to fetch magnetometer stats' });
  }
});


// Chama antes de iniciar o servidor
await initDatabase();
// --------------------
// Helpers
// --------------------
const handleError = (res, err) => {
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
};

// Simple input sanitizer for objects used with `SET ?`
// Removes undefined keys to avoid inserting them.
const clean = (obj) => {
  const out = {};
  Object.keys(obj).forEach((k) => {
    if (obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
};
// Endpoint raiz para verificar status do servidor
app.get("/", (req, res) => {
  res.send("Servidor rodando");
});
// Endpoint para listar todas as tabelas do banco de dados
app.get("/tabelas", async (req, res) => {
  try {
    const [rows] = await pool.query("SHOW TABLES");
    
    // Extrai o nome das tabelas (a chave depende do nome do banco)
    const tabelas = rows.map(row => Object.values(row)[0]);
    
    res.json({
      sucesso: true,
      total: tabelas.length,
      tabelas
    });
  } catch (err) {
    console.error("Erro ao listar tabelas:", err.message);
    res.status(500).json({
      sucesso: false,
      erro: "Erro ao listar tabelas do banco de dados."
    });
  }
});


// --------------------
// Start server
// --------------------
// Admin migration endpoint: alter foto columns to LONGTEXT on demand
// WARNING: Enabled only if ALLOW_MIGRATE=true in env (safety)
app.post('/admin/migrate/foto-columns', async (req, res) => {
  try {
    if (process.env.ALLOW_MIGRATE !== 'true') return res.status(403).json({ error: 'Migration not allowed' });
    // multipleStatements is enabled on pool, run both alters
    await pool.query('ALTER TABLE professores MODIFY foto LONGTEXT; ALTER TABLE estagiarios MODIFY foto LONGTEXT;');
    return res.json({ ok: true, message: 'Migration executed' });
  } catch (err) {
    console.error('Migration error', err);
    return res.status(500).json({ error: 'Migration failed', details: err.message });
  }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
app.listen(PORT, () => console.log(`Geo Scan API rodando na porta ${PORT}`));
