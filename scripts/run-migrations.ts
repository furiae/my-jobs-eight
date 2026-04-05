import { Client } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { join } from "path";

(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const migrations = [
    "supabase/migrations/0001_init.sql",
    "supabase/migrations/0002_applications.sql",
    "supabase/migrations/0003_cover_letter.sql",
    "supabase/migrations/0002_add_applied_at.sql",
  ];

  for (const migrationFile of migrations) {
    try {
      const filePath = join(process.cwd(), migrationFile);
      const migrationSql = readFileSync(filePath, "utf-8");
      
      console.log(`Applying migration: ${migrationFile}`);
      await client.query(migrationSql);
      console.log(`✓ ${migrationFile}`);
    } catch (error) {
      console.error(`✗ ${migrationFile}:`, (error as any).message);
    }
  }

  await client.end();
  console.log("All migrations applied");
})();
