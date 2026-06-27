import { Router } from "express";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { auditLogsTable, db, usersTable } from "@workspace/db";
import { authenticate, requireSuperAdmin } from "../middlewares/auth.js";
import { memberCode } from "../lib/memberCode.js";

const router = Router();

router.use(authenticate, requireSuperAdmin);

const actionLabelTh: Record<string, string> = {
  login_success: "เข้าสู่ระบบสำเร็จ",
  login_failed: "เข้าสู่ระบบไม่สำเร็จ",
  logout: "ออกจากระบบ",
  session_check: "ตรวจสอบสถานะการใช้งาน",
  backup_access: "เข้าถึงข้อมูลสำรอง",
  audit_log_access: "ดูบันทึกความปลอดภัย",
  checkin: "เช็คอิน/ตัดคอร์ส",
  topup: "เติมเงินหรือเติมเครดิต",
  wallet: "จัดการกระเป๋าเงิน",
  order: "จัดการคำสั่งซื้อ",
  reservation: "จัดการการจอง",
  user: "จัดการสมาชิก/ผู้ใช้",
  package: "จัดการแพ็กเกจ/คอร์ส",
  instructor: "จัดการครูฝึก/ตารางสอน",
  staff_task: "จัดการภารกิจพนักงาน",
  attendance: "ลงเวลางานพนักงาน",
  leave: "จัดการคำขอลา",
  request_failed: "ทำรายการไม่สำเร็จ",
  get_request: "เปิดดูข้อมูล",
  post_request: "เพิ่ม/บันทึกข้อมูล",
  patch_request: "แก้ไขข้อมูล",
  put_request: "แก้ไขข้อมูล",
  delete_request: "ลบ/ยกเลิกข้อมูล",
};

const roleLabelTh: Record<string, string> = {
  super_admin: "ซูเปอร์แอดมิน",
  admin: "แอดมิน",
  staff: "พนักงาน",
  instructor: "ครูฝึก",
  member: "สมาชิก",
  customer: "สมาชิก",
};

const targetLabelTh: Record<string, string> = {
  auth: "ระบบเข้าสู่ระบบ",
  backup: "ข้อมูลสำรอง",
  "audit-logs": "บันทึกความปลอดภัย",
  checkin: "หน้าแสกน/เช็คอินสมาชิก",
  topup: "ระบบเติมเงิน",
  wallet: "กระเป๋าเงิน",
  orders: "การจอง/คำสั่งซื้อ",
  reservations: "การจองสระ/คอร์ส",
  users: "ข้อมูลสมาชิก",
  packages: "แพ็กเกจ/คอร์ส",
  instructors: "ครูฝึกและตารางสอน",
  tasks: "ภารกิจพนักงาน",
  attendance: "ลงเวลากะพนักงาน",
  leave: "คำขอลาพนักงาน",
  stats: "รายงานและภาพรวม",
  notifications: "การแจ้งเตือน",
  settings: "ตั้งค่าระบบ",
  branches: "สาขา",
  facilities: "สถานที่",
  products: "สินค้า",
  announcements: "ประกาศ",
  theme: "ธีมหน้าเว็บ",
  chat: "แชท",
  "ai-chat": "น้องอควา AI",
  "dev-support": "ศูนย์ช่วยเหลือ/ข้อความแจ้งปัญหา",
};

