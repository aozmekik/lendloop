import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifySignedBody } from "./lib/hmac";
import { Webhook } from "svix";

const http = httpRouter();

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * Clerk webhook: keeps Convex user rows in sync with Clerk. Verified with
 * the svix signing secret so forged calls cannot create or alter users.
 * Mount this URL in the Clerk dashboard: https://<deployment>.convex.site/clerk-webhook
 */
http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) return json(500, { error: "Webhook not configured" });
    const payload = await request.text();
    const headers = {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    };
    let event: { type: string; data: Record<string, any> };
    try {
      event = new Webhook(secret).verify(payload, headers) as unknown as typeof event;
    } catch {
      return json(400, { error: "Invalid signature" });
    }
    if (event.type === "user.created" || event.type === "user.updated") {
      const d = event.data;
      const email =
        d.email_addresses?.find(
          (e: any) => e.id === d.primary_email_address_id,
        )?.email_address ??
        d.email_addresses?.[0]?.email_address ??
        "";
      const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN;
      await ctx.runMutation(internal.users.upsertFromClerk, {
        // Convex identities use "<issuer>|<subject>".
        tokenIdentifier: `${issuer}|${d.id}`,
        email,
        name: [d.first_name, d.last_name].filter(Boolean).join(" ") || email,
      });
    }
    return json(200, { ok: true });
  }),
});

/**
 * n8n -> Convex: fetch overdue loans. HMAC-signed envelope with timestamp;
 * unsigned, stale, or malformed calls are rejected.
 */
http.route({
  path: "/n8n/overdue-loans",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (!secret) return json(500, { error: "Integration not configured" });
    const data = await verifySignedBody(secret, await request.text());
    if (!data) return json(401, { error: "Invalid or stale signature" });
    const overdue = await ctx.runQuery(internal.loans.overdueLoans, {});
    return json(200, { overdue });
  }),
});

/**
 * n8n -> Convex: idempotent reminder write-back. Retries with the same
 * (loanId, date) are acknowledged without creating duplicates.
 */
http.route({
  path: "/n8n/record-reminder",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (!secret) return json(500, { error: "Integration not configured" });
    const data = await verifySignedBody(secret, await request.text());
    if (!data) return json(401, { error: "Invalid or stale signature" });
    const { loanId, date } = data as { loanId?: string; date?: string };
    if (!loanId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json(400, { error: "loanId and date (YYYY-MM-DD) required" });
    }
    const result = await ctx.runMutation(internal.loans.recordReminder, {
      loanId: loanId as any,
      date,
    });
    return json(200, result);
  }),
});

export default http;
