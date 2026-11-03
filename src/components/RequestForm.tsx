"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export function RequestForm({
  toolId,
  toolName,
  onDone,
}: {
  toolId: Id<"tools">;
  toolName: string;
  onDone: () => void;
}) {
  const request = useMutation(api.loans.request);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await request({ toolId, startDate, endDate });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-md bg-stone-50 p-3">
      <p className="text-sm font-medium">Borrow “{toolName}”</p>
      <div className="flex gap-2">
        <label className="flex-1 text-xs text-stone-600">
          From
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex-1 text-xs text-stone-600">
          To
          <input
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm"
          />
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          Send request
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
