import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { APP_VERSION } from './constants';
import type { HostType, ServiceType } from './types';

export interface CliArgs {
  config?: string;
  service?: ServiceType;
  userId?: string;
  host: HostType;
  outputDir: string;
  maxPosts: number;
  maxConcurrentDownloads: number;
}

export function parseCliArgs(argvInput = hideBin(process.argv)): CliArgs {
  const argv = yargs(argvInput)
    .option('config', {
      alias: 'c',
      type: 'string',
      description: 'Path to YAML config file with creators to scrape',
    })
    .option('service', {
      alias: 's',
      type: 'string',
      description: 'The service to scrape from (not needed if using --config)',
      choices: [
        'patreon',
        'fanbox',
        'discord',
        'fantia',
        'afdian',
        'boosty',
        'gumroad',
        'subscribestar',
        'dlsite',
        'onlyfans',
        'fansly',
        'candfans',
      ] as ServiceType[],
    })
    .option('userId', {
      alias: 'u',
      type: 'string',
      description: 'The user ID to scrape from (not needed if using --config)',
    })
    .option('host', {
      alias: 'h',
      type: 'string',
      description: 'The base host to scrape from (subdomains will be tried automatically)',
      choices: [
        'kemono.su', 'coomer.su',
        'kemono.cr', 'coomer.st',
      ] as HostType[],
      default: 'kemono.cr',
    })
    .option('outputDir', {
      alias: 'o',
      type: 'string',
      description: 'The output directory for downloads',
      default: 'downloads-%username%',
    })
    .option('maxPosts', {
      alias: 'm',
      type: 'number',
      description: 'Maximum number of posts to fetch (0 = unlimited, default: 5000)',
      default: 5000,
    })
    .option('maxConcurrentDownloads', {
      alias: 'd',
      type: 'number',
      description: 'Maximum concurrent downloads (1-10, default: 2)',
      default: 2,
    })
    .check((parsedArgv) => {
      if (!parsedArgv.config && (!parsedArgv.service || !parsedArgv.userId)) {
        throw new Error('Either --config or both --service and --userId must be provided');
      }
      if (parsedArgv.maxConcurrentDownloads < 1 || parsedArgv.maxConcurrentDownloads > 10) {
        throw new Error('maxConcurrentDownloads must be between 1 and 10');
      }
      return true;
    })
    .help()
    .alias('help', 'help')
    .version(APP_VERSION)
    .describe('version', 'Show version information')
    .parseSync();

  return argv as unknown as CliArgs;
}
