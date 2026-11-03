import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const toolCategories = [
  "power tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "automotive",
  "other",
] as const;

export const toolCategoryValidator = v.union(
  v.literal("power tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("automotive"),
  v.literal("other"),
);

export const loanStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("returned"),
  v.literal("cancelled"),
);

export default defineSchema({
  users: defineTable({
    // Clerk subject identifier (identity.tokenIdentifier).
    tokenIdentifier: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    trustedLender: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: toolCategoryValidator,
    condition: v.string(),
    description: v.string(),
    // Soft delete: removed rows are kept for auditability.
    isRemoved: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"])
    .index("by_removed", ["isRemoved"]),

  loans: defineTable({
    toolId: v.id("tools"),
    borrowerId: v.id("users"),
    lenderId: v.id("users"),
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(), // YYYY-MM-DD
    status: loanStatusValidator,
    lastReminderAt: v.optional(v.number()),
    reminderCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool", ["toolId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_status", ["status"])
    .index("by_status_end", ["status", "endDate"]),

  automationEvents: defineTable({
    loanId: v.optional(v.id("loans")),
    type: v.union(
      v.literal("request_created"),
      v.literal("status_changed"),
      v.literal("reminder_sent"),
      v.literal("notification_failed"),
    ),
    message: v.string(),
    // Idempotency key for n8n write-backs, e.g. "reminder:<loanId>:<date>".
    dedupeKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_loan", ["loanId"])
    .index("by_dedupe", ["dedupeKey"]),
});
