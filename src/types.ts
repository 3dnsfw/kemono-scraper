import type { MultiProgressBars } from 'multi-progress-bars';
import type {
  ProxyConfig,
  ProxyManager,
  ProxyRotation,
  ProxySelection,
} from '../proxyManager';

export interface File {
  name: string;
  path: string;
}

export interface Post {
  id: string;
  user: string;
  service:
    | 'patreon'
    | 'fanbox'
    | 'discord'
    | 'fantia'
    | 'afdian'
    | 'boosty'
    | 'gumroad'
    | 'subscribestar'
    | 'dlsite'
    | 'onlyfans'
    | 'fansly'
    | 'candfans';
  title: string;
  content: string;
  shared_file: boolean;
  added: Date;
  published: Date;
  edited: Date | null;
  file: File;
  attachments: File[];
}

export interface DownloadQueueEntry {
  filePath: string;
  fileName: string;
  outputPath: string;
  postId: string;
  taskId: string;
}

export type ServiceType =
  | 'patreon'
  | 'fanbox'
  | 'discord'
  | 'fantia'
  | 'afdian'
  | 'boosty'
  | 'gumroad'
  | 'subscribestar'
  | 'dlsite'
  | 'onlyfans'
  | 'fansly'
  | 'candfans';

export type HostType = 'kemono.su' | 'coomer.su' | 'kemono.cr' | 'coomer.st';
export type ProxyRotationMode = ProxyRotation;

export interface CreatorConfig {
  service: ServiceType;
  userId: string;
  host?: HostType;
  outputDir?: string;
  maxPosts?: number;
}

export interface Config {
  host?: HostType;
  outputDir?: string;
  maxPosts?: number;
  maxConcurrentDownloads?: number;
  proxies?: ProxyConfig[];
  proxyRotation?: ProxyRotationMode;
  creators: CreatorConfig[];
}

export interface BlacklistEntry {
  filePath: string;
  fileName: string;
  addedAt: string;
  failureCount: number;
}

export interface ScraperContext {
  service: ServiceType;
  userId: string;
  host: HostType;
  outputDir: string;
  maxPosts: number;
  maxConcurrentDownloads: number;
  baseDomain: string;
  subdomains: string[];
  blacklistFile: string;
  workingApiHost: string | null;
  proxyManager: ProxyManager | null;
  proxyWarningIssued?: boolean;
  blacklist: Set<string>;
  failureCounts: Map<string, number>;
  fileNames: Map<string, string>;
  addedAtDates: Map<string, string>;
  downloadBars: MultiProgressBars;
  overallProgressBarId: string;
}

export interface DownloadResult {
  completed: number;
  failed: DownloadQueueEntry[];
}

export interface DownloadAllResult {
  completed: number;
  failed: number;
  total: number;
}

export type { ProxyConfig, ProxyManager, ProxySelection };
