"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Nav } from "@/components/Nav";
import { LoanActivity } from "@/components/LoanActivity";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  declined: "bg-red-100 text-red-700",
  returned: "bg-stone-200 text-stone-700",
  cancelled: "bg-stone-200 text-stone-500",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusStyles[status] ?? ""}`}
    >
      {status}
    </span>
  );
}

export default function Requests() {
  const mine = useQuery(api.loans.myRequests);
  const incoming = useQuery(api.loans.incomingRequests);
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const cancel = useMutation(api.loans.cancel);
  const markReturned = useMutation(api.loans.markReturned);

  const loading = mine === undefined || incoming === undefined;
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10));
  }, []);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Requests</h1>
        {loading ? (
          <p className="mt-8 text-sm text-stone-500">Loading…</p>
        ) : (
          <div className="mt-6 grid gap-10 lg:grid-cols-2">
            <section>
              <h2 className="text-lg font-medium">Incoming requests</h2>
              <p className="text-sm text-stone-500">
                Requests from neighbors for your tools.
              </p>
              {incoming!.length === 0 ? (
                <p className="mt-4 text-sm text-stone-500">None yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {incoming!.map((l) => (
                    <li
                      key={l._id}
                      className="rounded-lg border border-stone-200 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{l.toolName}</p>
                          <p className="mt-1 text-sm text-stone-600">
                            {l.borrowerName} · {l.startDate} → {l.endDate}
                          </p>
                          {l.status === "approved" && l.endDate < today && (
                            <p className="mt-1 text-xs font-medium text-red-600">
                              Overdue
                            </p>
                          )}
                        </div>
                        <StatusBadge status={l.status} />
                      </div>
                      {l.status === "pending" && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => void approve({ loanId: l._id })}
                            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => void decline({ loanId: l._id })}
                            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                      {l.status === "approved" && (
                        <button
                          onClick={() => void markReturned({ loanId: l._id })}
                          className="mt-3 rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
                        >
                          Mark as returned
                        </button>
                      )}
                      <LoanActivity loanId={l._id} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-lg font-medium">My requests</h2>
              <p className="text-sm text-stone-500">
                Tools you asked to borrow.
              </p>
              {mine!.length === 0 ? (
                <p className="mt-4 text-sm text-stone-500">None yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {mine!.map((l) => (
                    <li
                      key={l._id}
                      className="rounded-lg border border-stone-200 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{l.toolName}</p>
                          <p className="mt-1 text-sm text-stone-600">
                            Lent by {l.lenderName} · {l.startDate} → {l.endDate}
                          </p>
                          {l.status === "approved" && l.endDate < today && (
                            <p className="mt-1 text-xs font-medium text-red-600">
                              Overdue — please return this tool
                            </p>
                          )}
                        </div>
                        <StatusBadge status={l.status} />
                      </div>
                      {l.status === "pending" && (
                        <button
                          onClick={() => void cancel({ loanId: l._id })}
                          className="mt-3 rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
                        >
                          Cancel request
                        </button>
                      )}
                      <LoanActivity loanId={l._id} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
