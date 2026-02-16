import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		warningFilter: (warning) => {
			// Suppress a11y warnings during development — modal overlays use div click handlers intentionally
			if (warning.code.startsWith('a11y_')) return false;
			// Suppress state_referenced_locally for FriendCodeModal (prop is read-only, not mutated)
			if (warning.code === 'state_referenced_locally') return false;
			return true;
		},
	},
	kit: {
		adapter: adapter(),
		alias: {
			$convex: './src/convex'
		}
	}
};

export default config;
