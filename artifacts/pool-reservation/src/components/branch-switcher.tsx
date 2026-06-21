import { FC } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2 } from "lucide-react";

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
const ACTIVE_BRANCH_KEY = "aquarich_active_branch";

type Branch = { id: number; name: string; code: string | null; isMain: boolean; memberCount?: number };

/**
 * super_admin-only branch selector. Picking a branch stores it in localStorage;
 * the global fetch wrapper (main.tsx) then tags every /api request with
 * X-Branch-Id so the whole app re-scopes. "ทุกสาขา" clears the filter.
 */
export const BranchSwitcher: FC = () => {
  const { user } = useAuth();
  const token = localStorage.getItem("pool_token");

  const { data: branches } = useQuery<Branch[]>({
    queryKey: ["branches"],
    enabled: (user as any)?.role === "super_admin",
    queryFn: async () => {
      const r = await fetch(`${baseUrl}/api/branches`, { headers: { Authorization: `Bearer ${token}` } });
      return r.ok ? r.json() : [];
    },
  });

  if ((user as any)?.role !== "super_admin") return null;

  const active = localStorage.getItem(ACTIVE_BRANCH_KEY) || "all";
  const onChange = (v: string) => {
    if (v === "all") localStorage.removeItem(ACTIVE_BRANCH_KEY);
    else localStorage.setItem(ACTIVE_BRANCH_KEY, v);
    window.location.reload(); // re-fetch everything under the new branch scope
  };

  return (
    <Select value={active} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto gap-1.5 rounded-full border-primary/20 bg-primary/5 text-sm font-medium" title="เลือกสาขา">
        <Building2 className="w-4 h-4 text-primary" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">ทุกสาขา</SelectItem>
        {branches?.map((b) => (
          <SelectItem key={b.id} value={String(b.id)}>
            {b.name}{b.code ? ` (${b.code})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
