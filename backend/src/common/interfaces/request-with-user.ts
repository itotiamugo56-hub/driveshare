import { Request } from 'express';
import { AppRole } from '../enums';

export interface AuthenticatedUser {
  userId: string;
  role: AppRole;
  email?: string;
}

export interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}
