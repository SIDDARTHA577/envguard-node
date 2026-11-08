import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
app.use('/auth', createProxyMiddleware({ target: process.env.AUTH_SERVICE_URL || 'http://localhost:8001' }));
app.use('/users', createProxyMiddleware({ target: process.env.USERS_SERVICE_URL || 'http://localhost:8002' }));
app.use('/orders', createProxyMiddleware({ target: process.env.ORDERS_SERVICE_URL || 'http://localhost:8003' }));

export default app;
