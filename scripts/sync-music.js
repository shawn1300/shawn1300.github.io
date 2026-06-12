/**
 * sync-music.js
 *
 * 扫描 public/music/ 下的所有 .mp3 文件，自动：
 *   1. 读取 ID3 标签获取标题和艺术家
 *   2. 提取嵌入式唱片封面（如果有）
 *   3. 生成 components/music/tracks.ts
 *
 * 用法：node scripts/sync-music.js
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const MUSIC_DIR = path.resolve(__dirname, "..", "public", "music");
const TRACKS_OUTPUT = path.resolve(__dirname, "..", "components", "music", "tracks.ts");

// ── Helpers ──

/** Generate a safe ID from filename */
function toId(filename) {
  return path
    .basename(filename, ".mp3")
    .replace(/[^a-zA-Z0-9一-鿿぀-ゟ゠-ヿ]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/** Read metadata from MP3 using ffprobe */
function readMetadata(mp3Path) {
  try {
    const json = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${mp3Path}"`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );
    const data = JSON.parse(json);
    const tags = data.format?.tags || {};

    return {
      title: tags.title || path.basename(mp3Path, ".mp3"),
      artist: tags.artist || "未知艺术家",
      hasCover: (data.streams || []).some(
        (s) => s.codec_name === "mjpeg" && s.disposition?.attached_pic === 1
      ),
    };
  } catch {
    return {
      title: path.basename(mp3Path, ".mp3"),
      artist: "未知艺术家",
      hasCover: false,
    };
  }
}

/** Extract cover art using ffmpeg */
function extractCover(mp3Path, coverPath) {
  try {
    execSync(
      `ffmpeg -y -i "${mp3Path}" -an -vcodec copy -update 1 "${coverPath}"`,
      { stdio: "pipe", maxBuffer: 10 * 1024 * 1024 }
    );
    return fs.existsSync(coverPath);
  } catch {
    return false;
  }
}

// ── Main ──

function main() {
  console.log("🎵 同步音乐文件...\n");

  if (!fs.existsSync(MUSIC_DIR)) {
    console.error(`❌ 音乐目录不存在: ${MUSIC_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(MUSIC_DIR)
    .filter((f) => f.toLowerCase().endsWith(".mp3"))
    .sort();

  if (files.length === 0) {
    console.log("⚠️  没有找到 .mp3 文件");
    const tracks = `// 自动生成 — 运行 node scripts/sync-music.js 重新生成
export const TRACKS: Track[] = [];
`;
    fs.writeFileSync(TRACKS_OUTPUT, tracks, "utf-8");
    console.log(`✅ 已生成空曲目列表: ${TRACKS_OUTPUT}`);
    return;
  }

  const tracks = [];

  for (const file of files) {
    const mp3Path = path.join(MUSIC_DIR, file);
    const basename = path.basename(file, ".mp3");
    const coverFile = `${basename}-cover.jpg`;
    const coverPath = path.join(MUSIC_DIR, coverFile);
    const id = toId(file);

    process.stdout.write(`  📀 ${file} ... `);

    const meta = readMetadata(mp3Path);
    console.log(`"${meta.title}" — ${meta.artist}`);

    // Extract cover if available and not already extracted
    if (meta.hasCover && !fs.existsSync(coverPath)) {
      const ok = extractCover(mp3Path, coverPath);
      if (ok) {
        console.log(`     🖼️  封面已提取: ${coverFile}`);
      } else {
        console.log(`     ⚠️  封面提取失败`);
      }
    } else if (meta.hasCover) {
      console.log(`     🖼️  封面已存在: ${coverFile}`);
    } else {
      console.log(`     ℹ️  无嵌入式封面`);
    }

    const coverField = meta.hasCover
      ? `\n    coverUrl: "/music/${coverFile}",`
      : "";

    tracks.push({
      id,
      title: meta.title,
      artist: meta.artist,
      src: `/music/${file}`,
      hasCover: meta.hasCover,
      coverField,
    });
  }

  // ── Generate tracks.ts ──

  const lines = [
    `// 自动生成于 ${new Date().toISOString().split("T")[0]} — 运行 node scripts/sync-music.js 重新生成`,
    `// 如需调整曲目顺序，直接编辑下方数组即可`,
    ``,
    `import type { Track } from "./music-context";`,
    ``,
    `export const TRACKS: Track[] = [`,
  ];

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const escapedTitle = t.title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const escapedArtist = t.artist.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    lines.push(`  {`);
    lines.push(`    id: "${t.id}",`);
    lines.push(`    title: "${escapedTitle}",`);
    lines.push(`    artist: "${escapedArtist}",`);
    lines.push(`    src: "/music/${t.src.split("/").pop()}",`);
    if (t.hasCover) {
      lines.push(`    coverUrl: "/music/${t.src.split("/").pop()?.replace(".mp3", "")}-cover.jpg",`);
    }
    lines.push(`  },`);
  }

  lines.push(`];`);
  lines.push("");

  fs.writeFileSync(TRACKS_OUTPUT, lines.join("\n"), "utf-8");

  console.log(`\n✅ 已生成曲目配置: ${TRACKS_OUTPUT}`);
  console.log(`   共 ${tracks.length} 首曲目`);
  console.log(`   封面图片位于: public/music/`);
}

main();
