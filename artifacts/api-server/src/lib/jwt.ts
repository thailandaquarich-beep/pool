import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "pool-reservation-secret-key-change-in-production";
const JWT_EXPIRES_IN = "7d";
const JWT_REMEMBER_EXPIRES_IN = "30d";

export interface JwtPayload {
  userId: number;
  username: string;
  role: string;
}

export function signToken(payload: JwtPayload, rememberMe = false): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: rememberMe ? JWT_REMEMBER_EXPIRES_IN : JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
