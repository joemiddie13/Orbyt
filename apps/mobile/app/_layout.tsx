import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/src/lib/auth-client";
import { useAuthGuard } from "@/src/hooks/useAuthGuard";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

const convex = new ConvexReactClient(
  process.env.EXPO_PUBLIC_CONVEX_URL as string,
  {
    unsavedChangesWarning: false,
  }
);

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ConvexProvider client={convex}>
      <ConvexBetterAuthProvider client={convex} authClient={authClient}>
        <RootLayoutNav />
      </ConvexBetterAuthProvider>
    </ConvexProvider>
  );
}

function RootLayoutNav() {
  useAuthGuard();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0a0a1a" },
        headerTintColor: "#fbbf24",
        headerTitleStyle: { fontWeight: "bold" },
        contentStyle: { backgroundColor: "#0a0a1a" },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="auth"
        options={{ presentation: "modal", headerShown: false }}
      />
      <Stack.Screen
        name="beacon/[id]"
        options={{ title: "Beacon", presentation: "card" }}
      />
      <Stack.Screen
        name="beacon/create"
        options={{ title: "New Beacon", presentation: "modal" }}
      />
    </Stack>
  );
}
