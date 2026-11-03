import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { adminEmails, requireAdmin, requireUser } from "./lib/auth";

/**
 * Idempotent upsert called from the client on first load (and safe to call
 * on every load). The Clerk webhook also calls `upsertFromClerk`; whichever
 * arrives first wins, the other is a no-op.
 */
export const ensureCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (existing) return existing._id;
    const email = (identity.email ?? "").toLowerCase();
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      email,
      name: identity.name ?? identity.email ?? "Neighbor",
      role: adminEmails().includes(email) ? "admin" : "user",
      trustedLender: false,
      createdAt: Date.now(),
    });
  },
});

/** Called only by the verified Clerk webhook (see http.ts). */
export const upsertFromClerk = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email.toLowerCase(),
        name: args.name,
      });
      return existing._id;
    }
    return await ctx.db.insert("users", {
      tokenIdentifier: args.tokenIdentifier,
      email: args.email.toLowerCase(),
      name: args.name,
      role: adminEmails().includes(args.email.toLowerCase()) ? "admin" : "user",
      trustedLender: false,
      createdAt: Date.now(),
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
  },
});

/** Admin-only: toggle the "Trusted Lender" badge. */
export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.userId, { trustedLender: args.trusted });
  },
});

/** Admin-only: list all users (used on the admin page). */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("users").collect();
  },
});

/** Used by the loans module to render counterparties without a join table scan. */
export const getPublicProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    // Data minimization: expose only what the UI needs.
    return { _id: user._id, name: user.name, trustedLender: user.trustedLender };
  },
});
