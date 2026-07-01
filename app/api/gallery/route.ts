import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const REPO = "shawn1300/shawn1300.github.io";
const BRANCH = "main";
const GALLERY_PATH = "public/gallery";
const API_BASE = "https://api.github.com";

const IMG_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "svg"];

interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  download_url: string;
}

function ghHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/**
 * GET /api/gallery
 * 列出 public/gallery/ 下的所有图片
 */
export async function GET() {
  if (!GITHUB_TOKEN) {
    return NextResponse.json(
      { success: false, error: "未配置 GITHUB_TOKEN" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `${API_BASE}/repos/${REPO}/contents/${GALLERY_PATH}?ref=${BRANCH}`,
      { headers: ghHeaders(), next: { revalidate: 60 } }
    );

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ success: true, data: [] });
      }
      throw new Error(`GitHub API: ${res.status}`);
    }

    const files: GitHubFile[] = await res.json();
    const images = files
      .filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase();
        return ext && IMG_EXTS.includes(ext);
      })
      .map((f) => ({
        name: f.name,
        url: `/gallery/${f.name}`,
        sha: f.sha,
      }));

    return NextResponse.json({ success: true, data: images });
  } catch (error) {
    console.error("GET /api/gallery error:", error);
    return NextResponse.json(
      { success: false, error: "获取图片列表失败" },
      { status: 500 }
    );
  }
}

/**
 * 获取文件 SHA（用于更新或删除）
 */
async function getFileSha(fileName: string): Promise<string | null> {
  const res = await fetch(
    `${API_BASE}/repos/${REPO}/contents/${GALLERY_PATH}/${fileName}?ref=${BRANCH}`,
    { headers: ghHeaders() }
  );
  if (!res.ok) return null;
  const file: GitHubFile = await res.json();
  return file.sha;
}

/**
 * POST /api/gallery
 * 上传图片到 public/gallery/（通过 GitHub API）
 */
export async function POST(request: NextRequest) {
  if (!GITHUB_TOKEN) {
    return NextResponse.json(
      { success: false, error: "未配置 GITHUB_TOKEN" },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "请选择文件" },
        { status: 400 }
      );
    }

    // 生成文件名
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;

    // 文件转 base64
    const buffer = Buffer.from(await file.arrayBuffer());
    const content = buffer.toString("base64");

    // 上传到 GitHub
    const uploadRes = await fetch(
      `${API_BASE}/repos/${REPO}/contents/${GALLERY_PATH}/${fileName}`,
      {
        method: "PUT",
        headers: ghHeaders(),
        body: JSON.stringify({
          message: `📷 上传相册图片: ${fileName}`,
          content,
          branch: BRANCH,
        }),
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.json();
      throw new Error(err.message || `GitHub API: ${uploadRes.status}`);
    }

    return NextResponse.json({
      success: true,
      data: { name: fileName, url: `/gallery/${fileName}` },
    });
  } catch (error: unknown) {
    console.error("POST /api/gallery error:", error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, "上传失败") },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/gallery?name=xxx
 * 从 public/gallery/ 删除图片
 */
export async function DELETE(request: NextRequest) {
  if (!GITHUB_TOKEN) {
    return NextResponse.json(
      { success: false, error: "未配置 GITHUB_TOKEN" },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");

    if (!name) {
      return NextResponse.json(
        { success: false, error: "缺少文件名" },
        { status: 400 }
      );
    }

    const sha = await getFileSha(name);
    if (!sha) {
      return NextResponse.json(
        { success: false, error: "文件不存在" },
        { status: 404 }
      );
    }

    const deleteRes = await fetch(
      `${API_BASE}/repos/${REPO}/contents/${GALLERY_PATH}/${name}`,
      {
        method: "DELETE",
        headers: ghHeaders(),
        body: JSON.stringify({
          message: `🗑️ 删除相册图片: ${name}`,
          sha,
          branch: BRANCH,
        }),
      }
    );

    if (!deleteRes.ok) {
      const err = await deleteRes.json();
      throw new Error(err.message || `GitHub API: ${deleteRes.status}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("DELETE /api/gallery error:", error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, "删除失败") },
      { status: 500 }
    );
  }
}
