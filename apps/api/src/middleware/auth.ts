import { Response, NextFunction } from 'express';
import { signToken, verifyToken } from '../utils/helpers.js';
import { prisma } from '../utils/prisma.js';
import { config } from '../config/index.js';
import { AuthenticatedRequest } from '../types/index.js';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ error: 'No authorization header provided' });
      return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.status(401).json({ error: 'Invalid authorization header format' });
      return;
    }

    const token = parts[1];
    const payload = verifyToken(token);

    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Validate token structure
    const jwtPayload = payload as JWTPayload;
    if (!jwtPayload.userId || !jwtPayload.email) {
      res.status(401).json({ error: 'Invalid token payload' });
      return;
    }

    // Verify session exists and is valid
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session) {
      res.status(401).json({ error: 'Session not found' });
      return;
    }

    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } });
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    if (session.user.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Account is disabled' });
      return;
    }

    // Attach user info to request
    req.user = {
      id: session.user.id,
      email: session.user.email,
      username: session.user.username,
      role: session.user.role,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
    };

    // Update last seen for device
    if (session.deviceId) {
      await prisma.device.updateMany({
        where: {
          id: session.deviceId,
          userId: session.userId,
        },
        data: {
          lastSeen: new Date(),
          onlineStatus: true,
        },
      });
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      next();
      return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      next();
      return;
    }

    const token = parts[1];
    const payload = verifyToken(token);

    if (!payload) {
      next();
      return;
    }

    const jwtPayload = payload as JWTPayload;
    if (!jwtPayload.userId) {
      next();
      return;
    }

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (session && session.expiresAt > new Date() && session.user.status === 'ACTIVE') {
      req.user = {
        id: session.user.id,
        email: session.user.email,
        username: session.user.username,
        role: session.user.role,
        firstName: session.user.firstName,
        lastName: session.user.lastName,
      };
    }

    next();
  } catch (error) {
    console.error('Optional auth error:', error);
    next();
  }
}

export function generateToken(req: AuthenticatedRequest): string {
  const payload = {
    userId: req.user?.id,
    email: req.user?.email,
    role: req.user?.role,
  };
  return signToken(payload);
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

export function generateDeviceToken(deviceId: string): string {
  return signToken({ deviceId, type: 'device' }, '30d');
}

export function verifyDeviceToken(token: string): { deviceId: string } | null {
  try {
    const payload = verifyToken(token) as { deviceId?: string; type?: string };
    if (payload && payload.deviceId && payload.type === 'device') {
      return { deviceId: payload.deviceId };
    }
    return null;
  } catch {
    return null;
  }
}
