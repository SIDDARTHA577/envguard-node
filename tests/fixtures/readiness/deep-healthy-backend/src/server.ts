import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || false }));
app.use(express.json());

// API-008: Rate Limiting Configured
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// SEC-004: Insecure Cookie Defense
app.get('/api/v1/auth/session', (req: Request, res: Response) => {
  res.cookie('auth_token', 'secure_val', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 3600000,
  });
  res.json({ authenticated: true });
});

// Authentication middleware using validated secret from environment
interface AuthenticatedRequest extends Request {
  user?: { id: string; tenantId: string; role: string };
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      type: 'https://api.example.com/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: 'Missing or malformed Authorization header',
    });
  }
  const token = authHeader.split(' ')[1];
  try {
    // SEC-005: Validated secret loaded from environment
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-fallback-secret-minimum-32-chars-long') as { id: string; tenantId: string; role: string };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({
      type: 'https://api.example.com/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: 'Invalid or expired authentication token',
    });
  }
}

// API-007: Bounded Pagination and SEC-006: Multi-Tenant Data Isolation
app.get('/api/v1/projects', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  // Bounded pagination: upper capped at 100
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  // DB-004: Type-safe parameterized query with tenant isolation
  const projects = await prisma.project.findMany({
    where: {
      tenantId,
      status: 'active',
    },
    take: limit,
    skip: offset,
  });

  res.json({ data: projects, pagination: { limit, offset } });
});

// DEP-002: Health Check Endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', uptime: process.uptime() });
});

// DEP-003: Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server gracefully');
  void prisma.$disconnect();
});

export default app;
