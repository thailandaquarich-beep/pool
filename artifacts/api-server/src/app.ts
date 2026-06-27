import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { ensureBackupFolder } from "./lib/backup.js";
import { ensureDataDirs } from "./lib/dataPaths.js";
import { corsOptions, intrusionGuard, noStoreForSensitiveRoutes, rateLimit, securityHeaders } from "./middlewares/security.js";
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
app.use("/api", rateLimit({ windowMs: 60_000, max: 240, keyPrefix: "api" }));
app.use("/api", rateLimit({
  windowMs: 60_000,
  max: 80,
  keyPrefix: "api-write",
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
