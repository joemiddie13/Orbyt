import { useEffect } from "react";
import { useRouter, useSegments } from "expo-router";
import { authClient } from "../lib/auth-client";

/**
 * Redirects unauthenticated users to /auth and authenticated users away from /auth.
 * Returns the current session state.
 */
export function useAuthGuard() {
  const session = authClient.useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (session.isPending) return;

    const inAuthScreen = segments[0] === "auth";

    if (!session.data && !inAuthScreen) {
      router.replace("/auth");
    } else if (session.data && inAuthScreen) {
      router.replace("/");
    }
  }, [session.data, session.isPending, segments]);

  return {
    isLoading: session.isPending,
    isAuthenticated: !!session.data,
    user: session.data?.user ?? null,
  };
}