function parseDate(value: unknown, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const text = String(value);
  const d = new Date(endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T23:59:59.999+07:00` : text);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function methodVerbTh(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "เปิดดู";
    case "POST":
      return "เพิ่ม/บันทึก";
    case "PATCH":
    case "PUT":
      return "แก้ไข";
    case "DELETE":
      return "ลบ/ยกเลิก";
    default:
      return "ทำรายการ";
  }
}

function statusLabelTh(statusCode: number): string {
  if (statusCode >= 500) return "เกิดข้อผิดพลาดของระบบ";
  if (statusCode === 401) return "ไม่ผ่านการยืนยันตัวตน";
  if (statusCode === 403) return "ไม่มีสิทธิ์เข้าถึง";
  if (statusCode === 404) return "ไม่พบข้อมูล";
  if (statusCode >= 400) return "ไม่สำเร็จ";
  return "สำเร็จ";
}

function targetFromLog(path: string, targetType?: string | null): string {
  if (targetType && targetLabelTh[targetType]) return targetLabelTh[targetType];
  const first = path.replace(/^\/api\/?/, "").split("/").filter(Boolean)[0] ?? "";
  return targetLabelTh[first] ?? first.replace(/-/g, " ") ?? "ระบบ";
}

function actorLabelTh(log: typeof auditLogsTable.$inferSelect, actorName: string | null, code: string | null): string {
  const role = log.actorRole ? (roleLabelTh[log.actorRole] ?? log.actorRole) : "ผู้ใช้งาน";
  const name = actorName || log.actorUsername || "ไม่ระบุชื่อ";
  const suffix = code ? ` (${code})` : "";
  return `${role} ${name}${suffix}`;
}

function metadataText(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const data = metadata as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof data.identifier === "string") parts.push(`บัญชี/เบอร์/อีเมล: ${data.identifier}`);
  if (typeof data.reason === "string") {
    const reasonMap: Record<string, string> = {
      user_not_found: "ไม่พบผู้ใช้",
      bad_password: "รหัสผ่านไม่ถูกต้อง",
    };
    parts.push(`สาเหตุ: ${reasonMap[data.reason] ?? data.reason}`);
  }
  if (typeof data.branchHeader === "string") parts.push(`สาขา: ${data.branchHeader}`);
  if (typeof data.durationMs === "number") parts.push(`ใช้เวลา ${data.durationMs} ms`);
  return parts.length ? parts.join(" • ") : null;
}

function actionTargetPhrase(action: string, target: string): string {
  if (action.startsWith("เปิดดู")) return `${action}${target}`;
  if (action.startsWith("เพิ่ม") || action.startsWith("แก้ไข") || action.startsWith("ลบ")) return `${action}ในระบบ${target}`;
  return `${action}ในระบบ${target}`;
}

function buildSummaryTh(log: typeof auditLogsTable.$inferSelect, actorName: string | null, code: string | null): string {
  const actor = actorLabelTh(log, actorName, code);
  const status = statusLabelTh(log.statusCode);
  const target = targetFromLog(log.path, log.targetType);
  const action = actionLabelTh[log.action] ?? methodVerbTh(log.method);
  const extra = metadataText(log.metadata);

  if (log.action === "login_success") return `${actor} เข้าสู่ระบบสำเร็จ`;
  if (log.action === "login_failed") return `${actor} พยายามเข้าสู่ระบบแต่ไม่สำเร็จ${extra ? ` (${extra})` : ""}`;
  if (log.action === "logout") return `${actor} ออกจากระบบ`;
  if (log.statusCode >= 400) return `${actor} พยายาม${methodVerbTh(log.method)}${target} แต่${status}${extra ? ` (${extra})` : ""}`;

  const targetId = log.targetId ? ` หมายเลข ${log.targetId}` : "";
  return `${actor} ${actionTargetPhrase(action, target)}${targetId} (${status})`;
}

router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(200, Math.max(10, parseInt(String(req.query.limit || "50"), 10) || 50));
    const offset = (page - 1) * limit;
    const search = String(req.query.search || "").trim();
    const action = String(req.query.action || "all");
    const method = String(req.query.method || "all").toUpperCase();
    const status = String(req.query.status || "all");
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to, true);

    const where = and(
      from ? gte(auditLogsTable.createdAt, from) : undefined,
      to ? lte(auditLogsTable.createdAt, to) : undefined,
      action !== "all" ? eq(auditLogsTable.action, action) : undefined,
      method !== "ALL" ? eq(auditLogsTable.method, method) : undefined,
      status === "success" ? sql`${auditLogsTable.statusCode} < 400` : undefined,
      status === "failed" ? sql`${auditLogsTable.statusCode} >= 400` : undefined,
      search
        ? or(
            ilike(auditLogsTable.actorUsername, `%${search}%`),
            ilike(auditLogsTable.actorRole, `%${search}%`),
            ilike(auditLogsTable.action, `%${search}%`),
            ilike(auditLogsTable.path, `%${search}%`),
            ilike(auditLogsTable.ip, `%${search}%`),
            ilike(usersTable.firstName, `%${search}%`),
            ilike(usersTable.lastName, `%${search}%`),
            ilike(usersTable.phone, `%${search}%`),
            sql`${auditLogsTable.metadata}::text ilike ${`%${search}%`}`,
            sql`${auditLogsTable.actorUserId}::text ilike ${`%${search}%`}`,
            sql`${auditLogsTable.statusCode}::text ilike ${`%${search}%`}`,
          )
        : undefined,
    );

    const rows = await db
      .select({
        log: auditLogsTable,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        phone: usersTable.phone,
        email: usersTable.email,
        profileImageUrl: usersTable.profileImageUrl,
      })
      .from(auditLogsTable)
      .leftJoin(usersTable, eq(auditLogsTable.actorUserId, usersTable.id))
      .where(where)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogsTable)
      .leftJoin(usersTable, eq(auditLogsTable.actorUserId, usersTable.id))
      .where(where);

    const actionRows = await db
      .select({ action: auditLogsTable.action, count: sql<number>`count(*)::int` })
      .from(auditLogsTable)
      .groupBy(auditLogsTable.action)
      .orderBy(desc(sql<number>`count(*)::int`))
      .limit(50);

    return res.json({
      logs: rows.map(({ log, firstName, lastName, phone, email, profileImageUrl }) => {
        const actorName = firstName || lastName ? `${firstName ?? ""} ${lastName ?? ""}`.trim() : log.actorUsername;
        const code = log.actorUserId ? memberCode(log.actorUserId) : null;
        return {
          ...log,
          createdAt: log.createdAt.toISOString(),
          actorName,
          memberCode: code,
          phone,
          email,
          profileImageUrl,
          actionLabelTh: actionLabelTh[log.action] ?? methodVerbTh(log.method),
          targetLabelTh: targetFromLog(log.path, log.targetType),
          statusLabelTh: statusLabelTh(log.statusCode),
          summaryTh: buildSummaryTh(log, actorName, code),
        };
      }),
      actions: actionRows,
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
      generatedAt: new Date().toISOString(),
    });
  } catch {
    return res.status(500).json({ error: "Failed to list audit logs" });
  }
});

export default router;
