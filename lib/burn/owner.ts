import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";

export async function getBurnOwnerAccess() {
  const ownerId = process.env.BURN_OWNER_USER_ID?.trim().toLowerCase();
  if (!ownerId) return "unconfigured";

  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return "signed-out";

  return user.id.toLowerCase() === ownerId ? "allowed" : "forbidden";
}
