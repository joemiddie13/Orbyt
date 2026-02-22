import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useMutation } from "convex/react";
import { api } from "@backend/_generated/api";
import { authClient } from "@/src/lib/auth-client";

type Mode = "signin" | "signup";

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const createUser = useMutation(api.users.createUser);

  async function handleSignIn() {
    setError("");
    setLoading(true);
    try {
      const result = await authClient.signIn.username({
        username,
        password,
      });
      if (result.error) {
        setError(result.error.message ?? "Sign in failed");
      }
    } catch (e: any) {
      setError(e.message ?? "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp() {
    setError("");
    setLoading(true);
    try {
      const sanitized = username.replace(/[^a-zA-Z0-9]/g, "");
      const placeholderEmail = `${sanitized}@astrophage.local`;

      const result = await authClient.signUp.email({
        email: placeholderEmail,
        password,
        name: displayName || username,
        username,
      });

      if (result.error) {
        setError(result.error.message ?? "Sign up failed");
        return;
      }

      // Create Orbyt user record + personal canvas.
      // Retry because auth token takes time to propagate to Convex.
      const maxRetries = 5;
      for (let i = 0; i < maxRetries; i++) {
        try {
          await createUser({
            username,
            displayName: displayName || username,
          });
          break;
        } catch {
          if (i < maxRetries - 1) {
            await new Promise((r) => setTimeout(r, 500 * (i + 1)));
          }
        }
      }
    } catch (e: any) {
      setError(e.message ?? "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Orbyt</Text>
        <Text style={styles.subtitle}>
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#666"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {mode === "signup" && (
          <TextInput
            style={styles.input}
            placeholder="Display name (optional)"
            placeholderTextColor="#666"
            value={displayName}
            onChangeText={setDisplayName}
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#666"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={mode === "signin" ? handleSignIn : handleSignUp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0a0a1a" />
          ) : (
            <Text style={styles.buttonText}>
              {mode === "signin" ? "Sign In" : "Sign Up"}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
          }}
        >
          <Text style={styles.switchText}>
            {mode === "signin"
              ? "Don't have an account? Sign up"
              : "Already have an account? Sign in"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a1a",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 32,
    gap: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fbbf24",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    marginBottom: 8,
  },
  error: {
    color: "#ef4444",
    fontSize: 14,
    textAlign: "center",
  },
  input: {
    backgroundColor: "#0a0a1a",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: "#e8e0d4",
    borderWidth: 1,
    borderColor: "#333",
  },
  button: {
    backgroundColor: "#fbbf24",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#0a0a1a",
    fontSize: 16,
    fontWeight: "bold",
  },
  switchText: {
    color: "#fbbf24",
    textAlign: "center",
    fontSize: 14,
    marginTop: 4,
  },
});
