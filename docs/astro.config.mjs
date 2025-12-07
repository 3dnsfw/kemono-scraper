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
					tag: 'script',
					content: `
						(function() {
							// Skip if reduced motion is preferred
							if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
							
							// Create overlay element
							const overlay = document.createElement('div');
							overlay.className = 'theme-transition-overlay';
							document.documentElement.appendChild(overlay);
							
							// Watch for theme changes on <html> data-theme attribute
							const observer = new MutationObserver((mutations) => {
								for (const mutation of mutations) {
									if (mutation.attributeName === 'data-theme') {
										// Update overlay background to match new theme
										overlay.style.background = getComputedStyle(document.documentElement).getPropertyValue('--sl-color-bg');
										// Trigger animation
										overlay.classList.remove('active');
										void overlay.offsetWidth; // Force reflow
										overlay.classList.add('active');
										// Clean up after animation
										setTimeout(() => overlay.classList.remove('active'), 400);
									}
								}
							});
							
							observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
						})();
					`,
				},
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
