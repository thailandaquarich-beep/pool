import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { ensureBackupFolder } from "./lib/backup.js";
import { ensureDataDirs } from "./lib/dataPaths.js";
import { corsOptions, intrusionGuard, noStoreForSensitiveRoutes, rateLimit, requestIp, securityHeaders } from "./middlewares/security.js";
import { auditRequests } from "./lib/audit.js";
import { assertDataEncryptionReady } from "./lib/cryptoVault.js";

await ensureDataDirs();
await ensureBackupFolder();
assertDataEncryptionReady();

const app: Express = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(securityHeaders());
app.use(cors(corsOptions()));
app.use(intrusionGuard());
app.use(noStoreForSensitiveRoutes());
// Rate-limit per AUTHENTICATED USER (not per IP): all traffic reaches this box through one
// Cloudflare tunnel, so an IP-only key would lump every member into a single shared bucket
// and 429 everyone at peak. Decode the JWT (no verify needed — bucketing only) for the user
// id; fall back to IP for unauthenticated calls (login/OTP have their own per-identifier limits).
const apiRateKey = (req: Request): string => {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    const parts = auth.slice(7).split(".");
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        if (payload && payload.userId != null) return `u:${payload.userId}`;
      } catch { /* fall through to IP */ }
    }
  }
  return requestIp(req);
};
app.use("/api", rateLimit({ windowMs: 60_000, max: 300, keyPrefix: "api", key: apiRateKey }));
app.use("/api", rateLimit({
  windowMs: 60_000,
  max: 120,
  keyPrefix: "api-write",
  key: apiRateKey,
  skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
}));
// 12mb so base64 payment-slip / product images fit (cart caps uploads at 5MB, +~33% base64)
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError) {
    return res.status(400).json({ error: "invalid_json", message: "รูปแบบ JSON ไม่ถูกต้อง" });
  }
  return next(err);
});

app.use(auditRequests());
app.use("/api", router);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled API error");
  return res.status(500).json({ error: "internal_error", message: "เกิดข้อผิดพลาดในระบบ" });
});

export default app;
