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
                {
					icon: "heart",
					label: "Donate",
					href: "https://coindrop.to/nsfw3d"
				},
			],
			customCss: ['./src/styles/custom.css'],
			head: [
				{
					tag: 'meta',
					attrs: {
						property: 'og:image',
						content: 'https://repository-images.githubusercontent.com/804778787/2ed662f1-6026-4551-bae2-a04f896742ff',
					},
				},
				{
					tag: 'meta',
					attrs: {
						property: 'og:image:alt',
						content: 'Kemono Scraper - Download all media from Kemono and Coomer with ease',
					},
				},
				{
					tag: 'meta',
					attrs: {
						name: 'twitter:image',
						content: 'https://repository-images.githubusercontent.com/804778787/2ed662f1-6026-4551-bae2-a04f896742ff',
					},
				},
				{
					tag: 'meta',
					attrs: {
						name: 'twitter:image:alt',
						content: 'Kemono Scraper - Download all media from Kemono and Coomer with ease',
					},
				},
				{
					tag: 'meta',
					attrs: {
						name: 'author',
						content: '3dnsfw',
					},
				},
				{
					tag: 'meta',
					attrs: {
						name: 'keywords',
						content: 'kemono, coomer, scraper, download, media, patreon, onlyfans, fansly, fanbox, fantia',
					},
				},
			],
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
