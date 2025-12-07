import { MultiProgressBars } from 'multi-progress-bars';
import chalk from 'chalk';
import { ProxyManager } from './proxyManager';
import { parseCliArgs } from './src/cli';
import { loadConfig } from './src/config';
import { createScraperContext } from './src/context';
import { scrapeCreator } from './src/scraper';
import type { HostType, ServiceType } from './src/types';

// Catch unhandled promise rejections to prevent silent exits
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('\n[FATAL] Unhandled Promise Rejection:'), reason);
  console.error(chalk.red('Promise:'), promise);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('\n[FATAL] Uncaught Exception:'), error);
  process.exit(1);
});

(async () => {
  try {
    const argv = parseCliArgs();

    const downloadBars = new MultiProgressBars({
      initMessage: 'Downloads',
      anchor: 'bottom',
      persist: true,
    });

    if (argv.config) {
      const config = await loadConfig(argv.config);
      console.log(chalk.cyan(`Loaded config with ${config.creators.length} creator(s)`));
      const proxyManager = (config.proxies && config.proxies.length > 0)
        ? new ProxyManager(config.proxies, config.proxyRotation)
        : null;
      if (proxyManager) {
        const availability = proxyManager.getAvailability();
        if (!proxyManager.hasAvailableProxy()) {
          console.log(chalk.yellow(`[proxy] Loaded ${availability.total} proxies but none are currently available; continuing without proxies until they recover.`));
        } else {
          console.log(chalk.cyan(`[proxy] Loaded ${availability.total} proxy/proxies with ${availability.available} available (rotation: ${config.proxyRotation || 'round_robin'})`));
        }
      }

      for (let i = 0; i < config.creators.length; i++) {
        const creator = config.creators[i];
        const creatorNum = i + 1;

        const service = creator.service;
        const userId = creator.userId;
        const host = creator.host || config.host || (argv.host as HostType);
        const outputDir = creator.outputDir || config.outputDir || argv.outputDir;
        const maxPosts = creator.maxPosts ?? config.maxPosts ?? argv.maxPosts;
        const maxConcurrentDownloads = config.maxConcurrentDownloads ?? argv.maxConcurrentDownloads ?? 2;

        console.log(chalk.magenta(`\n${'='.repeat(60)}`));
        console.log(chalk.magenta(`[${creatorNum}/${config.creators.length}] Scraping ${service}/${userId}`));
        console.log(chalk.magenta(`${'='.repeat(60)}\n`));

        const ctx = createScraperContext(service, userId, host, outputDir, maxPosts, maxConcurrentDownloads, downloadBars, proxyManager);

        try {
          await scrapeCreator(ctx);
        } catch (error) {
          console.error(chalk.red(`Error scraping ${service}/${userId}:`), error);
        }

        if (i < config.creators.length - 1) {
          console.log(chalk.gray('\nWaiting 2 seconds before next creator...\n'));
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      console.log(chalk.green(`\n${'='.repeat(60)}`));
      console.log(chalk.green(`Finished processing all ${config.creators.length} creator(s)`));
      console.log(chalk.green(`${'='.repeat(60)}\n`));
    } else {
      const service = argv.service as ServiceType;
      const userId = argv.userId as string;
      const host = argv.host as HostType;
      const outputDir = argv.outputDir;
      const maxPosts = argv.maxPosts;
      const maxConcurrentDownloads = argv.maxConcurrentDownloads ?? 2;
      const proxyManager = null;

      const ctx = createScraperContext(service, userId, host, outputDir, maxPosts, maxConcurrentDownloads, downloadBars, proxyManager);
      await scrapeCreator(ctx);
    }

    downloadBars.close();
  } catch (error) {
    console.error(chalk.red('Fatal error:'), error);
    if (error instanceof Error) {
      console.error(chalk.red('Error message:'), error.message);
      if (error.stack) {
        console.error(chalk.red('Stack trace:'), error.stack);
      }
    }
    process.exit(1);
  }
})();
