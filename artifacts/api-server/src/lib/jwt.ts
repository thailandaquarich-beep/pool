import jwt from "jsonwebtoken";

const DEFAULT_DEV_JWT_SECRET = "pool-reservation-secret-key-change-in-production";
const configuredJwtSecret = process.env.JWT_SECRET;

if (!configuredJwtSecret && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET is required in production");
}

if (!configuredJwtSecret) {
  console.warn("[security] JWT_SECRET is not set. Using a development-only fallback secret.");
}

const JWT_SECRET = configuredJwtSecret || DEFAULT_DEV_JWT_SECRET;
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
