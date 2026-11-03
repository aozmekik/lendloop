"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const links = [
  { href: "/dashboard", label: "Browse tools" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "Requests" },
];

export function Nav() {
  const pathname = usePathname();
  const me = useQuery(api.users.me);

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-lg font-bold text-emerald-800">
            LendLoop
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 ${
                  pathname.startsWith(l.href)
                    ? "bg-emerald-100 font-medium text-emerald-900"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                {l.label}
              </Link>
            ))}
            {me?.role === "admin" && (
              <Link
                href="/admin"
                className={`rounded-md px-3 py-1.5 ${
                  pathname.startsWith("/admin")
                    ? "bg-emerald-100 font-medium text-emerald-900"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                Admin
              </Link>
            )}
          </nav>
        </div>
        <UserButton />
      </div>
    </header>
  );
}
