import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { requireAdmin, requireUser } from "./lib/auth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function enrich(ctx: { db: any }, loan: any) {
  const tool = await ctx.db.get(loan.toolId);
  const borrower = await ctx.db.get(loan.borrowerId);
  const lender = await ctx.db.get(loan.lenderId);
  return {
    ...loan,
    toolName: tool?.name ?? "(removed)",
    toolCategory: tool?.category ?? "other",
    borrowerName: borrower?.name ?? "Unknown",
    lenderName: lender?.name ?? "Unknown",
  };
}

/** Requests I made to borrow other people's tools. */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .collect();
    return await Promise.all(loans.map((l) => enrich(ctx, l)));
  },
});

/** Requests other people made on my tools. */
export const incomingRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", user._id))
      .collect();
    return await Promise.all(loans.map((l) => enrich(ctx, l)));
  },
});

/** Admin-only: every loan in the system. */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").collect();
    return await Promise.all(loans.map((l) => enrich(ctx, l)));
  },
});

/** (Bonus) Recent automation activity for one loan, shown to its participants. */
export const activity = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new Error("Loan not found");
    if (
      loan.borrowerId !== user._id &&
      loan.lenderId !== user._id &&
      user.role !== "admin"
    ) {
      throw new Error("Not authorized");
    }
    const events = await ctx.db
      .query("automationEvents")
      .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
      .collect();
    return events.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  },
});

export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!DATE_RE.test(args.startDate) || !DATE_RE.test(args.endDate)) {
      throw new Error("Dates must be YYYY-MM-DD");
    }
    if (args.endDate < args.startDate) throw new Error("End date before start date");
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.isRemoved) throw new Error("Tool not found");
    if (tool.ownerId === user._id) throw new Error("You cannot borrow your own tool");

    // Disallow overlapping requests so availability stays truthful.
    const existing = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", args.toolId))
      .collect();
    const conflict = existing.some(
      (l) =>
        (l.status === "pending" || l.status === "approved") &&
        l.startDate <= args.endDate &&
        args.startDate <= l.endDate,
    );
    if (conflict) throw new Error("Tool already requested for this period");

    const now = Date.now();
    const loanId = await ctx.db.insert("loans", {
      toolId: args.toolId,
      borrowerId: user._id,
      lenderId: tool.ownerId,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "pending",
      reminderCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("automationEvents", {
      loanId,
      type: "request_created",
      message: `${user.name} requested "${tool.name}"`,
      createdAt: now,
    });
    // Fire-and-forget notification via n8n; failures are logged, never thrown.
    await ctx.scheduler.runAfter(0, internal.n8n.notify, {
      loanId,
      event: "request_created",
    });
    return loanId;
  },
});

async function changeStatus(
  ctx: any,
  loanId: Id<"loans">,
  allowedFrom: string[],
  to: "approved" | "declined" | "returned" | "cancelled",
) {
  const loan = await ctx.db.get(loanId);
  if (!loan) throw new Error("Loan not found");
  if (!allowedFrom.includes(loan.status)) {
    throw new Error(`Cannot move from ${loan.status} to ${to}`);
  }
  const patch: Record<string, unknown> = { status: to, updatedAt: Date.now() };
  if (to === "returned") patch.returnedAt = Date.now();
  await ctx.db.patch(loanId, patch);
  await ctx.db.insert("automationEvents", {
    loanId,
    type: "status_changed",
    message: `Status changed to ${to}`,
    createdAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.n8n.notify, {
    loanId,
    event: "status_changed",
  });
  return loan;
}

/** Lender approves a pending request on their own tool. */
export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new Error("Loan not found");
    if (loan.lenderId !== user._id) throw new Error("Not your tool");
    await changeStatus(ctx, args.loanId, ["pending"], "approved");
  },
});

/** Lender declines a pending request on their own tool. */
export const decline = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new Error("Loan not found");
    if (loan.lenderId !== user._id) throw new Error("Not your tool");
    await changeStatus(ctx, args.loanId, ["pending"], "declined");
  },
});

/** Borrower cancels their own pending request. */
export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new Error("Loan not found");
    if (loan.borrowerId !== user._id) throw new Error("Not your request");
    await changeStatus(ctx, args.loanId, ["pending"], "cancelled");
  },
});

/** Lender marks an active loan as returned. */
export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new Error("Loan not found");
    if (loan.lenderId !== user._id) throw new Error("Not your tool");
    await changeStatus(ctx, args.loanId, ["approved"], "returned");
  },
});

// ---- n8n-facing internals (called only via HMAC-verified HTTP routes) ----

/** Overdue = approved, past end date, not returned. Minimal fields for reminders. */
export const overdueLoans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    const active = await ctx.db
      .query("loans")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();
    const overdue = [];
    for (const loan of active) {
      if (loan.endDate >= today) continue;
      const tool = await ctx.db.get(loan.toolId);
      const borrower = await ctx.db.get(loan.borrowerId);
      const lender = await ctx.db.get(loan.lenderId);
      overdue.push({
        loanId: loan._id,
        endDate: loan.endDate,
        toolName: tool?.name ?? "(removed)",
        // Only the recipient address leaves the system — data minimization.
        borrowerEmail: borrower?.email ?? "",
        borrowerName: borrower?.name ?? "Neighbor",
        lenderName: lender?.name ?? "Neighbor",
      });
    }
    return overdue;
  },
});

/**
 * Idempotent reminder write-back: the dedupe key is (loan, day), so retries
 * from n8n on the same day never create a second event or bump the counter.
 */
export const recordReminder = internalMutation({
  args: { loanId: v.id("loans"), date: v.string() },
  handler: async (ctx, args) => {
    const dedupeKey = `reminder:${args.loanId}:${args.date}`;
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
      .unique();
    if (existing) return { created: false };
    const loan = await ctx.db.get(args.loanId);
    if (!loan) return { created: false };
    const now = Date.now();
    await ctx.db.insert("automationEvents", {
      loanId: args.loanId,
      type: "reminder_sent",
      message: `Reminder sent for overdue loan`,
      dedupeKey,
      createdAt: now,
    });
    await ctx.db.patch(args.loanId, {
      lastReminderAt: now,
      reminderCount: loan.reminderCount + 1,
    });
    return { created: true };
  },
});

/** Record a failed notification so automation failures are visible in-app. */
export const recordNotificationFailure = internalMutation({
  args: { loanId: v.id("loans"), message: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("automationEvents", {
      loanId: args.loanId,
      type: "notification_failed",
      message: args.message.slice(0, 500),
      createdAt: Date.now(),
    });
  },
});
