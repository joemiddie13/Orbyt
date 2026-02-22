import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";

type Status = "joining" | "interested" | "declined";

const STATUS_CONFIG: Record<Status, { label: string; emoji: string; color: string }> = {
  joining: { label: "Joining", emoji: "🙌", color: "#22c55e" },
  interested: { label: "Interested", emoji: "👀", color: "#fbbf24" },
  declined: { label: "Can't make it", emoji: "😔", color: "#ef4444" },
};

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function BeaconDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const beaconId = id as Id<"canvasObjects">;

  const responses = useQuery(api.responses.getByBeacon, { beaconId });
  const respond = useMutation(api.responses.respond);
  const removeResponse = useMutation(api.responses.removeResponse);

  // We need the beacon object itself for its content
  // Since there's no direct getById query, we'll get it from the responses context
  // Actually, let's get it from the canvas objects
  // For now, we'll use a simpler approach: the beacon content comes from the list screen

  // Get the beacon data by querying the object directly isn't exposed as a query,
  // so we use a pattern: query getActiveBeacons for all canvases and find this one.
  // Better approach: add a getById query. For MVP, we'll show responses and RSVP.

  const handleRSVP = async (status: Status) => {
    // Check if user already has this status — toggle off
    const myResponse = responses?.find((r) => r.userId && r.status === status);
    // Actually we need to check by the current user, which we don't directly have here.
    // The mutation handles upsert, so just call it. Toggle by calling removeResponse.
    try {
      await respond({ beaconId, status });
    } catch (e: any) {
      console.warn("RSVP failed:", e.message);
    }
  };

  const handleRemoveRSVP = async () => {
    try {
      await removeResponse({ beaconId });
    } catch (e: any) {
      console.warn("Remove RSVP failed:", e.message);
    }
  };

  if (responses === undefined) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#fbbf24" size="large" />
      </View>
    );
  }

  // Group responses by status
  const grouped: Record<Status, typeof responses> = {
    joining: responses.filter((r) => r.status === "joining"),
    interested: responses.filter((r) => r.status === "interested"),
    declined: responses.filter((r) => r.status === "declined"),
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* RSVP Buttons */}
      <Text style={styles.sectionTitle}>Your RSVP</Text>
      <View style={styles.rsvpRow}>
        {(["joining", "interested", "declined"] as Status[]).map((status) => {
          const config = STATUS_CONFIG[status];
          return (
            <Pressable
              key={status}
              style={({ pressed }) => [
                styles.rsvpButton,
                { borderColor: config.color },
                pressed && styles.rsvpButtonPressed,
              ]}
              onPress={() => handleRSVP(status)}
            >
              <Text style={styles.rsvpEmoji}>{config.emoji}</Text>
              <Text style={[styles.rsvpLabel, { color: config.color }]}>
                {config.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.clearButton} onPress={handleRemoveRSVP}>
        <Text style={styles.clearButtonText}>Clear my response</Text>
      </Pressable>

      {/* Response Lists */}
      {(["joining", "interested", "declined"] as Status[]).map((status) => {
        const items = grouped[status];
        if (items.length === 0) return null;
        const config = STATUS_CONFIG[status];
        return (
          <View key={status} style={styles.responseSection}>
            <Text style={[styles.responseSectionTitle, { color: config.color }]}>
              {config.emoji} {config.label} ({items.length})
            </Text>
            {items.map((r) => (
              <View key={r._id} style={styles.responseRow}>
                <Text style={styles.responseName}>
                  {r.displayName ?? r.username ?? "Unknown"}
                </Text>
              </View>
            ))}
          </View>
        );
      })}

      {responses.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No responses yet — be the first!</Text>
        </View>
      )}
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
    padding: 32,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#e8e0d4",
    marginBottom: 4,
  },
  rsvpRow: {
    flexDirection: "row",
    gap: 10,
  },
  rsvpButton: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    backgroundColor: "#1a1a2e",
    gap: 4,
  },
  rsvpButtonPressed: {
    opacity: 0.6,
  },
  rsvpEmoji: {
    fontSize: 24,
  },
  rsvpLabel: {
    fontSize: 12,
    fontWeight: "bold",
  },
  clearButton: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  clearButtonText: {
    color: "#666",
    fontSize: 13,
  },
  responseSection: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  responseSectionTitle: {
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 4,
  },
  responseRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#333",
  },
  responseName: {
    fontSize: 15,
    color: "#e8e0d4",
  },
  emptyText: {
    color: "#666",
    fontSize: 14,
    textAlign: "center",
    marginTop: 32,
  },
});
