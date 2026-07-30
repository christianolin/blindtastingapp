import Link from "next/link";
import { requireAdmin } from "@/lib/auth/roles";
import { UsersEditor, type UserRow } from "./users-editor";

export const metadata = { title: "Users · Admin · Blindr" };

export default async function AdminUsersPage() {
  const { supabase, user } = await requireAdmin();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, email, role")
    .order("display_name");
  const users: UserRow[] = (data ?? []).map((u) => ({
    id: u.id,
    displayName: u.display_name,
    email: u.email,
    role: u.role,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Admin
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          Users
        </h1>
        <p className="mt-2 text-muted-foreground">
          Members are standard users. Contributors can edit knowledge content and
          typical-wine placements. Admins can additionally manage roles.
        </p>
      </div>
      <UsersEditor users={users} currentUserId={user.id} />
    </div>
  );
}
