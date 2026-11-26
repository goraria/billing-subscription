import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "@/utils/environment";
if (!databaseUrl) throw new Error("cloud_database_not_configured");
const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 15000 });
let client: PoolClient;
beforeAll(async () => { client = await pool.connect(); await client.query("BEGIN"); await client.query("SET LOCAL statement_timeout='15s'"); });
beforeEach(async () => { await client.query("SAVEPOINT fixture"); });
afterEach(async () => { if (client) { await client.query("ROLLBACK TO SAVEPOINT fixture"); await client.query("RELEASE SAVEPOINT fixture"); } });
afterAll(async () => { if (client) { await client.query("ROLLBACK"); client.release(); } await pool.end(); });

async function billingFixture() {
  const user=crypto.randomUUID(),subscription=crypto.randomUUID();
  await client.query("INSERT INTO users(id,external_user_id,email) VALUES($1,$2,$3)",[user,"cloud-readiness-"+user,user+"@fixture.invalid"]);
  await client.query("INSERT INTO subscriptions(id,user_id,application) VALUES($1,$2,'marketplace')",[subscription,user]);
  return {user,subscription};
}
it("enforces one invoice per subscription and billing period", async()=>{
  const {user,subscription}=await billingFixture();
  const insert="INSERT INTO invoices(user_id,subscription_id,currency,period_start,period_end) VALUES($1,$2,'VND','2026-01-01','2026-02-01')";
  await client.query(insert,[user,subscription]);
  await expect(client.query(insert,[user,subscription])).rejects.toMatchObject({code:"23505"});
});
it("accepts the next period without reusing the previous invoice", async()=>{
  const {user,subscription}=await billingFixture();
  await client.query("INSERT INTO invoices(user_id,subscription_id,currency,period_start,period_end) VALUES($1,$2,'VND','2026-01-01','2026-02-01'),($1,$2,'VND','2026-02-01','2026-03-01')",[user,subscription]);
  const {rows}=await client.query("SELECT count(*)::int AS count FROM invoices WHERE subscription_id=$1",[subscription]);
  expect(rows[0].count).toBe(2);
});
it("rejects a negative invoice amount at the database boundary", async()=>{
  const {user,subscription}=await billingFixture();
  await expect(client.query("INSERT INTO invoices(user_id,subscription_id,currency,total) VALUES($1,$2,'VND',-1)",[user,subscription])).rejects.toMatchObject({code:"23514"});
});
