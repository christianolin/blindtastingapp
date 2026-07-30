"use client";

import { useState, useTransition } from "react";
import type { UserRole } from "@/lib/supabase/database.types";
import { setUserRole } from "./actions";

export type UserRow = {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
};

const ROLES: UserRole[] = ["MEMBER", "CONTRIBUTOR", "ADMIN"];
const ROLE_LABEL: Record<UserRole, string> = {
  MEMBER: "Member",
  CONTRIBUTOR: "Contributor",
  ADMIN: "Admin",
};

export function UsersEditor({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const [rows, setRows] = useState(users);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const change = (id: string, role: UserRole) => {
    setError(null);
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, role } : r)));
    startTransition(async () => {
      const res = await setUserRole(id, role);
      if ("error" in res) {
        setRows(prev);
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="overflow-hidden rounded-lg border border-border">
        {rows.map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">
                {u.displayName || u.email}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {u.email}
              </div>
            </div>
            <select
              value={u.role}
              disabled={pending || u.id === currentUserId}
              onChange={(e) => change(u.id, e.target.value as UserRole)}
              title={
                u.id === currentUserId
                  ? "You can't change your own role"
                  : undefined
              }
              className="rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-60"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
