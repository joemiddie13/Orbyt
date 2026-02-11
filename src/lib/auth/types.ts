/** Platform-agnostic auth types. Nothing here imports Better Auth. */

export interface AuthUser {
	uuid: string;
	username: string;
	displayName: string;
	avatarUrl?: string;
}

export interface AuthState {
	isAuthenticated: boolean;
	isLoading: boolean;
	user: AuthUser | null;
}

export interface SignUpParams {
	username: string;
	password: string;
	displayName: string;
}

export interface SignInParams {
	username: string;
	password: string;
}
