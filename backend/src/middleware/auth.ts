import { Request, Response, NextFunction } from 'express';

// Define custom interface extending express Request
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Inject mock session user for Phase 1 Migration Safety
  req.user = {
    id: 'mock-user-123',
    email: 'user@stocked.com',
    role: 'user',
  };
  next();
};
