import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { runTranslationSync } from "@/lib/i18n/sync";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    const result = await runTranslationSync("admin");
    if (result.alreadyRunning) {
      return NextResponse.json(
        { success: false, code: "TRANSLATION_SYNC_ALREADY_RUNNING" },
        { status: 409 }
      );
    }
    if (result.changed) {
      for (const tag of ["posts", "diaries", "categories", "search"]) {
        revalidateTag(tag, "max");
      }
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Admin translation sync failed:", error);
    return NextResponse.json(
      { success: false, code: "TRANSLATION_SYNC_FAILED" },
      { status: 500 }
    );
  }
}
