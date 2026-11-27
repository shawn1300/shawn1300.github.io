import { burnFailure, burnJson, readBurnJson } from "@/lib/burn/http";
import { getBurnOwnerAccess } from "@/lib/burn/owner";
import { isBurnExpiry, readBurnCiphertext } from "@/lib/burn/protocol";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const access = await getBurnOwnerAccess();
    if (access === "unconfigured") return burnJson({ code: "UNCONFIGURED" }, 503);
    if (access === "signed-out") return burnJson({ code: "SIGN_IN_REQUIRED" }, 401);
    if (access === "forbidden") return burnJson({ code: "FORBIDDEN" }, 403);

    const body = await readBurnJson(request, 24 * 1024);
    const { version, tokenDigest, expiry } = body;
    const message = readBurnCiphertext(body);
    if (
      version !== 1 ||
      !message ||
      !isBurnExpiry(expiry) ||
      typeof tokenDigest !== "string" ||
      tokenDigest.length !== 64 ||
      !/^[0-9a-f]{64}$/.test(tokenDigest)
    ) {
      return burnJson({ code: "INVALID_REQUEST" }, 400);
    }

    const { data, error } = await createAdminSupabase().rpc("create_burn_message", {
      p_token_digest: tokenDigest,
      p_ciphertext: message.ciphertext,
      p_iv: message.iv,
      p_expiry: expiry,
    }).retry(false);

    if (error || typeof data !== "string") return burnFailure("creation", error);
    return burnJson({ expiresAt: data }, 201);
  } catch (error) {
    return burnFailure("creation", error);
  }
}
