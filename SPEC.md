# Aquarich — ข้อกำหนดระบบ (System Specification)

ระบบจองสระว่ายน้ำ + สมาชิก + ร้านค้า + ผู้ช่วย AI ของ Aqua Rich Thailand (บางบอน)
อัปเดต: 2026-06-30

---

## 1. ภาพรวม & สถาปัตยกรรม

แอปเว็บ (PWA-style) แบ่งเป็น 3 ส่วน รันแบบ monorepo (pnpm workspace):

| ส่วน | เทคโนโลยี | พอร์ต (local) |
|---|---|---|
| **Frontend** `artifacts/pool-reservation` | React 19 + Vite 7 + TailwindCSS 4 + wouter (router) + TanStack Query + shadcn/ui | 8080 (preview) / 5173 (dev) |
| **API server** `artifacts/api-server` | Express + Drizzle ORM + PostgreSQL + JWT | 5000 |
| **AI gateway** `gemma-chat/server.mjs` | Node http + Ollama (Typhoon 4B) | 8787 |
| **Database** | PostgreSQL (`pooledit`) | 5432 |

**การ deploy จริง:**
- Frontend = **Cloudflare Pages** → `https://pool-reservation.pages.dev` (Direct Upload จาก `dist/public`)
- `public/_worker.js` บน Pages ทำหน้าที่ proxy `/api/*` และ `/ai/*` → Cloudflare tunnel → local :5000 / :8787
- Backend + AI รันบนเครื่อง (Windows) เปิดสู่ภายนอกผ่าน cloudflared tunnel

**ฐานข้อมูล:** 28 ตาราง · migrations แบบรันมือ (`lib/db/migrations/*.sql`) · มี branch isolation (รองรับหลายสาขา/แฟรนไชส์)

---

## 2. บทบาทผู้ใช้ (Roles)

| Role | สิทธิ์ |
|---|---|
| **member** | สมาชิกทั่วไป — จอง, ซื้อแพ็กเกจ/สินค้า, กระเป๋าเงิน, โปรไฟล์, บัตรสมาชิก |
| **instructor** | ครูฝึก — ได้สิทธิ์ member ทั้งหมด + ตารางสอน/availability ของตัวเอง + คิวลูกค้า + ภารกิจ/ลงเวลา/ลา |
| **staff** | พนักงาน — ลงเวลางาน, ภารกิจ, การลา, โปรไฟล์ (ไม่มีหน้า member) |
| **admin** | จัดการทั้งระบบของสาขาตัวเอง |
| **super_admin** | admin + ข้ามทุกสาขา (franchise overview, branch switcher, audit logs, AI analytics) |

- เช็ค role จาก **DB สด** (ไม่ใช่ JWT) → เปลี่ยน role แล้วมีผลทันทีไม่ต้อง login ใหม่
- รหัสประจำตัวสมาชิก (**memberCode**) = **เบอร์โทรศัพท์** (เดิมเป็น ART00001) — ใช้เป็น ID ที่ผู้ใช้จำง่าย

---

## 3. ระบบ Authentication & สมัครสมาชิก

**Endpoints:** `/auth/*`
- `POST /auth/login` — เข้าด้วย **username / email / เบอร์โทร** + รหัสผ่าน (bcrypt 12 rounds) · rate-limit ต่อ (IP+identifier)
- `GET /auth/captcha` — SVG captcha (self-hosted, in-memory, single-use 5 นาที)
- `POST /auth/register/send-otp` — captcha-gated → ส่ง OTP 6 หลักทางอีเมล (Brevo)
- `POST /auth/register` — สมัคร (ต้องยืนยัน OTP ก่อน) → เก็บ phone_e164 (login by phone)
- `POST /auth/change-password`
- JWT 7 วัน (rememberMe 30 วัน)

**ความปลอดภัยการสมัคร:** captcha + email OTP (in-memory 10 นาที 5 ครั้ง) — Firebase phone-auth มีโค้ดแต่ปิดอยู่ (SMS ไม่ฟรี)

---

## 4. ระบบสมาชิก (Members)

**Member:** `GET /users/me/stats`, แก้โปรไฟล์ `PATCH /users/:id` (self)
- **โปรไฟล์แก้ได้:** ชื่อผู้ใช้ (unique), เบอร์โทร (sync phone_e164), รหัสผ่าน, รูป, น้ำหนัก/ส่วนสูง, อีเมล
- **ล็อก:** ชื่อจริง–นามสกุล (แก้ได้เฉพาะ admin)
- **บัตรสมาชิก QR** (`/membership-card`) — ใช้ `checkinToken` (UUID) สำหรับสแกน

