import chalk from 'chalk';
import path from 'path';
import { isAxiosError } from 'axios';
import type { MultiProgressBars } from 'multi-progress-bars';
import { PROXY_DEBUG, PROXY_FAILURE_CODES } from './constants';
import type {
  HostType,
  ProxySelection,
  ScraperContext,
  ServiceType,
} from './types';
import type { ProxyManager } from '../proxyManager';

export function getDomainConfig(host: HostType): { baseDomain: string; subdomains: string[] } {
  const isLegacy = host.includes('.su');
  const baseDomain = isLegacy
    ? (host.includes('kemono') ? 'kemono.su' : 'coomer.su')
    : (host.includes('kemono') ? 'kemono.cr' : 'coomer.st');
  const subdomains = isLegacy
    ? (host.includes('kemono') ? ['c1'] : ['c5', 'c6'])
    : ['n1', 'n2', 'n3', 'n4'];
  return { baseDomain, subdomains };
}

export function createScraperContext(
  service: ServiceType,
  userId: string,
  host: HostType,
  outputDir: string,
  maxPosts: number,
  maxConcurrentDownloads: number,
  downloadBars: MultiProgressBars,
  proxyManager: ProxyManager | null
): ScraperContext {
  const { baseDomain, subdomains } = getDomainConfig(host);
  const resolvedOutputDir = outputDir.replace('%username%', userId);

  return {
    service,
    userId,
    host,
    outputDir: resolvedOutputDir,
    maxPosts,
    maxConcurrentDownloads,
    baseDomain,
    subdomains,
    blacklistFile: path.join(resolvedOutputDir, 'blacklist.json'),
    workingApiHost: null,
    proxyManager,
    proxyWarningIssued: false,
    blacklist: new Set(),
    failureCounts: new Map(),
    fileNames: new Map(),
    addedAtDates: new Map(),
    downloadBars,
    overallProgressBarId: `${service}/${userId} Progress`,
  };
}

export function shouldCooldownProxy(error: unknown): boolean {
  if (!error) return false;
  if (!isAxiosError(error)) return true;
  if (!error.response) {
    const code = (error as any).code;
    return typeof code === 'string' && PROXY_FAILURE_CODES.has(code);
  }
  if (error.response?.status === 407) {
    return true; // Proxy auth required
  }
  return false;
}

export function buildProxyAxiosOptions(
  ctx: ScraperContext,
  url: string
): { selection: ProxySelection | null; options: Record<string, unknown> } {
  if (!ctx.proxyManager || ctx.proxyManager.size === 0) {
    return { selection: null, options: {} };
  }

  const selection = ctx.proxyManager.getNextProxy(url);
  if (!selection) {
    if (!ctx.proxyWarningIssued) {
      const availability = ctx.proxyManager.getAvailability();
      console.log(chalk.yellow(`[proxy] No healthy proxies available (${availability.available}/${availability.total}); falling back to direct connection.`));
      ctx.proxyWarningIssued = true;
    }
    return { selection: null, options: {} };
  }

  ctx.proxyWarningIssued = false;

  if (PROXY_DEBUG) {
    console.log(chalk.gray(`[proxy] Using ${selection.label} for ${url}`));
  }

  return {
    selection,
    options: {
      httpAgent: selection.httpAgent,
      httpsAgent: selection.httpsAgent,
      proxy: false,
    },
  };
}

export function recordProxyOutcome(ctx: ScraperContext, selection: ProxySelection | null, error?: unknown): void {
  if (!selection || !ctx.proxyManager) {
    return;
  }

  if (error && shouldCooldownProxy(error)) {
    ctx.proxyManager.reportFailure(selection.id);
  } else if (!error) {
    ctx.proxyManager.reportSuccess(selection.id);
  }
}
