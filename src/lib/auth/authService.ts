/**
 * Auth service — the ONLY file that imports Better Auth.
 * Everything else in the app goes through this module.
 * When we migrate to AT Protocol, only this file changes.
 */
import { authClient } from "$lib/auth-client";
import type { SignUpParams, SignInParams, Passkey } from "./types";

/** Convex client getter — set by initAuthService() from a Svelte component */
let _convexClient: any = null;

export function initAuthService(client: any) {
	_convexClient = client;
}

/**
 * Sign up a new user. Generates a placeholder email internally
 * because Better Auth requires one. Users never see it.
 * After auth signup, creates the Astrophage user record + personal canvas.
 */
export async function signUp(params: SignUpParams): Promise<{ error?: string }> {
	const sanitized = params.username.replace(/[^a-zA-Z0-9]/g, '');
	const placeholderEmail = `${sanitized}@astrophage.local`;

	const result = await authClient.signUp.email({
		email: placeholderEmail,
		password: params.password,
		name: params.displayName,
		username: params.username,
	});

	if (result.error) {
		return { error: result.error.message ?? "Sign up failed" };
	}

	// Create Astrophage user record + personal canvas in Convex.
	// Retry because the auth token takes time to propagate to the Convex client.
	if (_convexClient && result.data?.user) {
		const { api } = await import("$convex/_generated/api");
		const maxRetries = 5;
		for (let i = 0; i < maxRetries; i++) {
			try {
				await _convexClient.mutation(api.users.createUser, {
					username: params.username,
					displayName: params.displayName || params.username,
				});
				break;
			} catch {
				if (i < maxRetries - 1) {
					await new Promise((r) => setTimeout(r, 500 * (i + 1)));
				}
			}
		}
	}

	return {};
}

/** Sign in with username + password */
export async function signIn(params: SignInParams): Promise<{ error?: string }> {
	const result = await authClient.signIn.username({
		username: params.username,
		password: params.password,
	});

	if (result.error) {
		return { error: result.error.message ?? "Sign in failed" };
	}

	return {};
}

/** Sign out the current user */
export async function signOut(): Promise<void> {
	await authClient.signOut();
}

// --- Passkey functions ---

/** Register a new passkey for the current user (triggers browser WebAuthn prompt) */
export async function registerPasskey(name?: string): Promise<{ error?: string }> {
	try {
		const result = await authClient.passkey.addPasskey({ name });
		if (result?.error) return { error: result.error.message ?? "Failed to register passkey" };
		return {};
	} catch {
		return { error: "Passkey registration was cancelled or failed" };
	}
}

/** Sign in with a passkey (triggers browser WebAuthn prompt) */
export async function signInWithPasskey(): Promise<{ error?: string }> {
	try {
		const result = await authClient.signIn.passkey();
		if (result?.error) return { error: result.error.message ?? "Passkey sign-in failed" };
		return {};
	} catch {
		return { error: "Passkey sign-in was cancelled or failed" };
	}
}

/** List all passkeys for the current user */
export async function listPasskeys(): Promise<Passkey[]> {
	try {
		const result = await authClient.passkey.listUserPasskeys();
		if (!result?.data) return [];
		return result.data.map((p: any) => ({
			id: p.id,
			name: p.name,
			createdAt: new Date(p.createdAt),
		}));
	} catch {
		return [];
	}
}

/** Delete a passkey by ID */
export async function deletePasskey(id: string): Promise<{ error?: string }> {
	try {
		const result = await authClient.passkey.deletePasskey({ id });
		if (result?.error) return { error: result.error.message ?? "Failed to delete passkey" };
		return {};
	} catch {
		return { error: "Failed to delete passkey" };
	}
}

// --- Recovery code functions ---

/** Generate recovery codes (calls Convex mutation, returns plaintext codes shown once) */
export async function generateRecoveryCodes(): Promise<{ codes?: string[]; error?: string }> {
	if (!_convexClient) return { error: "Not connected" };
	try {
		const { api } = await import("$convex/_generated/api");
		const codes = await _convexClient.mutation(api.recovery.generateRecoveryCodes, {});
		return { codes };
	} catch {
		return { error: "Failed to generate recovery codes" };
	}
}

/** Reset password using a recovery code (unauthenticated — user is locked out) */
export async function resetWithRecoveryCode(
	username: string,
	code: string,
	newPassword: string,
): Promise<{ error?: string }> {
	if (!_convexClient) return { error: "Not connected" };
	try {
		const { api } = await import("$convex/_generated/api");
		const result = await _convexClient.action(api.recoveryActions.verifyRecoveryCodeAndResetPassword, {
			username,
			recoveryCode: code,
			newPassword,
		});
		if (!result.success) return { error: result.error ?? "Recovery failed" };
		return {};
	} catch (err: any) {
		const msg = err?.message ?? String(err);
		return { error: `Recovery failed: ${msg}` };
	}
}
