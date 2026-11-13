import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Static hosting: all pages are prerendered (see src/routes/+layout.ts).
			adapter: adapter(),

			// GitHub Pages serves the site from /<repo>/, so all asset and route
			// URLs need the prefix. The dev server stays at the domain root.
			paths: {
				base: command === 'serve' ? '' : '/step-method'
			}
		})
	]
}));
