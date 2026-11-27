import { burnFailure, burnJson } from "@/lib/burn/http";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return burnJson({ code: "UNCONFIGURED" }, 503);
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return burnJson({ code: "UNAUTHORIZED" }, 401);
  }

  try {
    const { error } = await createAdminSupabase().rpc("purge_expired_burn_messages").retry(false);
    if (error) return burnFailure("cleanup", error);

    return burnJson({ ok: true });
  } catch (error) {
    return burnFailure("cleanup", error);
  }
}
