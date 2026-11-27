import { PrismaClient } from "@generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { serverEnv } from "../env/serverEnv";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

/**
 * Node `pg` treats `sslmode=require` as verify-full unless `uselibpqcompat=true`
 * is in the URL (needed for Supabase). Keep rejectUnauthorized false as a
 * fallback when the URL still carries a strict sslmode without that flag.
 */
const pool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString: serverEnv.DATABASE_URL,
    ssl: serverEnv.DATABASE_URL.includes("uselibpqcompat=true") ?
      undefined
    : { rejectUnauthorized: false },
  });

const adapter = new PrismaPg(pool);

const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}

export default prisma;
