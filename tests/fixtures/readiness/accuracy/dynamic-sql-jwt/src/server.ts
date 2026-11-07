import express from 'express';
import { Client } from 'pg';
import jwt from 'jsonwebtoken';

const app = express();
const client = new Client();

// Dynamic SQL query variable passed directly to client.query without params
app.get('/api/search', async (req, res) => {
  const dynamicSql = 'SELECT * FROM items WHERE type = ' + req.query.type;
  const result = await client.query(dynamicSql);
  res.json(result.rows);
});

// JWT signed with process.env.JWT_SECRET without startup validation
app.post('/api/token', (req, res) => {
  const token = jwt.sign({ sub: 'user_123' }, process.env.JWT_SECRET || '', { expiresIn: '1h' });
  // Dynamic cookie call without explicit static options
  res.cookie('token', token);
  res.json({ token });
});

export default app;
