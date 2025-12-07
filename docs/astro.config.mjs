// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightThemeRapide from 'starlight-theme-rapide';

// https://astro.build/config
export default defineConfig({
	site: 'https://3dnsfw.github.io',
	base: '/Kemono-Scraper/',
	integrations: [
		starlight({
			plugins: [starlightThemeRapide()],
			title: 'Kemono Scraper',
			description: 'Download all media from Kemono and Coomer with ease',
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/3dnsfw/Kemono-Scraper',
				},
			],
			customCss: ['./src/styles/custom.css'],
			sidebar: [
				{ label: 'Home', slug: 'index' },
				{
					label: 'Getting Started',
					autogenerate: { directory: 'getting-started' },
				},
				{
					label: 'Usage Guide',
					autogenerate: { directory: 'usage' },
				},
				{
					label: 'Help',
					autogenerate: { directory: 'help' },
				},
			],
		}),
	],
});
