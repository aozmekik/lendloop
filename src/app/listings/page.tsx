"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Nav } from "@/components/Nav";

const CATEGORIES = [
  "power tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "automotive",
  "other",
] as const;

type Tool = Doc<"tools">;

function ToolForm({
  initial,
  onDone,
}: {
  initial?: Tool;
  onDone: () => void;
}) {
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(
    initial?.category ?? "power tools",
  );
  const [condition, setCondition] = useState(initial?.condition ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (initial) {
        await update({ toolId: initial._id, name, category, condition, description });
      } else {
        await create({ name, category, condition, description });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-stone-200 bg-white p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-stone-600">Name</span>
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
            placeholder="Cordless drill"
          />
        </label>
        <label className="text-sm">
          <span className="text-stone-600">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
            className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1.5 capitalize"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-stone-600">Condition</span>
          <input
            required
            maxLength={80}
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
            placeholder="Good, some wear"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-stone-600">Short description</span>
          <textarea
            maxLength={1000}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
            placeholder="18V, two batteries included"
          />
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {initial ? "Save changes" : "List tool"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function Listings() {
  const tools = useQuery(api.tools.listMine);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<Id<"tools"> | "new" | null>(null);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">My listings</h1>
          {editing !== "new" && (
            <button
              onClick={() => setEditing("new")}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              List a tool
            </button>
          )}
        </div>

        {editing === "new" && (
          <div className="mt-6">
            <ToolForm onDone={() => setEditing(null)} />
          </div>
        )}

        {tools === undefined ? (
          <p className="mt-8 text-sm text-stone-500">Loading…</p>
        ) : tools.length === 0 && editing !== "new" ? (
          <p className="mt-8 text-sm text-stone-500">
            You haven&rsquo;t listed any tools yet.
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {tools.map((t) => (
              <li key={t._id}>
                {editing === t._id ? (
                  <ToolForm initial={t} onDone={() => setEditing(null)} />
                ) : (
                  <div className="rounded-lg border border-stone-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {t.name}
                          {t.isRemoved && (
                            <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                              removed
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-sm capitalize text-stone-500">
                          {t.category} · {t.condition}
                        </p>
                        {t.description && (
                          <p className="mt-1 text-sm text-stone-600">
                            {t.description}
                          </p>
                        )}
                      </div>
                      {!t.isRemoved && (
                        <div className="flex shrink-0 gap-2">
                          <button
                            onClick={() => setEditing(t._id)}
                            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Remove “${t.name}”?`)) {
                                void remove({ toolId: t._id });
                              }
                            }}
                            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
