import { Pool } from "pg";
import fs from "fs";
import path from "path";

const SCHEMA_DIR = path.join(process.cwd(), "server", "schemas");
const DEFAULT_SCHEMA_FILE = path.join(SCHEMA_DIR, "claimsiq_correction_schema.json");
const LEGACY_CUSTOM_FILE = path.join(SCHEMA_DIR, "active_schema.json");

let pool: Pool | null = null;

function getPool(): Pool | null {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
  return pool;
}

export interface StoredSchema {
  id: string;
  name: string;
  title: string | null;
  version: string | null;
  schemaContent: any;
  isActive: boolean;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

async function ensureTable(): Promise<boolean> {
  const db = getPool();
  if (!db) return false;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS correction_schemas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL DEFAULT 'custom',
        title TEXT,
        version TEXT,
        schema_content JSONB NOT NULL,
        is_active BOOLEAN DEFAULT true,
        user_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    return true;
  } catch {
    return false;
  }
}

let tableReady = false;

async function ready(): Promise<boolean> {
  if (tableReady) return true;
  tableReady = await ensureTable();
  return tableReady;
}

export async function getActiveSchemaFromDB(): Promise<StoredSchema | null> {
  if (!(await ready())) return null;
  const db = getPool();
  if (!db) return null;

  try {
    const result = await db.query(
      `SELECT * FROM correction_schemas WHERE is_active = true ORDER BY updated_at DESC LIMIT 1`
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      version: row.version,
      schemaContent: row.schema_content,
      isActive: row.is_active,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

export async function saveSchemaToDBFn(
  schemaContent: any,
  userId?: string
): Promise<{ success: boolean; error?: string; id?: string }> {
  if (!schemaContent || typeof schemaContent !== "object") {
    return { success: false, error: "Schema must be a valid JSON object" };
  }
  if (!schemaContent.$schema && !schemaContent.type) {
    return { success: false, error: "Schema must be a valid JSON Schema (missing $schema or type)" };
  }

  if (!(await ready())) {
    return { success: false, error: "Database not available" };
  }

  const db = getPool();
  if (!db) return { success: false, error: "Database not available" };

  const isRealUser = userId && userId !== "system" && userId !== "anonymous";
  const title = schemaContent.title || "Custom Schema";
  const version = schemaContent.version || "unknown";

  try {
    await db.query(`UPDATE correction_schemas SET is_active = false WHERE is_active = true`);

    const result = await db.query(
      `INSERT INTO correction_schemas (name, title, version, schema_content, is_active, user_id)
       VALUES ($1, $2, $3, $4, true, $5)
       RETURNING id`,
      ["custom", title, version, JSON.stringify(schemaContent), isRealUser ? userId : null]
    );

    return { success: true, id: result.rows[0]?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to save schema" };
  }
}

export async function deleteActiveSchemaFromDB(): Promise<{ success: boolean; error?: string }> {
  if (!(await ready())) {
    return { success: false, error: "Database not available" };
  }

  const db = getPool();
  if (!db) return { success: false, error: "Database not available" };

  try {
    await db.query(`DELETE FROM correction_schemas WHERE is_active = true`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to delete schema" };
  }
}

export function getDefaultSchema(): any | null {
  try {
    if (fs.existsSync(DEFAULT_SCHEMA_FILE)) {
      return JSON.parse(fs.readFileSync(DEFAULT_SCHEMA_FILE, "utf-8"));
    }
  } catch {}
  return null;
}

export async function getActiveSchema(): Promise<any | null> {
  const dbSchema = await getActiveSchemaFromDB();
  if (dbSchema) return dbSchema.schemaContent;

  if (fs.existsSync(LEGACY_CUSTOM_FILE)) {
    try {
      const content = JSON.parse(fs.readFileSync(LEGACY_CUSTOM_FILE, "utf-8"));
      await saveSchemaToDBFn(content);
      try { fs.unlinkSync(LEGACY_CUSTOM_FILE); } catch {}
      return content;
    } catch {}
  }

  return getDefaultSchema();
}

export async function getSchemaInfo(): Promise<{
  version: string;
  title: string;
  schema: any;
  hasCustomSchema: boolean;
}> {
  const dbSchema = await getActiveSchemaFromDB();

  if (dbSchema) {
    return {
      version: dbSchema.version || "unknown",
      title: dbSchema.title || "Custom Schema",
      schema: dbSchema.schemaContent,
      hasCustomSchema: true,
    };
  }

  if (fs.existsSync(LEGACY_CUSTOM_FILE)) {
    try {
      const content = JSON.parse(fs.readFileSync(LEGACY_CUSTOM_FILE, "utf-8"));
      await saveSchemaToDBFn(content);
      try { fs.unlinkSync(LEGACY_CUSTOM_FILE); } catch {}
      return {
        version: content.version || "unknown",
        title: content.title || "Custom Schema",
        schema: content,
        hasCustomSchema: true,
      };
    } catch {}
  }

  const defaultSchema = getDefaultSchema();
  return {
    version: defaultSchema?.version || "unknown",
    title: defaultSchema?.title || "Unknown Schema",
    schema: defaultSchema,
    hasCustomSchema: false,
  };
}

export async function saveActiveSchema(
  schemaContent: any,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  const dbResult = await saveSchemaToDBFn(schemaContent, userId);
  if (dbResult.success) {
    if (fs.existsSync(LEGACY_CUSTOM_FILE)) {
      try { fs.unlinkSync(LEGACY_CUSTOM_FILE); } catch {}
    }
    return { success: true };
  }

  try {
    if (!schemaContent || typeof schemaContent !== "object") {
      return { success: false, error: "Schema must be a valid JSON object" };
    }
    if (!fs.existsSync(SCHEMA_DIR)) {
      fs.mkdirSync(SCHEMA_DIR, { recursive: true });
    }
    fs.writeFileSync(LEGACY_CUSTOM_FILE, JSON.stringify(schemaContent, null, 2));
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to save schema" };
  }
}

export async function deleteActiveSchema(): Promise<{ success: boolean; error?: string }> {
  const dbResult = await deleteActiveSchemaFromDB();

  if (fs.existsSync(LEGACY_CUSTOM_FILE)) {
    try { fs.unlinkSync(LEGACY_CUSTOM_FILE); } catch {}
  }

  return dbResult.success ? { success: true } : dbResult;
}
