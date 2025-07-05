import { Kysely } from "kysely";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import type { Database } from "./types";

// For development, use local SQLite file directly
const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';

let dialectConfig;

if (isDev) {
  // Use local SQLite file for development
  dialectConfig = {
    url: "file:./db/db.sqlite",
  };
} else {
  // Use Turso for production
  if (!import.meta.env.TURSO_DATABASE_URL) {
    throw new Error("TURSO_DATABASE_URL environment variable is required")
  }
  
  if (!import.meta.env.TURSO_AUTH_TOKEN) {
    throw new Error("TURSO_AUTH_TOKEN environment variable is required")
  }
  
  dialectConfig = {
    url: import.meta.env.TURSO_DATABASE_URL,
    authToken: import.meta.env.TURSO_AUTH_TOKEN,
  };
}

export const dialect = new LibsqlDialect(dialectConfig);

// Create a reusable Turso database client with proper typing
export const db = new Kysely<Database>({ dialect });

// Export the client type for type safety
export type DbClient = typeof db;
