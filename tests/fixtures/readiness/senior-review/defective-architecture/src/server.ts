import express, { Request, Response } from 'express';
import Queue from 'bull';

const app = express();
const port = process.env.PORT || 4000;

// Defect: Unbounded memory cache without TTL or LRU cap
const sessionCache = new Map();

// Defect: Message queue without dead-letter queue or exponential backoff
const emailQueue = new Queue('emails', process.env.REDIS_URL || 'redis://localhost:6379');

// Defect: Missing rate limiting on mutating route
app.post('/api/login', (req: Request, res: Response) => {
  const { username } = req.body || {};
  sessionCache.set(username, { loggedInAt: Date.now() });
  res.status(200).json({ status: 'ok' });
});

// Defect: Missing /healthz endpoint

app.listen(port, () => {
  console.log(`Defective app running on ${port}`);
});

// Defect: Missing shutdown signal handlers

export { app, emailQueue, sessionCache };
