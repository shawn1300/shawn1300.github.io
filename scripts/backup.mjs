// Supabase 数据备份脚本
// 用法: node scripts/backup.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// 读 .env.local
const env = readFileSync(".env.local", "utf-8");
const getEnv = (key) => {
  const m = env.match(new RegExp(`${key}=(.+)`));
  return m ? m[1].trim() : "";
};

const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  console.error("请在 .env.local 中配置 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const tables = ["posts", "diaries", "categories", "tags", "comments"];

// 创建 backup 目录
const backupDir = join("..", "backup");
if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

const now = new Date().toISOString().slice(0, 10);

for (const table of tables) {
  const { data, error } = await supabase.from(table).select("*").limit(50000);
  if (error) {
    console.error(`❌ ${table}: ${error.message}`);
    continue;
  }

  // SQL INSERT 格式
  if (data.length === 0) {
    console.log(`⚠ ${table}: 0 rows`);
    continue;
  }

  const cols = Object.keys(data[0]);
  const values = data.map((row) => {
    const vals = cols.map((col) => {
      const v = row[col];
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
      if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
      return JSON.stringify(v);
    });
    return `(${vals.join(", ")})`;
  });

  const sql = `-- ${table} (${data.length} rows)\nINSERT INTO ${table} (${cols.join(", ")})\nVALUES\n${values.join(",\n")};\n`;
  const file = join(backupDir, `${table}_${now}.sql`);
  writeFileSync(file, sql, "utf-8");
  console.log(`✅ ${table}: ${data.length} rows → ${file}`);
}

console.log("\n备份完成！");
