export { signUp, signIn, signOut, initAuthService, registerPasskey, signInWithPasskey, listPasskeys, deletePasskey, generateRecoveryCodes, resetWithRecoveryCode } from "./authService";
export { useCurrentUser } from "./currentUser.svelte";
export type { AuthUser, AuthState, SignUpParams, SignInParams, Passkey } from "./types";
