import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'ft-change-this-secret';

export interface AuthRequest extends Request {
  user?: { userId: string; username: string; role: string };
}

export function signToken(userId: string, username: string, role: string): string {
  return jwt.sign({ userId, username, role }, JWT_SECRET, { expiresIn: '30d' });
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { userId: string; username: string; role?: string };
    req.user = { userId: payload.userId, username: payload.username, role: payload.role || 'tester' };
    next();
  } catch {
    res.status(401).json({ error: 'Token expired or invalid' });
  }
}
