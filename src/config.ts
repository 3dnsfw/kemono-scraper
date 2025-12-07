import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import type { Config, CreatorConfig } from './types';

export async function loadConfig(configPath: string): Promise<Config> {
  const absolutePath = path.resolve(configPath);
  if (!await fs.pathExists(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  const content = await fs.readFile(absolutePath, 'utf8');
  const config = yaml.load(content) as Config;

  if (!config.creators || !Array.isArray(config.creators) || config.creators.length === 0) {
    throw new Error('Config file must contain a "creators" array with at least one creator');
  }

  config.proxies = Array.isArray(config.proxies) ? config.proxies : [];
  config.proxyRotation = config.proxyRotation || 'round_robin';

  validateMaxConcurrentDownloads(config);
  validateProxies(config);
  validateCreators(config.creators);

  return config;
}

function validateMaxConcurrentDownloads(config: Config): void {
  if (config.maxConcurrentDownloads === undefined) {
    return;
  }

  if (typeof config.maxConcurrentDownloads !== 'number' ||
      config.maxConcurrentDownloads < 1 ||
      config.maxConcurrentDownloads > 10) {
    throw new Error('maxConcurrentDownloads must be a number between 1 and 10');
  }
}

function validateProxies(config: Config): void {
  for (const proxy of config.proxies ?? []) {
    if (!proxy || typeof proxy !== 'object') {
      throw new Error('Each proxy entry must be an object');
    }
    if (!['http', 'https', 'socks5'].includes(proxy.type as string)) {
      throw new Error('Proxy "type" must be one of: http, https, socks5');
    }
    if (!proxy.host || typeof proxy.host !== 'string') {
      throw new Error('Proxy "host" is required and must be a string');
    }
    if (typeof proxy.port !== 'number' || proxy.port <= 0) {
      throw new Error('Proxy "port" is required and must be a positive number');
    }
    if (proxy.username && typeof proxy.username !== 'string') {
      throw new Error('Proxy "username" must be a string when provided');
    }
    if (proxy.password && typeof proxy.password !== 'string') {
      throw new Error('Proxy "password" must be a string when provided');
    }
  }
}

function validateCreators(creators: CreatorConfig[]): void {
  for (const creator of creators) {
    if (!creator.service) {
      throw new Error('Each creator must have a "service" field');
    }
    if (!creator.userId) {
      throw new Error('Each creator must have a "userId" field');
    }
  }
}
