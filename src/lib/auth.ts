import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Membership } from "@/types/database";

export async function getCurrentMembership(): Promise<Membership | null> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return null;
  }

  await supabase.rpc("claim_bootstrap_admin");

  const { data, error } = await supabase.rpc("get_my_membership");

  if (error || !data?.[0]) {
    return null;
  }

  const row = data[0];

  return {
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    organization_icon: row.organization_icon,
    role: row.role === "admin" ? "admin" : "staff",
    user_email: row.user_email,
    full_name: row.full_name,
  };
}

export async function requireMembership() {
  const membership = await getCurrentMembership();

  if (!membership) {
    redirect("/login");
  }

  return membership;
}
