import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { APP_VERSION } from './constants';
import type { HostType, ServiceType } from './types';

export interface ScrapeCliArgs {
  mode: 'scrape';
  config?: string;
  service?: ServiceType;
  userId?: string;
  host: HostType;
  outputDir: string;
  maxPosts: number;
  maxConcurrentDownloads: number;
}

export interface CompressCliArgs {
  mode: 'compress';
  jpegXlQuality: number;
  jpegXlEffort: number;
  av1Crf: number;
  av1Preset: number;
  keepOriginals: boolean;
  dryRun: boolean;
}

export type ParsedCliArgs = ScrapeCliArgs | CompressCliArgs;

export function parseCliArgs(argvInput = hideBin(process.argv)): ParsedCliArgs {
  const envCompressionDefaults = {
    jpegXlQuality: parseEnvNumber(process.env.JPEG_XL_QUALITY, 90),
    jpegXlEffort: parseEnvNumber(process.env.JPEG_XL_EFFORT, 5),
    av1Crf: parseEnvNumber(process.env.AV1_CRF, 30),
    av1Preset: parseEnvNumber(process.env.AV1_PRESET, 6),
    keepOriginals: parseEnvBoolean(process.env.KEEP_ORIGINALS, true),
  };

  let parsedResult: ParsedCliArgs | undefined;

  const parser = yargs(argvInput)
    .scriptName('kemono-scraper')
    .command(
      'compress',
      'Compress downloaded media',
      (cmd) => cmd
        .option('jpegXlQuality', {
          type: 'number',
          description: 'JPEG XL quality (env: JPEG_XL_QUALITY)',
          default: envCompressionDefaults.jpegXlQuality,
        })
        .option('jpegXlEffort', {
          type: 'number',
          description: 'JPEG XL effort (env: JPEG_XL_EFFORT)',
          default: envCompressionDefaults.jpegXlEffort,
        })
        .option('av1Crf', {
          type: 'number',
          description: 'AV1 CRF (env: AV1_CRF)',
          default: envCompressionDefaults.av1Crf,
        })
        .option('av1Preset', {
          type: 'number',
          description: 'AV1 preset (env: AV1_PRESET)',
          default: envCompressionDefaults.av1Preset,
        })
        .option('keepOriginals', {
          type: 'boolean',
          description: 'Keep original files (env: KEEP_ORIGINALS, default: true)',
          default: envCompressionDefaults.keepOriginals,
        })
        .option('dryRun', {
          type: 'boolean',
          description: 'Show what would be compressed without modifying files',
          default: false,
        })
        .help(),
      (argv) => {
        parsedResult = {
          mode: 'compress',
          jpegXlQuality: argv.jpegXlQuality as number,
          jpegXlEffort: argv.jpegXlEffort as number,
          av1Crf: argv.av1Crf as number,
          av1Preset: argv.av1Preset as number,
          keepOriginals: argv.keepOriginals as boolean,
          dryRun: argv.dryRun as boolean,
        };
      },
    )
    .command(
      ['scrape', '$0'],
      'Scrape creators (default)',
      (cmd) => cmd
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
        .help(),
      (argv) => {
        parsedResult = {
          mode: 'scrape',
          config: argv.config as string | undefined,
          service: argv.service as ServiceType | undefined,
          userId: argv.userId as string | undefined,
          host: (argv.host as HostType) || 'kemono.cr',
          outputDir: argv.outputDir as string,
          maxPosts: argv.maxPosts as number,
          maxConcurrentDownloads: argv.maxConcurrentDownloads as number,
        };
      },
    )
    .help()
    .alias('help', 'help')
    .version(APP_VERSION)
    .describe('version', 'Show version information')
    .strictCommands()
    .recommendCommands();

  parser.parseSync();

  if (!parsedResult) {
    throw new Error('Failed to parse CLI arguments');
  }

  return parsedResult;
}

function parseEnvNumber(value: string | undefined, fallback: number): number {
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function parseEnvBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    if (lowered === '0' || lowered === 'false' || lowered === 'no') return false;
    if (lowered === '1' || lowered === 'true' || lowered === 'yes') return true;
  }
  return fallback;
}
