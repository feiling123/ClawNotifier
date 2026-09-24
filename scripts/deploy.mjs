#!/usr/bin/env node
/**
 * Cloudflare WeChat Notifier 一键部署脚本
 *
 * 职责：
 *  1. 自动补齐 wrangler.toml 中缺失的配置（随机生成 ADMIN_PATH / ADMIN_TOKEN /
 *     BOT_STATE_ENC_KEY / WEBHOOK_SHARED_TOKEN，明文写入 [vars]）。
 *  2. 自动创建 D1 数据库（若尚不存在）。
 *  3. 自动执行 D1 迁移（无需再手动导入数据库）。
 *  4. 执行 wrangler deploy 并打印后台入口与凭证。
 */
import { execFileSync, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerPath = join(rootDir, "wrangler.toml");
const wranglerExamplePath = join(rootDir, "wrangler.toml.example");

const PLACEHOLDER_DATABASE_ID = "00000000-0000-0000-0000-000000000000";
const DATABASE_NAME = "claw-notifier";

const GENERATED_VARS = [
  { key: "ADMIN_PATH", value: () => randomBytes(8).toString("hex") },
  { key: "ADMIN_USERNAME", value: () => "whoami" },
  { key: "ADMIN_TOKEN", value: () => randomBytes(24).toString("hex") },
  { key: "WEBHOOK_SHARED_TOKEN", value: () => randomBytes(24).toString("hex") },
  { key: "BOT_STATE_ENC_KEY", value: () => randomBytes(32).toString("hex") }
];

const isMissing = (value) => !value || value.trim() === "" || value.includes("replace") || value.includes("REPLACE");

const run = (command, args, options = {}) => execFileSync(command, args, { stdio: "inherit", ...options });

const runJson = (command, args) => {
  const output = execSync(`${command} ${args.map((arg) => JSON.stringify(arg)).join(" ")}`, {
    encoding: "utf8",
    cwd: rootDir
  });

  const start = output.search(/[{\[]/);
  if (start < 0) {
    throw new Error(`无法解析命令输出为 JSON: ${command}`);
  }

  return JSON.parse(output.slice(start));
};

const ensureWranglerToml = () => {
  if (!existsSync(wranglerPath)) {
    if (!existsSync(wranglerExamplePath)) {
      throw new Error("未找到 wrangler.toml 或 wrangler.toml.example，请先创建项目配置文件。");
    }

    copyFileSync(wranglerExamplePath, wranglerPath);
    console.log("[deploy] 已从 wrangler.toml.example 生成 wrangler.toml");
  }
};

const readToml = () => readFileSync(wranglerPath, "utf8");

const ensureVar = (toml, key, value) => {
  const linePattern = new RegExp(`^\\s*${key}\\s*=`, "m");
  if (linePattern.test(toml)) {
    return toml.replace(
      new RegExp(`^(\\s*${key}\\s*=\\s*)([^\\n]*)`, "m"),
      (_match, prefix) => `${prefix}"${value}"`
    );
  }

  // 没有该变量时插入到 [vars] 段末尾。
  const varsMatch = toml.match(/^\[vars\]\s*$/m);
  if (!varsMatch) {
    throw new Error("wrangler.toml 缺少 [vars] 段，无法写入变量。");
  }

  const varsStart = varsMatch.index;
  const insertIndex = toml.indexOf("\n", varsStart) + 1;
  return `${toml.slice(0, insertIndex)}${key} = "${value}"\n${toml.slice(insertIndex)}`;
};

const ensureGeneratedVars = (toml) => {
  let result = toml;
  for (const { key, value } of GENERATED_VARS) {
    const existingMatch = result.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"));
    const existingValue = existingMatch ? existingMatch[1] : "";
    if (!isMissing(existingValue)) {
      continue;
    }

    result = ensureVar(result, key, value());
    console.log(`[deploy] 已生成 ${key}`);
  }

  return result;
};

const readDatabaseId = (toml) => {
  const match = toml.match(/^database_id\s*=\s*"([^"]*)"/m);
  return match ? match[1] : "";
};

const pickDatabaseId = (result) => {
  const inner = result?.result ?? result;
  return inner?.database_id ?? inner?.uuid ?? result?.database_id ?? result?.uuid ?? null;
};

const ensureDatabase = (toml) => {
  const databaseId = readDatabaseId(toml);
  if (databaseId && databaseId !== PLACEHOLDER_DATABASE_ID) {
    console.log(`[deploy] 使用已有 D1 数据库: ${databaseId}`);
    return toml;
  }

  console.log("[deploy] 正在创建 D1 数据库 ...");
  const result = runJson("npx wrangler", ["d1", "create", DATABASE_NAME, "--json"]);
  const createdId = pickDatabaseId(result);
  if (!createdId) {
    throw new Error("无法从 wrangler d1 create 输出中解析 database_id。");
  }

  const updated = toml.replace(
    /^(database_id\s*=\s*)"[^"]*"/m,
    (_match, prefix) => `${prefix}"${createdId}"`
  );

  console.log(`[deploy] 已创建 D1 数据库并写入 database_id: ${createdId}`);
  return updated;
};

const applyMigrations = () => {
  console.log("[deploy] 正在导入数据库结构（D1 迁移）...");
  run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--remote"]);
};

const deploy = () => {
  console.log("[deploy] 正在部署到 Cloudflare Workers ...");
  run("npx", ["wrangler", "deploy"]);
};

const printSummary = (toml) => {
  const getVar = (key) => (toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m")) ?? [])[1] ?? "";

  const adminPath = getVar("ADMIN_PATH");
  const adminUsername = getVar("ADMIN_USERNAME") || "whoami";
  const adminToken = getVar("ADMIN_TOKEN");
  const webhookToken = getVar("WEBHOOK_SHARED_TOKEN");

  const divider = "=".repeat(64);
  console.log(`\n${divider}`);
  console.log("部署完成。请妥善保存以下信息：");
  console.log(divider);
  console.log(`后台登录地址 : https://<your-worker>.workers.dev/${adminPath}/login`);
  console.log(`后台总览地址 : https://<your-worker>.workers.dev/${adminPath}/dashboard`);
  console.log(`用户名       : ${adminUsername}`);
  console.log(`密码(ADMIN_TOKEN) : ${adminToken}`);
  console.log(`Webhook Token : ${webhookToken}`);
  console.log(`Webhook 示例  : curl -X POST "https://<your-worker>.workers.dev/webhook/github" -H "Content-Type: application/json" -H "X-Webhook-Token: ${webhookToken}" -d '{"text":"hello"}'`);
  console.log(divider);
  console.log("以上明文变量已写入 wrangler.toml 的 [vars] 段，便于后续查找与调用。");
};

const main = () => {
  ensureWranglerToml();

  let toml = readToml();
  toml = ensureGeneratedVars(toml);
  toml = ensureDatabase(toml);
  writeFileSync(wranglerPath, toml);

  applyMigrations();
  deploy();
  printSummary(toml);
};

main();
