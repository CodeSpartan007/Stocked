import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Define custom interface extending express Request to retain typed session context
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: 'admin' | 'user';
  };
}

if (!process.env.JWT_SECRET) {
  throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing or empty. Server cannot start securely.');
}

const JWT_SECRET = process.env.JWT_SECRET;

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  let token: string | undefined;

  // 1. Try to extract from Bearer authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Try to extract from cookies if not found in header
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access Denied. Authentication token not found. Please log in.',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role: 'admin' | 'user';
    };

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };
    
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Access Denied. Authentication token is invalid or expired.',
    });
  }
};

/**
 * Strict Role-Based Access Control (RBAC) middleware
 * Intercepts unauthorized calls early and returns a 403 Forbidden status
 */
export const requireRole = (allowedRoles: ('admin' | 'user')[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not possess the required privilege level to perform this action.',
      });
    }

    return next();
  };
};
