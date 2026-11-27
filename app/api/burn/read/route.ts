import { hashBurnToken } from "@/lib/burn/crypto";
import { burnFailure, burnJson, readBurnJson } from "@/lib/burn/http";
import { isBurnCredential, readBurnCiphertext } from "@/lib/burn/protocol";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { version, token } = await readBurnJson(request, 256);
    if (version !== 1 || !isBurnCredential(token)) {
      return burnJson({ code: "INVALID_REQUEST" }, 400);
    }

    const { data, error } = await createAdminSupabase()
      .rpc("claim_burn_message", { p_token_digest: await hashBurnToken(token) })
      .retry(false)
      .maybeSingle();

    if (error) return burnFailure("claim", error);
    if (data === null) return burnJson({ code: "UNAVAILABLE" }, 404);

    const message = readBurnCiphertext(data);
    if (!message) return burnFailure("claim", null);
    return burnJson({ ...message });
  } catch (error) {
    return burnFailure("claim", error);
  }
}
