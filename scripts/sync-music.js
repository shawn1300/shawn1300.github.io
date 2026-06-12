/**
 * sync-music.js
 *
 * 扫描 public/music/ 下的所有 .mp3 文件，自动：
 *   1. 读取 ID3 标签获取标题和艺术家
 *   2. 提取嵌入式唱片封面（如果有）
 *   3. 更新 components/music/tracks.ts
 *
 * 保留已有曲目的手动排序和编辑 —— 新歌追加到末尾。
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

// ── Parse existing tracks.ts ──

function parseExistingTracks() {
  if (!fs.existsSync(TRACKS_OUTPUT)) return [];

  const content = fs.readFileSync(TRACKS_OUTPUT, "utf-8");

  // Extract the array portion between [ and ];
  const match = content.match(/export const TRACKS[^=]*=\s*\[([\s\S]*)\];/);
  if (!match) return [];

  const tracks = [];
  const entries = match[1].split("},");
  for (const entry of entries) {
    if (!entry.trim()) continue;

    const idMatch = entry.match(/id:\s*"([^"]*)"/);
    const titleMatch = entry.match(/title:\s*"([^"]*)"/);
    const artistMatch = entry.match(/artist:\s*"([^"]*)"/);
    const srcMatch = entry.match(/src:\s*"([^"]*)"/);
    const coverMatch = entry.match(/coverUrl:\s*"([^"]*)"/);

    if (srcMatch) {
      tracks.push({
        id: idMatch ? idMatch[1] : "",
        title: titleMatch ? titleMatch[1] : "",
        artist: artistMatch ? artistMatch[1] : "",
        src: srcMatch[1],
        coverUrl: coverMatch ? coverMatch[1] : undefined,
      });
    }
  }

  return tracks;
}

// ── Generate tracks.ts ──

function generateTracksFile(tracks) {
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
    lines.push(`    src: "${t.src}",`);
    if (t.coverUrl) {
      lines.push(`    coverUrl: "${t.coverUrl}",`);
    }
    lines.push(`  },`);
  }

  lines.push(`];`);
  lines.push("");

  fs.writeFileSync(TRACKS_OUTPUT, lines.join("\n"), "utf-8");
}

// ── Main ──

function main() {
  console.log("🎵 同步音乐文件...\n");

  if (!fs.existsSync(MUSIC_DIR)) {
    console.error(`❌ 音乐目录不存在: ${MUSIC_DIR}`);
    process.exit(1);
  }

  // Parse existing tracks (preserve order and manual edits)
  const existing = parseExistingTracks();
  const existingBySrc = new Map(existing.map((t) => [t.src, t]));

  // Scan current MP3 files
  const mp3Files = fs
    .readdirSync(MUSIC_DIR)
    .filter((f) => f.toLowerCase().endsWith(".mp3"))
    .sort();

  if (mp3Files.length === 0) {
    console.log("⚠️  没有找到 .mp3 文件");
    generateTracksFile([]);
    console.log("✅ 已生成空曲目列表");
    return;
  }

  // Detect removed tracks
  const currentSrcs = new Set(mp3Files.map((f) => `/music/${f}`));
  const removed = existing.filter((t) => !currentSrcs.has(t.src));
  for (const t of removed) {
    console.log(`  🗑️  已删除: ${path.basename(t.src)}`);
  }

  // Build merged track list: preserve existing, append new
  const merged = [];
  const seen = new Set();

  // Phase 1: existing tracks whose MP3s still exist
  for (const t of existing) {
    if (currentSrcs.has(t.src)) {
      merged.push(t);
      seen.add(t.src);
    }
  }

  // Phase 2: new MP3s not in existing tracks
  const newCount = { value: 0 };

  for (const file of mp3Files) {
    const src = `/music/${file}`;
    if (seen.has(src)) continue; // already in list

    const mp3Path = path.join(MUSIC_DIR, file);
    const basename = path.basename(file, ".mp3");
    const coverFile = `${basename}-cover.jpg`;
    const coverPath = path.join(MUSIC_DIR, coverFile);
    const id = toId(file);

    process.stdout.write(`  🆕 ${file} ... `);

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

    merged.push({
      id,
      title: meta.title,
      artist: meta.artist,
      src,
      coverUrl: meta.hasCover ? `/music/${coverFile}` : undefined,
    });
    newCount.value++;
  }

  // Write output
  generateTracksFile(merged);

  console.log(`\n✅ 曲目配置已更新: ${TRACKS_OUTPUT}`);
  console.log(`   保留 ${merged.length - newCount.value} 首 | 新增 ${newCount.value} 首 | 移除 ${removed.length} 首`);
}

main();