**Admin:** `GET /users` (ค้นหา/แบ่งหน้า/branch-scoped), `POST/PATCH/DELETE /users/:id`, รีเซ็ตรหัสผ่าน, รายงาน CSV
- หน้า "จัดการสมาชิก" → ปุ่ม **ดู/เติมคอส** แสดงแพ็กเกจ + ประวัติการใช้งาน (ป้าย "หมดอายุแล้ว/ใช้งานได้")

---

## 5. ระบบแพ็กเกจสมาชิก (Packages)

**ตาราง:** `membership_packages` (แม่แบบ), `member_packages` (ที่สมาชิกถือ), `package_usages` (log การใช้), `member_package_events` (ประวัติแอดมิน)

**คุณสมบัติ:**
- แพ็กเกจมี: ชื่อ, **หมวดหมู่/ประเภทกิจกรรม** (ว่ายน้ำ/แอโรบิคในน้ำ/ฟิตเนส/อื่นๆ — เพิ่ม/แก้/ลบเองได้), ราคา, จำนวนวัน, จำนวนครั้ง/เดือน (quota), ส่วนลดจอง, รูป
- **ซื้อซ้ำได้ไม่จำกัด** → ถ้ายังถือแพ็กเกจเดิมที่ยังไม่หมดอายุ จะ **รวมเป็นใบเดียว: ต่อวันหมดอายุ + สะสมจำนวนรอบ**
- **คอสหมดอายุ:** สมาชิกจองด้วยคอสหมดอายุไม่ได้ · แต่ admin หักคอสที่หมดอายุแต่ยังเหลือครั้งได้ (desk override)
- หน้า `/packages` (ซื้อ): โชว์แพ็กเกจที่กำลังใช้งานทุกใบ (คงเหลือ+หมดอายุ) + ป้าย "กำลังใช้งาน" + ปุ่ม "ซื้อเพิ่ม/ต่ออายุ"
- หน้า `/my-packages`: สิทธิ์คงเหลือ + ประวัติการใช้งาน + ประวัติการซื้อ (ไม่มีปุ่มซื้อ)

**Endpoints:** `/packages` (รายการ), `/packages/all` (admin), `/packages/categories` (GET/PATCH/DELETE), `/packages/:id/purchase`, `/packages/my`, `/packages/my-usage`, `/packages/my/history`, `/packages/admin/member/:userId`, `/packages/admin/assign`, `/packages/admin/special-report`

---

## 6. ระบบจอง (Reservations / Booking)

**ตาราง:** `reservations`, `settings` (เวลาเปิด-ปิด, รอบ, จำนวนต่อรอบ, auto-confirm, จองล่วงหน้าได้กี่วัน)

- สมาชิกจอง: เลือกวัน → ครูฝึก → ช่วงเวลา → **แพ็กเกจที่จะใช้หัก** (หักทันที, คืนถ้ายกเลิกตอน pending)
- เลือกครูฝึกตามช่วงเวลาที่ครูเปิด availability · slot ของครูระบุ **หมวดหมู่คอส** → สมาชิกต้องใช้คอสในหมวดเดียวกัน
- สถานะ: pending / confirmed / cancelled · ยืนยัน = หัก 1 ครั้ง (กันหักซ้ำด้วย memberPackageId)
- **Endpoints:** `GET/POST /reservations`, `PATCH /reservations/:id` (admin/instructor confirm/cancel/reschedule)

---

## 7. ระบบครูฝึก (Instructors)

**ตาราง:** `instructors`, `instructor_availability` (weekly + เฉพาะวันที่, มี maxPeople, **category**, packageId(legacy), isAvailable)

- โปรไฟล์ครู (public landing + member view), "ครูฝึกที่ลงสอนวันนี้"
- **ตารางสอน (availability):** ครู/แอดมินตั้งช่วงเวลา + **หมวดหมู่คอส** + จำนวนรับ/รอบ
- **ปฏิทินครูฝึก** (`/calendar`) — สมาชิกดูรายเดือนว่าครูคนไหนลงวันไหน + กราฟรอบสอน + ตารางสรุป
- ครู self-service: `/instructors/me/*` (availability CRUD, คิวลูกค้า, สถิติการสอน), promote member→instructor
- **Endpoints:** `/instructors`, `/instructors/public`, `/instructors/today`, `/instructors/teaching?date=`, `/instructors/calendar?month=`, `/instructors/:id/availability`, `/instructors/me/*`

---

## 8. ระบบเช็คอิน (Check-in)

**Endpoints:** `/checkin/*`
- `GET /checkin/my-code` — สมาชิกขอ token QR
- `GET /checkin/search?q=` — **admin ค้นหาสมาชิกด้วย ชื่อ/เบอร์/รหัสสมาชิก** (partial)
- `GET /checkin/lookup?token=` — preview สมาชิก + สิทธิ์คงเหลือ (รับ ART code / เบอร์ / QR token)
- `POST /checkin` — สแกน → หัก 1 ครั้ง (เลือกคอสที่จะหักได้, รองรับคอสหมดอายุที่ยังเหลือครั้ง)
- หน้า `/admin/checkin` มีกล้องสแกน QR + ค้นหา/พิมพ์เอง

