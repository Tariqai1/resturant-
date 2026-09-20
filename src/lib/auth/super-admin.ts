import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

// Hardcoded platform owner emails as high-priority fallback
const DEFAULT_SUPER_ADMIN_EMAILS = [
  "tariqfsd9@gmail.com",
  "tarique@gmai.com",
  "tarique@gmail.com",
];

export function getSuperAdminEmails(): string[] {
  const envEmails = process.env.SUPER_ADMIN_EMAILS
    ? process.env.SUPER_ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase())
    : [];
  return Array.from(new Set([...DEFAULT_SUPER_ADMIN_EMAILS, ...envEmails]));
}

export async function isSuperAdminUser(user: User | null): Promise<boolean> {
  if (!user || !user.email) return false;

  const email = user.email.trim().toLowerCase();
  const allowedEmails = getSuperAdminEmails();

  if (allowedEmails.includes(email)) {
    return true;
  }

  // Also check database super_admins table
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("super_admins")
      .select("id")
      .or(`email.eq.${email},auth_user_id.eq.${user.id}`)
      .maybeSingle();

    return !!data;
  } catch {
    return false;
  }
}

export async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authorized: false, user: null, reason: "Authentication required" };
  }

  const isSuper = await isSuperAdminUser(user);
  if (!isSuper) {
    return { authorized: false, user, reason: "Super admin privileges required" };
  }

  return { authorized: true, user };
}
