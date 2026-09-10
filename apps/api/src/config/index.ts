import dotenv from 'dotenv';
dotenv.config();

const configuredCorsOrigins = process.env.CORS_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) || [];
const defaultCorsOrigins = ['https://qwerty9yh-gif.github.io', 'http://localhost:5173'];
const frontendOrigin = (process.env.FRONTEND_URL || 'https://qwerty9yh-gif.github.io/onyx/').replace(/\/$/, '');

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production-min-32-chars',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'https://qwerty9yh-gif.github.io/onyx/',
  corsOrigins: [...new Set([...configuredCorsOrigins, ...defaultCorsOrigins, frontendOrigin].map(origin => origin.replace(/\/$/, '')))],
  redisUrl: process.env.REDIS_URL,
  printerApiUrl: process.env.PRINTER_API_URL,
  syncInterval: parseInt(process.env.SYNC_INTERVAL || '30', 10),
  databaseResetEnabled: process.env.DATABASE_RESET_ENABLED === 'true',
  databaseResetToken: process.env.DATABASE_RESET_TOKEN || '',
};

