"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Nav } from "@/components/Nav";
import { RequestForm } from "@/components/RequestForm";

const CATEGORIES = [
  "power tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "automotive",
  "other",
] as const;

type Category = (typeof CATEGORIES)[number];

export default function Dashboard() {
  const [category, setCategory] = useState<Category | "">("");
  const [requesting, setRequesting] = useState<Id<"tools"> | null>(null);
  const tools = useQuery(
    api.tools.listAll,
    category ? { category: category as Category } : {},
  );

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Tool board</h1>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category | "")}
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm capitalize"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
              </option>
            ))}
          </select>
        </div>

        {tools === undefined ? (
          <p className="mt-8 text-sm text-stone-500">Loading…</p>
        ) : tools.length === 0 ? (
          <p className="mt-8 text-sm text-stone-500">
            No tools in this category yet.
          </p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((t) => (
              <li
                key={t._id}
                className="rounded-lg border border-stone-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{t.name}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.available
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {t.available ? "Available" : "On loan"}
                  </span>
                </div>
                <p className="mt-1 text-sm capitalize text-stone-500">
                  {t.category} · {t.condition}
                </p>
                {t.description && (
                  <p className="mt-2 text-sm text-stone-600">{t.description}</p>
                )}
                <p className="mt-2 text-xs text-stone-500">
                  Lent by {t.ownerName}
                  {t.ownerTrusted && (
                    <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                      Trusted Lender
                    </span>
                  )}
                </p>
                {t.available &&
                  (requesting === t._id ? (
                    <RequestForm
                      toolId={t._id}
                      toolName={t.name}
                      onDone={() => setRequesting(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setRequesting(t._id)}
                      className="mt-3 rounded-md border border-emerald-700 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
                    >
                      Request to borrow
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
