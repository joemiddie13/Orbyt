/**
 * Reactive auth state store using Svelte 5 runes.
 * Components import this to check auth — never Better Auth directly.
 */
import { useQuery } from "convex-svelte";
import { api } from "$convex/_generated/api";
import type { AuthState, AuthUser } from "./types";

/** Reactive query for the current authenticated Astrophage user */
export function useCurrentUser() {
	// Get the auth session user from Better Auth via Convex
	const authUser = useQuery(api.auth.getCurrentUser, {});

	// Once we have the auth user, look up the Astrophage user record
	const astrophageUser = useQuery(
		api.users.getByAuthAccount,
		() => authUser.data?._id ? { authAccountId: authUser.data._id } : "skip"
	);

	const state: AuthState = $derived.by(() => {
		if (authUser.isLoading) {
			return { isAuthenticated: false, isLoading: true, user: null };
		}

		if (!authUser.data) {
			return { isAuthenticated: false, isLoading: false, user: null };
		}

		// Auth session exists but Astrophage user record still loading
		if (astrophageUser.isLoading) {
			return { isAuthenticated: true, isLoading: true, user: null };
		}

		const astroUser = astrophageUser.data;
		return {
			isAuthenticated: true,
			isLoading: false,
			user: astroUser
				? {
						uuid: astroUser.uuid,
						username: astroUser.username,
						displayName: astroUser.displayName,
						avatarUrl: astroUser.avatarUrl,
						friendCode: astroUser.friendCode,
					}
				: {
						// Fallback if Astrophage record hasn't been created yet
						uuid: "",
						username: authUser.data.name ?? "",
						displayName: authUser.data.name ?? "",
					},
		};
	});

	return {
		get isAuthenticated() { return state.isAuthenticated; },
		get isLoading() { return state.isLoading; },
		get user() { return state.user; },
	};
}
