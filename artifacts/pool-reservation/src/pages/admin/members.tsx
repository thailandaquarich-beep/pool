import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useResetUserPassword,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Pencil, Trash2, KeyRound, ChevronLeft, ChevronRight, GraduationCap, Phone, Mail, Users, Ticket, CalendarClock } from "lucide-react";
import { MemberAvatar } from "@/components/member-avatar";
import { ImageUpload } from "@/components/image-upload";
import { cn } from "@/lib/utils";

type User = {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string | null;
  memberCode?: string;
  weight?: number | null;
  height?: number | null;
  hasActivePackage?: boolean;
  packageName?: string | null;
  packageRemaining?: number | null;
  packageDaysLeft?: number | null;
  role: string;
  createdAt: string;
};

const roleConfig: Record<string, { label: string; cls: string; dot: string }> = {
  super_admin: { label: "Super Admin", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", dot: "bg-purple-500" },
  admin: { label: "Admin", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", dot: "bg-blue-500" },
  instructor: { label: "ครูฝึก", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", dot: "bg-amber-500" },
  member: { label: "Member", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500" },
};

const RoleBadge = ({ role }: { role: string }) => {
  const c = roleConfig[role] ?? roleConfig.member;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
};

const UserAvatar = ({ firstName, lastName, profileImageUrl }: { firstName: string; lastName: string; profileImageUrl?: string | null }) => {
  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-cyan-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0 shadow-sm ring-2 ring-background overflow-hidden">
      {profileImageUrl ? (
        <img src={profileImageUrl} alt={initials} className="w-full h-full object-cover" />
      ) : (
        initials
      )}
    </div>
  );
};

type AddForm = {
  firstName: string;
  lastName: string;
  weight: string;
  height: string;
  phone: string;
  email: string;
  username: string;
  password: string;
  role: string;
};

type EditForm = {
  firstName: string;
  lastName: string;
  weight: string;
  height: string;
  phone: string;
  email: string;
  role: string;
  profileImageUrl: string;
};

export function AdminMembers() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const token = localStorage.getItem("pool_token");
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  // Forms
  const [addForm, setAddForm] = useState<AddForm>({
    firstName: "", lastName: "", weight: "", height: "", phone: "",
    email: "", username: "", password: "", role: "member",
  });
  const [editForm, setEditForm] = useState<EditForm>({
    firstName: "", lastName: "", weight: "", height: "", phone: "", email: "", role: "member", profileImageUrl: "",
  });

  const params = { page, limit: 15, ...(debouncedSearch ? { search: debouncedSearch } : {}) };
  // Real-time: re-pull each member's remaining package uses from the DB every 8s
  // (and instantly when the admin returns to the tab). Remaining is computed live
  // server-side as quota − bookingsUsed, so each poll reflects the current count.
  const { data, isLoading } = useListUsers(params, {
    query: { queryKey: getListUsersQueryKey(params), refetchInterval: 8000, refetchOnWindowFocus: true, refetchOnMount: "always" },
  });
  const users: User[] = (data as any)?.users ?? [];
  const totalPages: number = (data as any)?.totalPages ?? 1;
  const total: number = (data as any)?.total ?? 0;

  const invalidate = () => qc.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => { toast({ title: "เพิ่มสมาชิกสำเร็จ" }); setAddOpen(false); invalidate(); resetAddForm(); },
      onError: (e: any) => toast({ title: "เกิดข้อผิดพลาด", description: e?.message, variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateUser({
    mutation: {
      onSuccess: () => { toast({ title: "แก้ไขสมาชิกสำเร็จ" }); setEditUser(null); invalidate(); },
      onError: (e: any) => toast({ title: "เกิดข้อผิดพลาด", description: e?.message, variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteUser({
    mutation: {
      onSuccess: () => { toast({ title: "ลบสมาชิกสำเร็จ" }); setDeleteUser(null); invalidate(); },
      onError: (e: any) => toast({ title: "เกิดข้อผิดพลาด", description: e?.message, variant: "destructive" }),
    },
  });

  const resetMutation = useResetUserPassword({
    mutation: {
      onSuccess: () => { toast({ title: "รีเซ็ตรหัสผ่านสำเร็จ" }); setResetUser(null); setNewPassword(""); },
      onError: (e: any) => toast({ title: "เกิดข้อผิดพลาด", description: e?.message, variant: "destructive" }),
    },
  });

  // Promote a member to instructor in one idempotent backend call (sets role=instructor
  // first, then links/creates their instructor profile — never fails on a duplicate email).
  const promoteMutation = useMutation({
    mutationFn: async ({ user, specialty }: { user: User; specialty: string }) => {
      const res = await fetch(`${baseUrl}/api/instructors/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: user.id, specialty: specialty || "ครูฝึกว่ายน้ำ" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ปรับระดับเป็นครูฝึกไม่สำเร็จ");
      return data;
    },
    onSuccess: () => {
      toast({ title: "ตั้งเป็นครูฝึกสำเร็จ", description: "ปรับระดับเป็นครูฝึกและเชื่อมโปรไฟล์แล้ว" });
      invalidate();
      qc.invalidateQueries({ queryKey: ["instructors"] });
    },
    onError: (e: any) => toast({ title: "เกิดข้อผิดพลาด", description: e?.message, variant: "destructive" }),
  });

  function resetAddForm() {
    setAddForm({ firstName: "", lastName: "", weight: "", height: "", phone: "", email: "", username: "", password: "", role: "member" });
  }

  function openEdit(user: User) {
    setEditForm({
      firstName: user.firstName, lastName: user.lastName,
      weight: user.weight != null ? String(user.weight) : "",
      height: user.height != null ? String(user.height) : "",
      phone: user.phone ?? "",
      email: user.email, role: user.role,
      profileImageUrl: (user as any).profileImageUrl ?? "",
    });
    setEditUser(user);
  }

  let searchTimer: ReturnType<typeof setTimeout>;
  function handleSearchChange(val: string) {
    setSearch(val);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { setDebouncedSearch(val); setPage(1); }, 400);
  }

  const shownUsers = roleFilter === "all" ? users : users.filter((u) => u.role === roleFilter);
  const roleTabs = [
    { key: "all", label: "ทั้งหมด" },
    { key: "member", label: "สมาชิก" },
    { key: "instructor", label: "ครูฝึก" },
    { key: "staff", label: "พนักงาน" },
    { key: "admin", label: "แอดมิน" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header card */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-card to-card p-5 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-cyan-500 text-white flex items-center justify-center shadow-md shadow-primary/25">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-gradient">จัดการสมาชิก</h1>
            <p className="text-sm text-muted-foreground mt-0.5">ทั้งหมด <span className="font-semibold text-foreground">{total}</span> คน</p>
          </div>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2 rounded-full px-5 shadow-sm" data-testid="add-member-btn">
          <Plus className="w-4 h-4" /> เพิ่มสมาชิก
        </Button>
      </div>

      {/* Toolbar: search + role tabs */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 rounded-full"
            placeholder="ค้นหาชื่อ, อีเมล, ชื่อผู้ใช้..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            data-testid="search-input"
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-full bg-muted/60 w-fit overflow-x-auto">
          {roleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setRoleFilter(tab.key)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                roleFilter === tab.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-16 text-center text-muted-foreground">กำลังโหลด...</div>
        ) : shownUsers.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            ไม่พบสมาชิก
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide">
                  <th className="text-left px-5 py-3.5 font-semibold text-muted-foreground">สมาชิก</th>
                  <th className="hidden lg:table-cell text-left px-4 py-3.5 font-semibold text-muted-foreground">ข้อมูลร่างกาย</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-muted-foreground">แพ็กเกจ / สิทธิ์คงเหลือ</th>
                  <th className="hidden md:table-cell text-left px-4 py-3.5 font-semibold text-muted-foreground">ติดต่อ</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-muted-foreground">ระดับ</th>
                  <th className="hidden lg:table-cell text-left px-4 py-3.5 font-semibold text-muted-foreground">สมัครเมื่อ</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-muted-foreground">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {shownUsers.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    {/* member */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar firstName={user.firstName} lastName={user.lastName} profileImageUrl={(user as any).profileImageUrl} />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{user.firstName} {user.lastName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">@{user.username}</span>
                            <span className="font-mono text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{user.memberCode ?? "-"}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* body */}
                    <td className="hidden lg:table-cell px-4 py-3">
                      {user.weight || user.height ? (
                        <div className="flex flex-wrap gap-1.5">
                          {user.weight != null && <span className="text-xs px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">{user.weight} กก.</span>}
                          {user.height != null && <span className="text-xs px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">{user.height} ซม.</span>}
                        </div>
                      ) : <span className="text-muted-foreground">-</span>}
                    </td>
                    {/* package: remaining uses + days left */}
                    <td className="px-4 py-3">
                      {user.hasActivePackage ? (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <Ticket className="w-3 h-3" /> {user.packageRemaining === null ? "ไม่จำกัด" : `เหลือ ${user.packageRemaining} ครั้ง`}
                          </span>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <CalendarClock className="w-3 h-3" /> อีก {user.packageDaysLeft} วัน
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">— ไม่มีแพ็กเกจ</span>
                      )}
                    </td>
                    {/* contact */}
                    <td className="hidden md:table-cell px-4 py-3">
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1.5 text-foreground"><Phone className="w-3 h-3 text-muted-foreground shrink-0" /> {user.phone ?? "-"}</div>
                        <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="w-3 h-3 shrink-0" /> <span className="truncate max-w-[180px]">{user.email}</span></div>
                      </div>
                    </td>
                    {/* role */}
                    <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                    {/* joined */}
                    <td className="hidden lg:table-cell px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(user.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    {/* actions */}
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary" onClick={() => openEdit(user)} title="แก้ไข" data-testid={`edit-btn-${user.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary" onClick={() => { setResetUser(user); setNewPassword(""); }} title="รีเซ็ตรหัสผ่าน" data-testid={`reset-btn-${user.id}`}>
                          <KeyRound className="w-3.5 h-3.5" />
                        </Button>
                        {user.role !== "instructor" && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30" disabled={promoteMutation.isPending} onClick={() => promoteMutation.mutate({ user, specialty: "ครูฝึกว่ายน้ำ" })} title="ตั้งเป็นครูฝึก (ปรับระดับทันที)" data-testid={`promote-btn-${user.id}`}>
                            <GraduationCap className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteUser(user)} title="ลบ" data-testid={`delete-btn-${user.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>หน้า {page} จาก {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add Member Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>เพิ่มสมาชิกใหม่</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>ชื่อ *</Label>
              <Input value={addForm.firstName} onChange={e => setAddForm(f => ({ ...f, firstName: e.target.value }))} placeholder="ชื่อ" data-testid="add-firstName" />
            </div>
            <div className="space-y-1.5">
              <Label>นามสกุล *</Label>
              <Input value={addForm.lastName} onChange={e => setAddForm(f => ({ ...f, lastName: e.target.value }))} placeholder="นามสกุล" data-testid="add-lastName" />
            </div>
            <div className="space-y-1.5">
              <Label>น้ำหนัก (กก.)</Label>
              <Input type="number" min={0} value={addForm.weight} onChange={e => setAddForm(f => ({ ...f, weight: e.target.value }))} placeholder="เช่น 60" data-testid="add-weight" />
            </div>
            <div className="space-y-1.5">
              <Label>ส่วนสูง (ซม.)</Label>
              <Input type="number" min={0} value={addForm.height} onChange={e => setAddForm(f => ({ ...f, height: e.target.value }))} placeholder="เช่น 170" data-testid="add-height" />
            </div>
            <div className="space-y-1.5">
              <Label>เบอร์โทร</Label>
              <Input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="0812345678" data-testid="add-phone" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>อีเมล *</Label>
              <Input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" data-testid="add-email" />
            </div>
            <div className="space-y-1.5">
              <Label>ชื่อผู้ใช้ *</Label>
              <Input value={addForm.username} onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))} placeholder="username" data-testid="add-username" />
            </div>
            <div className="space-y-1.5">
              <Label>รหัสผ่าน *</Label>
              <Input type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} placeholder="รหัสผ่าน" data-testid="add-password" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>ระดับสิทธิ์</Label>
              <Select value={addForm.role} onValueChange={val => setAddForm(f => ({ ...f, role: val }))}>
                <SelectTrigger data-testid="add-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member — สมาชิกทั่วไป</SelectItem>
                  <SelectItem value="instructor">ครูฝึก — ผู้ฝึกสอน</SelectItem>
                  <SelectItem value="staff">พนักงาน — ลงเวลางานได้</SelectItem>
                  <SelectItem value="admin">Admin — ผู้ดูแลระบบ</SelectItem>
                  <SelectItem value="super_admin">Super Admin — สิทธิ์สูงสุด</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>ยกเลิก</Button>
            <Button
              data-testid="add-submit"
              disabled={createMutation.isPending || !addForm.firstName || !addForm.lastName || !addForm.email || !addForm.username || !addForm.password}
              onClick={() => createMutation.mutate({ data: addForm as any })}
            >
              {createMutation.isPending ? "กำลังบันทึก..." : "เพิ่มสมาชิก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={!!editUser} onOpenChange={open => !open && setEditUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>แก้ไขข้อมูลสมาชิก</DialogTitle>
            {editUser?.memberCode && (
              <p className="text-sm text-muted-foreground">รหัสสมาชิก: <span className="font-mono font-semibold text-primary">{editUser.memberCode}</span></p>
            )}
          </DialogHeader>
          {editUser && (
            <div className="flex justify-center -mt-1 mb-1">
              <ImageUpload value={editForm.profileImageUrl} onChange={(v) => setEditForm(f => ({ ...f, profileImageUrl: v ?? "" }))} shape="circle" maxMb={3} label="รูปสมาชิก" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>ชื่อ</Label>
              <Input value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} data-testid="edit-firstName" />
            </div>
            <div className="space-y-1.5">
              <Label>นามสกุล</Label>
              <Input value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} data-testid="edit-lastName" />
            </div>
            <div className="space-y-1.5">
              <Label>น้ำหนัก (กก.)</Label>
              <Input type="number" min={0} value={editForm.weight} onChange={e => setEditForm(f => ({ ...f, weight: e.target.value }))} data-testid="edit-weight" />
            </div>
            <div className="space-y-1.5">
              <Label>ส่วนสูง (ซม.)</Label>
              <Input type="number" min={0} value={editForm.height} onChange={e => setEditForm(f => ({ ...f, height: e.target.value }))} data-testid="edit-height" />
            </div>
            <div className="space-y-1.5">
              <Label>เบอร์โทร</Label>
              <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} data-testid="edit-phone" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>อีเมล</Label>
              <Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} data-testid="edit-email" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>ระดับสิทธิ์ (Rank)</Label>
              <Select value={editForm.role} onValueChange={val => setEditForm(f => ({ ...f, role: val }))}>
                <SelectTrigger data-testid="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member — สมาชิกทั่วไป</SelectItem>
                  <SelectItem value="instructor">ครูฝึก — ผู้ฝึกสอน</SelectItem>
                  <SelectItem value="staff">พนักงาน — ลงเวลางานได้</SelectItem>
                  <SelectItem value="admin">Admin — ผู้ดูแลระบบ</SelectItem>
                  <SelectItem value="super_admin">Super Admin — สิทธิ์สูงสุด</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                เปลี่ยนเป็น Admin เพื่อให้สิทธิ์เข้าถึงหน้าจัดการระบบ · ใช้ปุ่ม 🎓 ในตารางเพื่อสร้างโปรไฟล์ครูฝึกอัตโนมัติ
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>ยกเลิก</Button>
            <Button
              data-testid="edit-submit"
              disabled={updateMutation.isPending}
              onClick={() => editUser && updateMutation.mutate({ id: editUser.id, data: editForm as any })}
            >
              {updateMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetUser} onOpenChange={open => !open && setResetUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>รีเซ็ตรหัสผ่าน</DialogTitle>
          </DialogHeader>
          {resetUser && (
            <p className="text-sm text-muted-foreground">
              รีเซ็ตรหัสผ่านสำหรับ <span className="font-semibold text-foreground">{resetUser.firstName} {resetUser.lastName}</span>
            </p>
          )}
          <div className="space-y-1.5">
            <Label>รหัสผ่านใหม่</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="รหัสผ่านใหม่"
              data-testid="reset-password-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUser(null)}>ยกเลิก</Button>
            <Button
              data-testid="reset-submit"
              disabled={resetMutation.isPending || newPassword.length < 6}
              onClick={() => resetUser && resetMutation.mutate({ id: resetUser.id, data: { newPassword } })}
            >
              {resetMutation.isPending ? "กำลังรีเซ็ต..." : "รีเซ็ตรหัสผ่าน"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteUser} onOpenChange={open => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบสมาชิก</AlertDialogTitle>
            <AlertDialogDescription>
              คุณต้องการลบ <span className="font-semibold">{deleteUser?.firstName} {deleteUser?.lastName}</span> ออกจากระบบ?<br />
              การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUser && deleteMutation.mutate({ id: deleteUser.id })}
            >
              {deleteMutation.isPending ? "กำลังลบ..." : "ลบสมาชิก"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
