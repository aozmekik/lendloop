"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";

export default function Home() {
  // Public, read-only directory: name and category only, never owner data.
  const tools = useQuery(api.tools.listPublic);

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
        LendLoop
      </p>
      <h1 className="mt-2 text-4xl font-bold">
        Borrow what you need. Lend what you don&rsquo;t.
      </h1>
      <p className="mt-4 text-stone-600">
        A neighborhood tool-lending board. See what&rsquo;s available around
        you, sign in to list your own tools, and handle borrow requests with
        automated reminders.
      </p>

      <div className="mt-8">
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button className="rounded-lg bg-emerald-700 px-5 py-2.5 font-medium text-white hover:bg-emerald-800">
              Sign in to lend or borrow
            </button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          <Link
            href="/dashboard"
            className="inline-block rounded-lg bg-emerald-700 px-5 py-2.5 font-medium text-white hover:bg-emerald-800"
          >
            Open the tool board
          </Link>
        </Show>
      </div>

      <h2 className="mt-14 text-xl font-semibold">Available right now</h2>
      {tools === undefined ? (
        <p className="mt-4 text-sm text-stone-500">Loading…</p>
      ) : tools.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">
          No tools available yet — be the first to lend something.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {tools.map((t) => (
            <li
              key={t._id}
              className="rounded-lg border border-stone-200 bg-white p-4"
            >
              <p className="font-medium">{t.name}</p>
              <p className="text-sm capitalize text-stone-500">{t.category}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs text-stone-400">
        Owner details are only visible to signed-in neighbors.
      </p>
    </main>
  );
}
