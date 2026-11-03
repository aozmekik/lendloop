import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import { toolCategoryValidator } from "./schema";

async function hasActiveLoan(
  ctx: { db: any },
  toolId: Id<"tools">,
): Promise<boolean> {
  const active = await ctx.db
    .query("loans")
    .withIndex("by_tool", (q: any) => q.eq("toolId", toolId))
    .collect();
  return active.some(
    (l: { status: string }) => l.status === "approved",
  );
}

/**
 * Public directory: name and category only, per the brief. No owner
 * information leaves this function. Availability is derived from active
 * loans so it can never go stale.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_removed", (q) => q.eq("isRemoved", false))
      .collect();
    const available: Array<{ _id: Id<"tools">; name: string; category: string }> = [];
    for (const tool of tools) {
      if (!(await hasActiveLoan(ctx, tool._id))) {
        available.push({ _id: tool._id, name: tool.name, category: tool.category });
      }
    }
    return available;
  },
});

/** Signed-in directory: full details + availability, filterable by category. */
export const listAll = query({
  args: { category: v.optional(toolCategoryValidator) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const tools = (
      await ctx.db
        .query("tools")
        .withIndex("by_removed", (q) => q.eq("isRemoved", false))
        .collect()
    ).filter((t) => !args.category || t.category === args.category);
    const owners = new Map<string, { name: string; trustedLender: boolean }>();
    const result = [];
    for (const tool of tools) {
      if (!owners.has(tool.ownerId)) {
        const owner = await ctx.db.get(tool.ownerId);
        owners.set(tool.ownerId, {
          name: owner?.name ?? "Unknown",
          trustedLender: owner?.trustedLender ?? false,
        });
      }
      result.push({
        ...tool,
        ownerName: owners.get(tool.ownerId)!.name,
        ownerTrusted: owners.get(tool.ownerId)!.trustedLender,
        available: !(await hasActiveLoan(ctx, tool._id)),
      });
    }
    return result;
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    category: toolCategoryValidator,
    condition: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (!name || name.length > 120) throw new Error("Invalid name");
    if (args.description.length > 1000) throw new Error("Description too long");
    const now = Date.now();
    return await ctx.db.insert("tools", {
      ownerId: user._id,
      name,
      category: args.category,
      condition: args.condition.trim(),
      description: args.description.trim(),
      isRemoved: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category: toolCategoryValidator,
    condition: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.isRemoved) throw new Error("Tool not found");
    if (tool.ownerId !== user._id) throw new Error("Not your listing");
    await ctx.db.patch(args.toolId, {
      name: args.name.trim(),
      category: args.category,
      condition: args.condition.trim(),
      description: args.description.trim(),
      updatedAt: Date.now(),
    });
  },
});

/** Owners delete their own listings; admins can remove any listing. */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.isRemoved) throw new Error("Tool not found");
    if (tool.ownerId !== user._id && user.role !== "admin") {
      throw new Error("Not authorized");
    }
    // Soft delete keeps loan history and audit trails intact.
    await ctx.db.patch(args.toolId, { isRemoved: true, updatedAt: Date.now() });
  },
});
