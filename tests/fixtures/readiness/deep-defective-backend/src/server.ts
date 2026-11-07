import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

// SEC-004: Insecure cookie flags (httpOnly: false, secure: false)
app.post('/login', (req: Request, res: Response) => {
  // SEC-005: Hardcoded JWT secret string
  const token = jwt.sign({ userId: '123' }, 'hardcoded_insecure_jwt_secret_123');
  res.cookie('session', token, {
    httpOnly: false,
    secure: false,
    sameSite: 'none',
  });
  res.json({ success: true });
});

// DB-004: Raw SQL Injection via query string interpolation
app.get('/api/users/search', async (req: Request, res: Response) => {
  const email = req.query.email;
  const users = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${email}'`);
  res.json({ users });
});

// API-007: Unconstrained pagination limit
app.get('/api/orders', async (req: Request, res: Response) => {
  const limit = req.query.limit || 1000000;
  const orders = await prisma.order.findMany({ take: Number(limit) });
  res.json({ orders });
});

// SEC-006: Multi-tenant query omitting tenant isolation filter
app.get('/api/projects', async (req: Request, res: Response) => {
  // Missing where: { tenantId } filter on multi-tenant Project model
  const projects = await prisma.project.findMany({
    where: {
      status: 'active',
    },
  });
  res.json({ projects });
});

// SEC-007: Unprotected administrative delete route without auth middleware
app.delete('/admin/users/:id', async (req: Request, res: Response) => {
  res.json({ deleted: true });
});

export default app;