---

## 9. ระบบกระเป๋าเงิน & เติมเงิน (Wallet / Topup)

**ตาราง:** `wallets`, `transactions`, `topup_requests`
- กระเป๋าเงินต่อสมาชิก · ใช้ซื้อแพ็กเกจ/สินค้า
- คำขอเติมเงิน (แนบสลิป) → admin อนุมัติ → เพิ่มยอด
- `transactions` บันทึกทุกการเคลื่อนไหว (topup, booking_payment/refund, package_purchase, admin_credit/debit)
- **Endpoints:** `/wallet/me`, `/wallet/transactions`, `/wallet/all` (admin), `/topup/*`

---

## 10. ระบบร้านค้า & คำสั่งซื้อ (Products / Orders)

**ตาราง:** `products`, `orders`
- สินค้า: ชื่อ, ราคา, สต็อก, หมวด, รูป · หน้าร้าน `/products` + ตะกร้า `/cart`
- คำสั่งซื้อ: ที่อยู่จัดส่ง, แนบสลิป, สถานะ (pending/paid/shipped/cancelled), เลขพัสดุ
- สลิปการชำระเงินเก็บแบบ **เข้ารหัส** (AES-256-GCM) บนดิสก์
- **Endpoints:** `/products`, `/products/all`, `/orders` (admin), `/orders/my`, `/orders/admin/revenue`, `/orders/admin/history`, `/orders/admin/pending-count`

---

## 11. ระบบการขาย (Admin Sales — รวมศูนย์)

หน้าเดียว `/admin/orders` รวม 4 แท็บ:
1. **รายงาน** — ยอดขายรวม (สินค้า+แพ็กเกจ), เดือนนี้/วันนี้/รอชำระ, สินค้าขายดี, แพ็กเกจขายดี
2. **คำสั่งซื้อ** — จัดการออเดอร์สินค้า + CSV
3. **แพ็กเกจ** — จัดการแพ็กเกจ + จัดการหมวดหมู่
4. **ผลิตภัณฑ์** — จัดการสินค้า

- **ประวัติการซื้อทั้งหมด** (สินค้า + แพ็กเกจ) เรียงใหม่สุดก่อน · บอกใครซื้ออะไร (ชื่อ+รหัสสมาชิก) · **ค้นหาด้วยข้อความ + ช่วงวันที่** · ดาวน์โหลด CSV

---

## 12. ผู้ช่วย AI "น้องอควา"

**Gateway:** `gemma-chat/server.mjs` (:8787) → Ollama Typhoon 2.5 Qwen3-4b
- บุคลิกอบอุ่น เหมือนคน มี EQ (persona.md) · ความรู้สินค้า (knowledge.md)
- จำบทสนทนาต่อเนื่อง (history 20, num_ctx 8192, temp 0.4) · ตอบไว (keep_alive, quick-reply, streaming SSE)
- **Agentic:** ช่วยจอง/พาไปหน้าต่างๆ ได้ · escalate ให้เจ้าหน้าที่เมื่อเกินขอบเขต
- จำต่อผู้ใช้: สมาชิก = เก็บใน DB (`ai_chat_messages`), guest = localStorage
- **ปัจจุบันแสดงเฉพาะ ครูฝึก + แอดมิน** (ซ่อนจากสมาชิก) · คุยได้แม้ไม่มีแพ็กเกจ
- **Endpoints:** gateway `/assistant`, `/state` · API `/ai-chat/history|turn`, `/ai-chat` (super_admin analytics)

---

## 13. ระบบพนักงาน (Staff)

**ตาราง:** `attendance`, `leave_requests`, `staff_tasks`
- **ลงเวลางาน** (clock in/out) `/attendance`
- **ใบลา** `/leave` → admin อนุมัติ
- **ภารกิจประจำวัน** `/tasks`, แอดมิน **วางแผนงาน** `/admin/work-plan`
- ครูฝึกได้สิทธิ์เหล่านี้ด้วย

---

## 14. ระบบสื่อสาร & ช่วยเหลือ

**ตาราง:** `announcements`, `chat_messages`, `chat_tickets`, `dev_tickets`, `dev_ticket_messages`, `notifications`
- **ประกาศ** `/admin/announcements` → สมาชิกเห็น
- **แชทติดต่อเรา** `/chat` (มี AI first-responder ช่วยตอบก่อน) + admin chat
- **ศูนย์ช่วยเหลือ/dev-support** `/admin/help` (mirror ticket ไป Sovereign OS N2)
- **การแจ้งเตือน** (notification bell + SSE push) — feed รวม
- **LandingPopup** — ป๊อปอัปโปรโมชันหน้าแรก

