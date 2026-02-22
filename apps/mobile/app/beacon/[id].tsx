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
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const date = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  if (isToday) return `Today at ${time}`;
  if (isTomorrow) return `Tomorrow at ${time}`;
  return `${date} at ${time}`;
}

type BeaconContent = {
  title?: string;
  description?: string;
  locationAddress?: string;
  startTime?: number;
  endTime?: number;
};

export default function BeaconDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const beaconId = id as Id<"canvasObjects">;

  const beacon = useQuery(api.objects.getById, { id: beaconId });
  const responses = useQuery(api.responses.getByBeacon, { beaconId });
  const respond = useMutation(api.responses.respond);
  const removeResponse = useMutation(api.responses.removeResponse);

  const handleRSVP = async (status: Status) => {
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

  if (beacon === undefined || responses === undefined) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#fbbf24" size="large" />
      </View>
    );
  }

  const content = (beacon?.content ?? {}) as BeaconContent;

  // Group responses by status
  const grouped: Record<Status, typeof responses> = {
    joining: responses.filter((r) => r.status === "joining"),
    interested: responses.filter((r) => r.status === "interested"),
    declined: responses.filter((r) => r.status === "declined"),
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Beacon info */}
      <View style={styles.beaconHeader}>
        <Text style={styles.beaconTitle}>{content.title ?? "Beacon"}</Text>
        {content.description && (
          <Text style={styles.beaconDescription}>{content.description}</Text>
        )}
        <View style={styles.detailsRow}>
          {content.startTime && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>When</Text>
              <Text style={styles.detailValue}>
                {formatDateTime(content.startTime)}
                {content.endTime ? ` — ${formatDateTime(content.endTime)}` : ""}
              </Text>
            </View>
          )}
          {content.locationAddress && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Where</Text>
              <Text style={styles.detailValue}>📍 {content.locationAddress}</Text>
            </View>
          )}
        </View>
      </View>

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
  beaconHeader: {
    backgroundColor: "#1a1a2e",
    borderRadius: 14,
    padding: 20,
    gap: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#fbbf24",
  },
  beaconTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fbbf24",
  },
  beaconDescription: {
    fontSize: 15,
    color: "#e8e0d4",
    lineHeight: 22,
  },
  detailsRow: {
    gap: 10,
    marginTop: 6,
  },
  detailItem: {
    gap: 2,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 14,
    color: "#e8e0d4",
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
