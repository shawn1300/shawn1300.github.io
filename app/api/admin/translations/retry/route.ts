import { NextResponse } from "next/server";

import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const targets = {
  post: { table: "post_translations", idColumn: "post_id" },
  diary: { table: "diary_translations", idColumn: "diary_id" },
  category: { table: "category_translations", idColumn: "category_id" },
  tag: { table: "tag_translations", idColumn: "tag_id" },
} as const;

export async function POST(request: Request) {
  const authClient = await createServerSupabase();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        all?: boolean;
        type?: keyof typeof targets;
        sourceId?: string;
        locale?: "en" | "ja";
      }
    | null;
  const supabase = createAdminSupabase();

  if (body?.all) {
    const results = await Promise.all(
      Object.values(targets).map(({ table }) =>
        supabase
          .from(table)
          .update({ status: "pending", retry_count: 0, last_error: null })
          .eq("status", "failed")
      )
    );
    const error = results.find((result) => result.error)?.error;
    if (error) {
      console.error("Reset failed translations error:", error);
      return NextResponse.json(
        { success: false, code: "TRANSLATION_RETRY_FAILED" },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  }

  if (
    !body?.type ||
    !body.sourceId ||
    (body.locale !== "en" && body.locale !== "ja") ||
    !targets[body.type]
  ) {
    return NextResponse.json(
      { success: false, code: "INVALID_RETRY_TARGET" },
      { status: 400 }
    );
  }

  const target = targets[body.type];
  const { error } = await supabase
    .from(target.table)
    .update({ status: "pending", retry_count: 0, last_error: null })
    .eq(target.idColumn, body.sourceId)
    .eq("locale", body.locale)
    .eq("status", "failed");
  if (error) {
    console.error("Reset translation error:", error);
    return NextResponse.json(
      { success: false, code: "TRANSLATION_RETRY_FAILED" },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true });
}
