import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { authClient } from "@/src/lib/auth-client";

export default function ProfileScreen() {
  const session = authClient.useSession();

  if (session.isPending) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#fbbf24" size="large" />
      </View>
    );
  }

  const user = session.data?.user;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name ?? "?")[0].toUpperCase()}
          </Text>
        </View>
        <Text style={styles.displayName}>{user?.name ?? "Unknown"}</Text>
        <Text style={styles.username}>@{user?.username ?? "unknown"}</Text>
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a1a",
    padding: 24,
    alignItems: "center",
    gap: 24,
  },
  centered: {
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    width: "100%",
    marginTop: 32,
    gap: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fbbf24",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#0a0a1a",
  },
  displayName: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#e8e0d4",
  },
  username: {
    fontSize: 16,
    color: "#999",
  },
  signOutButton: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ef4444",
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
    position: "absolute",
    bottom: 32,
  },
});
