import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";

/** Format a timestamp to a readable date/time string */
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
  endTime?: number;
};

/** Beacon list for a single canvas */
function CanvasBeaconList({ canvasId }: { canvasId: Id<"canvases"> }) {
  const router = useRouter();
  const beacons = useQuery(api.beacons.getActiveBeacons, { canvasId });

  if (!beacons || beacons.length === 0) return null;

  const beaconItems = beacons
    .filter((b) => b.type === "beacon")
    .map((b) => ({
      _id: b._id,
      content: b.content as BeaconContent,
      creatorName: b.creatorName,
    }))
    .sort((a, b) => (a.content.startTime ?? 0) - (b.content.startTime ?? 0));

  if (beaconItems.length === 0) return null;

  return (
    <View style={styles.section}>
      {beaconItems.map((item) => (
        <Pressable
          key={item._id}
          style={({ pressed }) => [
            styles.beaconCard,
            pressed && styles.beaconCardPressed,
          ]}
          onPress={() => router.push(`/beacon/${item._id}`)}
        >
          <Text style={styles.beaconCreator}>{item.creatorName}</Text>
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
          {item.content.description && (
            <Text style={styles.beaconDescription} numberOfLines={2}>
              {item.content.description}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

export default function BeaconsScreen() {
  const router = useRouter();
  const canvases = useQuery(api.access.getAccessibleCanvases);

  // Friends' beacons only — filter out canvases you own
  const friendCanvases = useMemo(
    () => canvases?.filter((c) => c.role !== "owner") ?? [],
    [canvases]
  );

  if (canvases === undefined) {
    return (
      <View style={styles.wrapper}>
        <View style={[styles.container, styles.centered]}>
          <ActivityIndicator color="#fbbf24" size="large" />
        </View>
        <FAB onPress={() => router.push("/beacon/create")} />
      </View>
    );
  }

  if (friendCanvases.length === 0) {
    return (
      <View style={styles.wrapper}>
        <View style={[styles.container, styles.centered]}>
          <Text style={styles.emptyIcon}>⚡</Text>
          <Text style={styles.emptyTitle}>No friend beacons</Text>
          <Text style={styles.emptySubtitle}>
            When friends create beacons, they'll show up here
          </Text>
        </View>
        <FAB onPress={() => router.push("/beacon/create")} />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <FlatList
        style={styles.container}
        data={friendCanvases}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <CanvasBeaconList canvasId={item._id} />
        )}
      />
      <FAB onPress={() => router.push("/beacon/create")} />
    </View>
  );
}

function FAB({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      onPress={onPress}
    >
      <FontAwesome name="plus" size={22} color="#0a0a1a" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#0a0a1a",
  },
  container: {
    flex: 1,
    backgroundColor: "#0a0a1a",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#e8e0d4",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  section: {
    gap: 12,
    marginBottom: 8,
  },
  beaconCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#fbbf24",
    gap: 6,
  },
  beaconCardPressed: {
    opacity: 0.7,
  },
  beaconCreator: {
    fontSize: 13,
    fontWeight: "600",
    color: "#999",
  },
  beaconTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fbbf24",
  },
  beaconTime: {
    fontSize: 14,
    color: "#e8e0d4",
  },
  beaconLocation: {
    fontSize: 13,
    color: "#999",
  },
  beaconDescription: {
    fontSize: 13,
    color: "#888",
    marginTop: 4,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fbbf24",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  fabPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
});
