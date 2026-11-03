"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Nav } from "@/components/Nav";

export default function Admin() {
  const me = useQuery(api.users.me);
  const users = useQuery(api.users.listAll);
  const loans = useQuery(api.loans.listAll);
  const tools = useQuery(api.tools.listAll, {});
  const setTrusted = useMutation(api.users.setTrustedLender);
  const removeTool = useMutation(api.tools.remove);

  if (me === undefined) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <p className="text-sm text-stone-500">Loading…</p>
        </main>
      </>
    );
  }
  if (me === null || me.role !== "admin") {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <p className="text-sm text-red-600">
            You need the admin role to view this page.
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl space-y-10 px-4 py-8">
        <h1 className="text-2xl font-semibold">Admin</h1>

        <section>
          <h2 className="text-lg font-medium">Users</h2>
          <ul className="mt-3 space-y-2">
            {(users ?? []).map((u) => (
              <li
                key={u._id}
                className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {u.name}{" "}
                    <span className="text-stone-400">({u.email})</span>
                  </p>
                  <p className="text-xs capitalize text-stone-500">
                    role: {u.role}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-stone-600">
                  <input
                    type="checkbox"
                    checked={u.trustedLender}
                    onChange={(e) =>
                      void setTrusted({ userId: u._id, trusted: e.target.checked })
                    }
                  />
                  Trusted Lender
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-medium">All listings</h2>
          <ul className="mt-3 space-y-2">
            {(tools ?? []).map((t) => (
              <li
                key={t._id}
                className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs capitalize text-stone-500">
                    {t.category} · lent by {t.ownerName}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`Remove “${t.name}”?`)) {
                      void removeTool({ toolId: t._id });
                    }
                  }}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-medium">All loans</h2>
          <ul className="mt-3 space-y-2">
            {(loans ?? []).map((l) => (
              <li
                key={l._id}
                className="rounded-lg border border-stone-200 bg-white p-3 text-sm"
              >
                <p className="font-medium">{l.toolName}</p>
                <p className="text-xs text-stone-600">
                  {l.borrowerName} ← {l.lenderName} · {l.startDate} →{" "}
                  {l.endDate} ·{" "}
                  <span className="font-medium capitalize">{l.status}</span>
                  {l.reminderCount > 0 &&
                    ` · ${l.reminderCount} reminder${l.reminderCount === 1 ? "" : "s"} sent`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
