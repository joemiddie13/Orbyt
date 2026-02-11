/**
 * Auth service — the ONLY file that imports Better Auth.
 * Everything else in the app goes through this module.
 * When we migrate to AT Protocol, only this file changes.
 */
import { authClient } from "$lib/auth-client";
import type { SignUpParams, SignInParams } from "./types";

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
	const placeholderEmail = `${params.username}@astrophage.local`;

	const result = await authClient.signUp.email({
		email: placeholderEmail,
		password: params.password,
		name: params.displayName,
		username: params.username,
	});

	if (result.error) {
		return { error: result.error.message ?? "Sign up failed" };
	}

	// Create Astrophage user record + personal canvas in Convex
	if (_convexClient && result.data?.user) {
		try {
			const { api } = await import("$convex/_generated/api");
			await _convexClient.mutation(api.users.createUser, {
				authAccountId: result.data.user.id,
				username: params.username,
				displayName: params.displayName || params.username,
			});
		} catch (err) {
			console.error("Failed to create Astrophage user record:", err);
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
