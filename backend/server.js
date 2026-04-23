const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Test API: Şehirleri getirir
app.get('/api/cities', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cities ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Sunucu Hatası');
  }
});

app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor kanka!`);
});