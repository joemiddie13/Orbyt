import { useState, useCallback } from "react";
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

/**
 * Beacon list for a single canvas.
 * Each canvas gets its own query so Convex reactivity works per-canvas.
 */
function CanvasBeaconList({
  canvasId,
  canvasLabel,
}: {
  canvasId: Id<"canvases">;
  canvasLabel?: string;
}) {
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
  const canvases = useQuery(api.access.getAccessibleCanvases);

  if (canvases === undefined) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#fbbf24" size="large" />
      </View>
    );
  }

  if (canvases.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyIcon}>⚡</Text>
        <Text style={styles.emptyTitle}>No canvases yet</Text>
        <Text style={styles.emptySubtitle}>
          Add friends on the web app to see their beacons here
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={canvases}
      keyExtractor={(item) => item._id}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>⚡</Text>
          <Text style={styles.emptyTitle}>No active beacons</Text>
          <Text style={styles.emptySubtitle}>
            When friends create beacons, they'll show up here
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <CanvasBeaconList canvasId={item._id} />
      )}
    />
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
});
