import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm"
import { database } from "@/database"
import { entitlementsTable } from "@/database/schema"
import { type AuthContext } from "@/types/auth"

export async function rawListEntitlements(application: string | undefined, auth: AuthContext) {
  const now = new Date()
  const filters = [
    eq(entitlementsTable.userId, auth.user.id),
    eq(entitlementsTable.status, "active"),
    lte(entitlementsTable.startsAt, now),
    or(isNull(entitlementsTable.expiresAt), gt(entitlementsTable.expiresAt, now))!,
  ]
  if (application) filters.push(eq(entitlementsTable.application, application))
  return database.select().from(entitlementsTable).where(and(...filters)).orderBy(desc(entitlementsTable.createdAt))
}
