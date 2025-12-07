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
						document.addEventListener('DOMContentLoaded', () => {
							if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
							if (!document.startViewTransition) return;
							
							// Find the theme toggle button (starlight-theme-rapide uses a button)
							const themeBtn = document.querySelector('[data-theme-toggle], .theme-toggle button, header button[class*="theme"]');
							
							// Intercept clicks on theme toggle area
							document.addEventListener('click', (e) => {
								const btn = e.target.closest('button');
								if (!btn) return;
								
								// Check if this button is for theme toggling
								const isThemeBtn = btn.closest('[data-theme-toggle]') || 
									btn.textContent.toLowerCase().includes('theme') ||
									btn.getAttribute('aria-label')?.toLowerCase().includes('theme');
								if (!isThemeBtn) return;
								
								e.preventDefault();
								e.stopImmediatePropagation();
								
								// Determine next theme
								const current = document.documentElement.dataset.theme || 'dark';
								const next = current === 'dark' ? 'light' : 'dark';
								
								const transition = document.startViewTransition(() => {
									document.documentElement.dataset.theme = next;
									localStorage.setItem('starlight-theme', next);
								});
								
								transition.ready.then(() => {
									const x = window.innerWidth;
									const maxRadius = Math.hypot(x, window.innerHeight);
									document.documentElement.animate(
										{ clipPath: ['circle(0px at ' + x + 'px 0)', 'circle(' + maxRadius + 'px at ' + x + 'px 0)'] },
										{ duration: 800, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', pseudoElement: '::view-transition-new(root)' }
									);
								});
							}, true);
						});
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
