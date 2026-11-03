import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { signedBody } from "./lib/hmac";

/**
 * Minimal projection of a loan for notifications. The recipient is the
 * lender for new requests, and the borrower for status changes.
 */
export const getLoanForNotification = internalQuery({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const loan = await ctx.db.get(args.loanId);
    if (!loan) return null;
    const tool = await ctx.db.get(loan.toolId);
    const borrower = await ctx.db.get(loan.borrowerId);
    const lender = await ctx.db.get(loan.lenderId);
    const recipient = loan.status === "pending" ? lender : borrower;
    const counterpart = loan.status === "pending" ? borrower : lender;
    return {
      status: loan.status,
      startDate: loan.startDate,
      endDate: loan.endDate,
      toolName: tool?.name ?? "(removed)",
      recipientEmail: recipient?.email ?? "",
      recipientName: recipient?.name ?? "Neighbor",
      counterpartName: counterpart?.name ?? "Neighbor",
    };
  },
});

const MAX_ATTEMPTS = 3;

/**
 * Sends a minimal, signed payload to the n8n webhook when a borrow request
 * is created or changes status. Retries with backoff; on final failure the
 * event is recorded on the loan so it is visible in the app instead of
 * failing silently.
 */
export const notify = internalAction({
  args: {
    loanId: v.id("loans"),
    event: v.union(v.literal("request_created"), v.literal("status_changed")),
  },
  handler: async (ctx, args) => {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (!webhookUrl || !secret) {
      await ctx.runMutation(internal.loans.recordNotificationFailure, {
        loanId: args.loanId,
        message: "n8n webhook is not configured (N8N_WEBHOOK_URL / N8N_WEBHOOK_SECRET)",
      });
      return;
    }

    // Assemble the smallest payload n8n needs to notify the right person.
    const loan = await ctx.runQuery(internal.n8n.getLoanForNotification, {
      loanId: args.loanId,
    });
    if (!loan) return;

    const body = await signedBody(secret, {
      event: args.event,
      loanId: args.loanId,
      status: loan.status,
      toolName: loan.toolName,
      startDate: loan.startDate,
      endDate: loan.endDate,
      recipientEmail: loan.recipientEmail,
      recipientName: loan.recipientName,
      counterpartName: loan.counterpartName,
    });

    let lastError = "unknown";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        if (res.ok) return;
        lastError = `n8n responded ${res.status}`;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
    await ctx.runMutation(internal.loans.recordNotificationFailure, {
      loanId: args.loanId,
      message: `Notification failed after ${MAX_ATTEMPTS} attempts: ${lastError}`,
    });
  },
});