---

## 15. ระบบหลายสาขา (Franchise / Branches) — super_admin

**ตาราง:** `branches` · ทุกตารางหลักมี `branchId`
- **Branch isolation:** admin เห็นเฉพาะสาขาตัวเอง · super_admin ข้ามได้ (header `X-Branch-Id`)
- **ภาพรวมทุกสาขา** `/admin/overview` + `/stats/branches` · จัดการสาขา `/admin/branches`

---

## 16. ระบบความปลอดภัย & ตรวจสอบ

- **bcrypt** (12 rounds), **JWT**, **captcha**, **rate-limit** (ดูข้อ 18)
- **Audit logs** (`audit_logs`) — บันทึกเหตุการณ์สำคัญ (login_failed ฯลฯ) · `/admin/audit-logs` (super_admin)
- **Encrypted vault** (AES-256-GCM, `lib/cryptoVault.ts`) — เข้ารหัสสลิป/log/backup บนดิสก์ (env `DATA_ENCRYPTION_KEY`)
- **intrusionGuard** (บล็อก path น่าสงสัย), security headers, CORS allowlist (`CORS_ORIGINS`)
- ข้อมูลลูกค้า + secrets ถูก gitignore (`data/`, `.run-logs/`, `*.log`)

---

## 17. ระบบตั้งค่า, ธีม, สำรองข้อมูล

- **Settings** (`settings`) — เวลาเปิด-ปิด, รอบจอง, จำนวนต่อรอบ, auto-confirm, จองล่วงหน้า
- **ธีมสีเว็บไซต์** (`app_theme`) `/admin/theme` (SSE live update)
- **สำรองข้อมูล:** pg_dump รายวัน 02:30 (`C:\AquarichBackups`) + app-level JSON backup เข้ารหัส (`data/backups/`, ตาราง registry แบบ manual)

---

## 18. ประสิทธิภาพ & Rate Limiting

- **Rate limit** keyed ตาม **ผู้ใช้ (userId จาก JWT)** ไม่ใช่ IP — เพราะ traffic ทั้งหมดผ่าน Cloudflare tunnel = IP เดียว (ถ้า key ด้วย IP จะ 429 ทุกคนตอน peak)
  - `/api` ทั่วไป: 300/นาที/ผู้ใช้ · เขียน (non-GET): 120/นาที/ผู้ใช้ · login/OTP: limiter แยกตาม (IP+identifier)
- **Benchmark (Monte Carlo, read-mix):** peak 40 ผู้ใช้พร้อมกัน → 100% สำเร็จ, p95 ~30ms, 0 error · รองรับฐานสมาชิก 1000 / active 10–40

---

## 19. อีเมล (Email / OTP)

- ส่งผ่าน **Brevo SMTP** (`smtp-relay.brevo.com:465`) — mailer เขียนเองไม่พึ่ง dependency (`lib/mailer.ts`)
- From: `thailandaquarich@gmail.com` (ต้อง verify เป็น Brevo sender กัน spam)
- **ข้อควรระวัง:** Brevo "Authorised IPs" ต้องอนุญาต IP เครื่อง (residential เปลี่ยนได้) ไม่งั้น `525 Unauthorized IP`
- config ใน `.run-logs/smtp.txt` (login, key, host, port, from) อ่านโดย `start-api.ps1`
- ไม่มี SMTP = dev mode (พิมพ์ OTP ลง log + คืน devCode)

---

## 20. การ Deploy

**Frontend (Cloudflare Pages):** `pnpm run cf:build` → อัปโหลด `artifacts/pool-reservation/dist/public` ใน Cloudflare dashboard (Direct Upload — GitHub auto-deploy ไม่ทำงาน)

**Backend/Web/AI (local, ต้องสิทธิ์ Administrator):**
- `.run-logs/deploy-restart.ps1` — restart API :5000 + web :8080
- `.run-logs/start-gateway.ps1` — restart AI gateway :8787

**Migrations:** รันมือ (ไม่มี auto-runner) — execute `lib/db/migrations/*.sql` กับ DB `pooledit`

---

## ภาคผนวก: ตารางฐานข้อมูล (28)

users · branches · settings · app_theme ·
membership_packages · member_packages · package_usages · member_package_events ·
reservations · instructors · instructor_availability ·
wallets · transactions · topup_requests ·
products · orders ·
facilities · member_addons ·
attendance · leave_requests · staff_tasks ·
announcements · notifications · chat_messages · chat_tickets ·
dev_tickets · dev_ticket_messages · ai_chat_messages · audit_logs
