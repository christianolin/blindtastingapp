import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database, UserRole } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

// A profile's role, or null when the profile is missing.
export async function getRole(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<UserRole | null> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return (data?.role as UserRole | undefined) ?? null;
}

export async function isAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  return (await getRole(supabase, userId)) === "ADMIN";
}

// Contributors and admins share curator powers (knowledge + archetype editing).
export async function isContributor(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const role = await getRole(supabase, userId);
  return role === "ADMIN" || role === "CONTRIBUTOR";
}

type Gate = { supabase: SupabaseClient<Database>; user: User; role: UserRole };

// Gate an ADMIN-only page/layout (user configuration).
export async function requireAdmin(): Promise<Gate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const role = await getRole(supabase, user.id);
  if (role !== "ADMIN") redirect("/dashboard");
  return { supabase, user, role };
}

// Gate a CONTRIBUTOR-or-ADMIN page/layout (the admin section's editing tools).
export async function requireContributor(): Promise<Gate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const role = await getRole(supabase, user.id);
  if (role !== "ADMIN" && role !== "CONTRIBUTOR") redirect("/dashboard");
  return { supabase, user, role };
}
