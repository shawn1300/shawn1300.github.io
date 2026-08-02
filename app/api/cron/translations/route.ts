import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { runTranslationSync } from "@/lib/i18n/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { success: false, code: "CRON_NOT_CONFIGURED" },
      { status: 503 }
    );
  }
  if (!authorized(request)) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    const result = await runTranslationSync("cron");
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
    console.error("Translation cron failed:", error);
    return NextResponse.json(
      { success: false, code: "TRANSLATION_SYNC_FAILED" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
