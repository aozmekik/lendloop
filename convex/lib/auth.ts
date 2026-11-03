import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

/**
 * Returns the Convex user row for the current Clerk identity, or null.
 * Every privileged function must resolve the user server-side like this —
 * never trust a user id passed from the client.
 */
export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new Error("Admin role required");
  return user;
}

export function assertOwns(user: Doc<"users">, ownerId: Id<"users">) {
  if (user._id !== ownerId && user.role !== "admin") {
    throw new Error("Not authorized for this resource");
  }
}

/** Parse ADMIN_EMAILS (comma-separated) from the Convex environment. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
