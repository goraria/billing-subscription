import { createDatabasePoolFactory } from "@gorth-com/structure/modules/database"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "@/database/schema"
import { databaseUrl, pgPoolMax } from "@/utils/environment"

const defaultPoolMax = 5
const configuredPoolMax = Number.parseInt(pgPoolMax ?? "", 10)

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required")
}

const globalForDatabase = globalThis as typeof globalThis & {
  billingSubscriptionPool?: Pool
}

const pool =
  globalForDatabase.billingSubscriptionPool ??
  createDatabasePoolFactory((options) => new Pool(options))({
    connectionString: databaseUrl,
    max: Number.isNaN(configuredPoolMax) ? defaultPoolMax : configuredPoolMax,
  })

if (!globalForDatabase.billingSubscriptionPool) {
  attachDatabasePool(pool)
  pool.on("error", (error: unknown) => {
    console.error("[billing-subscription-pg-pool-error]", error)
  })
  globalForDatabase.billingSubscriptionPool = pool
}

export const database = drizzle({ client: pool })
export { pool, schema }
export default database
import { attachDatabasePool } from "@vercel/functions"
