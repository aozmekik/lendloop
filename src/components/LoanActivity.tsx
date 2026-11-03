"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

function timeAgo(ts: number): string {
  const minutes = Math.floor((Date.now() - ts) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** (Bonus) Recent automation activity for a loan, e.g. "Reminder sent 2 days ago". */
export function LoanActivity({ loanId }: { loanId: Id<"loans"> }) {
  const events = useQuery(api.loans.activity, { loanId });
  if (!events || events.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 border-t border-stone-100 pt-2">
      {events.map((e) => (
        <li key={e._id} className="flex justify-between text-xs text-stone-500">
          <span>{e.message}</span>
          <span>{timeAgo(e.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}
