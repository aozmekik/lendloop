"use client";

import { ReactNode, useEffect } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth, useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL as string,
);

/** Creates the Convex user row on first sign-in (idempotent). */
function EnsureUser() {
  const { isSignedIn, isLoaded } = useUser();
  const ensure = useMutation(api.users.ensureCurrent);
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      void ensure().catch(() => {
        // The Clerk webhook also upserts the user; a retry happens on next load.
      });
    }
  }, [isLoaded, isSignedIn, ensure]);
  return null;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <EnsureUser />
      {children}
    </ConvexProviderWithClerk>
  );
}
