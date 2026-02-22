import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { authClient } from "@/src/lib/auth-client";

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (isToday) return `Today at ${time}`;
  if (isTomorrow) return `Tomorrow at ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`;
}

type BeaconContent = {
  title?: string;
  description?: string;
  locationAddress?: string;
  startTime?: number;
};

/** Shows beacons from canvases you own */
function MyBeacons({ canvasId }: { canvasId: Id<"canvases"> }) {
  const router = useRouter();
  const beacons = useQuery(api.beacons.getActiveBeacons, { canvasId });

  if (!beacons || beacons.length === 0) return null;

  const beaconItems = beacons
    .filter((b) => b.type === "beacon")
    .map((b) => ({
      _id: b._id,
      content: b.content as BeaconContent,
    }))
    .sort((a, b) => (a.content.startTime ?? 0) - (b.content.startTime ?? 0));

  if (beaconItems.length === 0) return null;

  return (
    <>
      {beaconItems.map((item) => (
        <Pressable
          key={item._id}
          style={({ pressed }) => [
            styles.beaconCard,
            pressed && styles.beaconCardPressed,
          ]}
          onPress={() => router.push(`/beacon/${item._id}`)}
        >
          <Text style={styles.beaconTitle}>
            {item.content.title ?? "Beacon"}
          </Text>
          {item.content.startTime && (
            <Text style={styles.beaconTime}>
              {formatTime(item.content.startTime)}
            </Text>
          )}
          {item.content.locationAddress && (
            <Text style={styles.beaconLocation}>
              📍 {item.content.locationAddress}
            </Text>
          )}
        </Pressable>
      ))}
    </>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const session = authClient.useSession();
  const canvases = useQuery(api.access.getAccessibleCanvases);

  const myCanvases = useMemo(
    () => canvases?.filter((c) => c.role === "owner") ?? [],
    [canvases]
  );

  if (session.isPending) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#fbbf24" size="large" />
      </View>
    );
  }

  const user = session.data?.user;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Account card */}
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name ?? "?")[0].toUpperCase()}
          </Text>
        </View>
        <Text style={styles.displayName}>{user?.name ?? "Unknown"}</Text>
        <Text style={styles.username}>@{user?.username ?? "unknown"}</Text>
      </View>

      {/* My beacons */}
      <Text style={styles.sectionTitle}>My Beacons</Text>
      <Pressable
        style={({ pressed }) => [
          styles.newBeaconButton,
          pressed && styles.newBeaconButtonPressed,
        ]}
        onPress={() => router.push("/beacon/create")}
      >
        <Text style={styles.newBeaconPlus}>+</Text>
        <Text style={styles.newBeaconText}>New Beacon</Text>
      </Pressable>
      <View style={styles.beaconList}>
        {myCanvases.map((canvas) => (
          <MyBeacons key={canvas._id} canvasId={canvas._id} />
        ))}
      </View>

      {/* Sign out */}
      <Pressable
        style={({ pressed }) => [
          styles.signOutButton,
          pressed && styles.signOutButtonPressed,
        ]}
        onPress={() => authClient.signOut()}
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      <Text style={styles.versionText}>Orbyt Mobile v0.0.1</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a1a",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: 24,
    gap: 20,
    paddingBottom: 60,
  },
  card: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 6,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fbbf24",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#0a0a1a",
  },
  displayName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#e8e0d4",
  },
  username: {
    fontSize: 15,
    color: "#999",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#e8e0d4",
    marginTop: 4,
  },
  beaconList: {
    gap: 10,
  },
  beaconCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: "#fbbf24",
    gap: 4,
  },
  beaconCardPressed: {
    opacity: 0.7,
  },
  beaconTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fbbf24",
  },
  beaconTime: {
    fontSize: 13,
    color: "#e8e0d4",
  },
  beaconLocation: {
    fontSize: 12,
    color: "#999",
  },
  newBeaconButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: "#fbbf24",
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  newBeaconButtonPressed: {
    opacity: 0.6,
  },
  newBeaconPlus: {
    color: "#fbbf24",
    fontSize: 20,
    fontWeight: "bold",
  },
  newBeaconText: {
    color: "#fbbf24",
    fontSize: 15,
    fontWeight: "bold",
  },
  emptyText: {
    color: "#666",
    fontSize: 14,
    textAlign: "center",
  },
  signOutButton: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ef4444",
    marginTop: 8,
  },
  signOutButtonPressed: {
    opacity: 0.6,
  },
  signOutText: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "bold",
  },
  versionText: {
    color: "#444",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
});
