#!/usr/bin/env node
import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load DATABASE_URL from .env.local
const envPath = path.join(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const databaseUrl = envContent
  .split("\n")
  .find((line) => line.startsWith("DATABASE_URL="))
  ?.split("=")[1]
  ?.trim()
  .replace(/^["']|["']$/g, "");

if (!databaseUrl) {
  console.error("❌ DATABASE_URL not found in .env.local");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function runMigration() {
  const migrationPath = path.join(__dirname, "../migrations/002_add_getfrontspot_schema.sql");
  const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

  // Split by semicolon and filter empty statements
  const statements = migrationSQL
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    try {
      console.log(`Executing: ${statement.substring(0, 60)}...`);
      await sql(statement);
      console.log("✓ Done");
    } catch (error) {
      console.error(`✗ Error:`, error.message);
      if (error.message.includes("already exists")) {
        console.log("  (Already exists, continuing...)");
      }
    }
  }

  console.log("\n✓ Migration complete!");
}

runMigration().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
