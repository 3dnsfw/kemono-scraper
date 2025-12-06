import axios, { isAxiosError } from 'axios';
import fs from 'fs-extra';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { MultiProgressBars } from 'multi-progress-bars';
import chalk from 'chalk';
import { AsyncQueue } from "@tanuel/async-queue";

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

// Build-time constants injected by scripts/build.ts via --define
// These will be replaced at compile time; fallback values used during development
declare const BUILD_VERSION: string | undefined;
declare const BUILD_COMMIT: string | undefined;
declare const BUILD_TIME: string | undefined;
declare const BUILD_TARGET: string | undefined;

const APP_VERSION = typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : 'dev';
const APP_COMMIT = typeof BUILD_COMMIT !== 'undefined' ? BUILD_COMMIT : 'unknown';
const APP_BUILD_TIME = typeof BUILD_TIME !== 'undefined' ? BUILD_TIME : 'unknown';
const APP_BUILD_TARGET = typeof BUILD_TARGET !== 'undefined' ? BUILD_TARGET : 'unknown';

interface File {
  name: string;
  path: string;
}

interface Post {
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

interface DownloadQueueEntry {
  filePath: string;
  fileName: string;
  outputPath: string;
  postId: string;
  taskId: string; // Unique ID for progress bar task (prevents collisions)
}

const argv = yargs(hideBin(process.argv))
  .option('service', {
    alias: 's',
    type: 'string',
    description: 'The service to scrape from',
    choices: [
      'patreon',
      'fanbox',
      'discord',
      'fantia',
      'afdian',
      'boosty',
      'gumroad',
      'subscribestar',
      'onlyfans',
      'fansly',
      'candfans',
    ],
    demandOption: true,
  })
  .option('userId', {
    alias: 'u',
    type: 'string',
    description: 'The user ID to scrape from',
    demandOption: true,
  })
  .option('host', {
    alias: 'h',
    type: 'string',
    description: 'The base host to scrape from (subdomains will be tried automatically)',
    choices: [
      'kemono.su', 'coomer.su', // Legacy domains
      'kemono.cr', 'coomer.st', // New domains
    ],
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
  .help()
  .alias('help', 'help')
  .version(APP_VERSION)
  .describe('version', 'Show version information')
  .parseSync();

const { service, userId, host, outputDir, maxPosts } = argv;

// Determine base domain and subdomain prefix
const isLegacy = host.includes('.su');
const baseDomain = isLegacy 
  ? (host.includes('kemono') ? 'kemono.su' : 'coomer.su')
  : (host.includes('kemono') ? 'kemono.cr' : 'coomer.st');

// Subdomains to try (n1, n2, n3, n4 for new domains, c1, c5, c6 for legacy)
const SUBDOMAINS = isLegacy 
  ? (host.includes('kemono') ? ['c1'] : ['c5', 'c6'])
  : ['n1', 'n2', 'n3', 'n4'];

let workingApiHost: string | null = null;

// Replace %username% in the output directory with the actual user ID
const OUTPUT_DIR = outputDir.replace('%username%', userId);
const BLACKLIST_FILE = path.join(OUTPUT_DIR, 'blacklist.json');
const PAGE_SIZE = 50;
const MAX_CONCURRENT_DOWNLOADS = 2;
const MAX_DOWNLOAD_RETRIES = 3;
const DOWNLOAD_RETRY_WAIT_SECONDS = 10000;
const MAX_FAILURES_BEFORE_BLACKLIST = 5;
const STREAM_TIMEOUT_MS = 300000; // 5 minute timeout for stream operations (prevents hangs)

const downloadBars = new MultiProgressBars({
  initMessage: 'Downloads',
  anchor: 'bottom',
  persist: true,
});

const overallProgressBarId = 'Overall Progress';

// Blacklist and failure tracking
interface BlacklistEntry {
  filePath: string;
  fileName: string;
  addedAt: string;
  failureCount: number;
}

let blacklist: Set<string> = new Set();
let failureCounts: Map<string, number> = new Map();
let fileNames: Map<string, string> = new Map(); // Store fileName for each filePath

// API requires these headers to work
const API_HEADERS = {
  'Accept': 'text/css',
  'Accept-Encoding': 'gzip, deflate'
};

// Load blacklist from JSON file
async function loadBlacklist(): Promise<void> {
  try {
    if (await fs.pathExists(BLACKLIST_FILE)) {
      const data = await fs.readJson(BLACKLIST_FILE);
      if (Array.isArray(data)) {
        for (const entry of data) {
          if (entry.filePath) {
            blacklist.add(entry.filePath);
            // Restore failure counts from blacklist entries
            if (entry.failureCount) {
              failureCounts.set(entry.filePath, entry.failureCount);
            }
            // Restore fileName if available
            if (entry.fileName) {
              fileNames.set(entry.filePath, entry.fileName);
            }
          }
        }
        console.log(chalk.yellow(`Loaded ${blacklist.size} blacklisted items from ${BLACKLIST_FILE}`));
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error loading blacklist: ${error}`));
  }
}

// Save blacklist to JSON file
async function saveBlacklist(): Promise<void> {
  try {
    const entries: BlacklistEntry[] = [];
    for (const filePath of blacklist) {
      const failureCount = failureCounts.get(filePath) || MAX_FAILURES_BEFORE_BLACKLIST;
      const fileName = fileNames.get(filePath) || path.basename(filePath);
      entries.push({
        filePath,
        fileName,
        addedAt: new Date().toISOString(),
        failureCount,
      });
    }
    await fs.writeJson(BLACKLIST_FILE, entries, { spaces: 2 });
  } catch (error) {
    console.error(chalk.red(`Error saving blacklist: ${error}`));
  }
}

// Add an asset to the blacklist
async function addToBlacklist(filePath: string, fileName: string): Promise<void> {
  if (!blacklist.has(filePath)) {
    blacklist.add(filePath);
    failureCounts.set(filePath, MAX_FAILURES_BEFORE_BLACKLIST);
    fileNames.set(filePath, fileName);
    await saveBlacklist();
    console.log(chalk.red(`Added to blacklist (5 failures): ${fileName}`));
  }
}

// Increment failure count for an asset
async function recordFailure(filePath: string, fileName: string): Promise<void> {
  const currentCount = failureCounts.get(filePath) || 0;
  const newCount = currentCount + 1;
  failureCounts.set(filePath, newCount);
  fileNames.set(filePath, fileName); // Store fileName for future reference
  
  if (newCount >= MAX_FAILURES_BEFORE_BLACKLIST) {
    await addToBlacklist(filePath, fileName);
  }
}

// Safely update progress bar task (handles missing tasks gracefully)
function safeUpdateTask(postId: string, update: any): void {
  try {
    downloadBars.updateTask(postId, update);
  } catch (error) {
    // Task doesn't exist, ignore
  }
}

// Safely mark progress bar task as done (handles missing tasks gracefully)
function safeDoneTask(postId: string, update: any): void {
  try {
    downloadBars.done(postId, update);
  } catch (error) {
    // Task doesn't exist, ignore
  }
}

async function findWorkingApiHost(): Promise<string> {
  if (workingApiHost) {
    return workingApiHost;
  }

  console.log(chalk.yellow(`Finding working API host for ${baseDomain}...`));
  
  // API is only on base domain, not subdomains (CDN is on subdomains)
  // Correct endpoint: /api/v1/{service}/user/{userId}/posts
  const testUrl = `https://${baseDomain}/api/v1/${service}/user/${userId}/posts?o=0`;
  console.log(chalk.gray(`Trying ${baseDomain}...`));
  
  let retries = 0;
  const maxRetries = 3;
  
  while (retries <= maxRetries) {
    try {
      const response = await axios.get(testUrl, { 
        timeout: 20000,
        headers: API_HEADERS
      });
      // Accept 200 with posts array in response.data.posts
      if (response.status === 200 && response.data && typeof response.data === 'object') {
        if (Array.isArray(response.data.posts) || Array.isArray(response.data)) {
          workingApiHost = baseDomain;
          console.log(chalk.green(`Using API host: ${baseDomain}`));
          return baseDomain;
        }
      }
    } catch (error) {
      if (isAxiosError(error)) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        
        // Handle rate limiting (429) with exponential backoff
        if (status === 429) {
          const waitTime = Math.min(1000 * Math.pow(2, retries), 10000); // Max 10 seconds
          console.log(chalk.yellow(`Rate limited (429). Waiting ${waitTime/1000}s before retry ${retries + 1}/${maxRetries}...`));
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retries++;
          continue;
        }
        
        if (retries < maxRetries) {
          console.log(chalk.gray(`  ${baseDomain} failed: ${status || statusText || error.message}. Retrying...`));
          await new Promise(resolve => setTimeout(resolve, 2000 * (retries + 1)));
          retries++;
          continue;
        }
        
        console.log(chalk.gray(`  ${baseDomain} failed: ${status || statusText || error.message}`));
      }
      break;
    }
  }

  throw new Error(`Could not find a working API host for ${baseDomain}`);
}


async function fetchPosts(offset: number = 0, retries = 0): Promise<{ posts: Post[], hasMore: boolean }> {
  const apiHost = await findWorkingApiHost();
  // Correct API format: /api/v1/{service}/user/{userId}/posts?o=...
  const url = `https://${apiHost}/api/v1/${service}/user/${userId}/posts?o=${offset}`;
  
  if (retries === 0) {
    console.log(chalk.blue(`Fetching posts (offset: ${offset})...`));
  }
  
  try {
    const response = await axios.get(url, { 
      headers: API_HEADERS,
      timeout: 30000
    });
    
    // Response format: array of posts directly
    const posts = Array.isArray(response.data) ? response.data : (response.data.posts || []);
    const count = posts.length;
    
    if (retries === 0) {
      console.log(chalk.green(`Fetched ${count} posts (offset: ${offset})`));
    }
    
    // If we got fewer posts than PAGE_SIZE, we've reached the end
    const hasMore = count === PAGE_SIZE;
    
    return { posts, hasMore };
  } catch (error) {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const message = error.message;
      
      console.log(chalk.red(`Error fetching posts (offset: ${offset}): ${status || statusText || message}`));
      
      // Handle rate limiting with exponential backoff
      if (status === 429 && retries < 5) {
        const waitTime = Math.min(1000 * Math.pow(2, retries), 10000);
        console.log(chalk.yellow(`Rate limited (429). Waiting ${waitTime/1000}s before retry ${retries + 1}/5...`));
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return fetchPosts(offset, retries + 1);
      }
      
      // Retry other errors (except 404)
      if (retries < 3 && status !== 404) {
        const waitTime = 2000 * (retries + 1);
        console.log(chalk.yellow(`Retrying in ${waitTime/1000}s... (attempt ${retries + 1}/3)`));
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return fetchPosts(offset, retries + 1);
      }
      
      // If 404, return empty array (no more posts)
      if (status === 404) {
        console.log(chalk.yellow(`No more posts found (404)`));
        return { posts: [], hasMore: false };
      }
    }
    throw error;
  }
}

async function downloadFile(downloadQueueEntry: DownloadQueueEntry, retries = 0, cdnSubdomainIndex = 0): Promise<void> {
  const { filePath, fileName, outputPath, taskId } = downloadQueueEntry;
  
  // Check if this asset is blacklisted
  if (blacklist.has(filePath)) {
    downloadBars.addTask(taskId, {
      type: 'percentage',
      message: 'Blacklisted (skipping)',
      barTransformFn: chalk.yellow,
    });
    safeDoneTask(taskId, {
      message: `Skipped (blacklisted): ${fileName}`,
      barTransformFn: chalk.yellow,
    });
    setTimeout(() => {
      try {
        downloadBars.removeTask(taskId);
      } catch (e) {
        // Task already removed, ignore
      }
    }, 2000);
    return;
  }
  
  downloadBars.addTask(taskId, {
    type: 'percentage',
    message: 'Starting...',
    barTransformFn: chalk.blue,
  });
  try {
    if (await fileExistsOrCompressed(outputPath)) {
      safeDoneTask(taskId, {
        message: `File already exists ${outputPath}`,
        barTransformFn: chalk.green,
      });
      setTimeout(() => {
        try {
          downloadBars.removeTask(taskId);
        } catch (e) {
          // Task already removed, ignore
        }
      }, 2000);
      return;
    }

    // Try different CDN subdomains
    let downloadUrl: string;
    if (cdnSubdomainIndex < SUBDOMAINS.length) {
      const subdomain = SUBDOMAINS[cdnSubdomainIndex];
      const cdnHost = `${subdomain}.${baseDomain}`;
      downloadUrl = `https://${cdnHost}/data${filePath}?f=${encodeURIComponent(fileName)}`;
    } else {
      // Fallback to base domain
      downloadUrl = `https://${baseDomain}/data${filePath}?f=${encodeURIComponent(fileName)}`;
    }

    // Use a temp file for downloading to avoid partial files
    const tempPath = getTempPath(outputPath);
    
    // Clean up any existing temp file from previous failed download
    try {
      if (await fs.pathExists(tempPath)) {
        await fs.remove(tempPath);
      }
    } catch (e) {
      // Ignore cleanup errors
    }

    const response = await axios.get(downloadUrl, {
      responseType: 'stream',
      timeout: 120000, // Increased timeout to 2 minutes for large files
      onDownloadProgress: progressEvent => {
        if (progressEvent.total) {
          // can calculate percentage
          safeUpdateTask(taskId, {
            percentage: progressEvent.loaded / progressEvent.total,
            message: chalk.blue(`Downloading`),
          });
        } else {
          safeUpdateTask(taskId, {
            percentage: progressEvent.loaded ? 100 : 0,
            message: chalk.blue(`Downloading`),
          });
        }
      },
    });

    // Check for 500 errors before processing the stream
    if (response.status === 500) {
      // Immediately blacklist and abort on 500 errors
      await addToBlacklist(filePath, fileName);
      safeDoneTask(taskId, {
        message: `Blacklisted (500 error): ${fileName}`,
        barTransformFn: chalk.red,
      });
      setTimeout(() => {
        try {
          downloadBars.removeTask(taskId);
        } catch (e) {
          // Task already removed, ignore
        }
      }, 2000);
      return;
    }

    const writer = fs.createWriteStream(tempPath);
    const expectedSize = response.headers['content-length'] ? parseInt(response.headers['content-length'], 10) : null;
    let downloadedBytes = 0;
    let streamEnded = false;
    let streamError: Error | null = null;

    // Create the stream promise with a timeout to prevent hangs
    const streamPromise = new Promise<void>((resolve, reject) => {
      let isResolved = false;
      let isRejected = false;
      let lastProgress = Date.now();

      // Helper to safely cleanup and reject
      const safeReject = async (err: Error, errorMessage: string) => {
        if (isResolved || isRejected) return;
        isRejected = true;
        
        streamError = err;
        
        // Unpipe before destroying to prevent "write after destroy" errors
        try {
          response.data.unpipe(writer);
        } catch (unpipeError) {
          // Ignore unpipe errors
        }
        
        // Destroy writer safely
        try {
          if (!writer.destroyed) {
            writer.destroy();
          }
        } catch (destroyError) {
          // Ignore destroy errors
        }
        
        // Clean up incomplete temp file
        try {
          if (await fs.pathExists(tempPath)) {
            await fs.remove(tempPath);
          }
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        
        await recordFailure(filePath, fileName);
        safeUpdateTask(taskId, {
          message: errorMessage,
          barTransformFn: chalk.red,
        });
        reject(err);
      };

      // Track bytes downloaded and update last progress time
      response.data.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        lastProgress = Date.now();
      });

      // Handle response stream errors
      response.data.on('error', async (err: Error) => {
        await safeReject(err, `Connection error: ${err.message}`);
      });

      // Check if stream ended properly
      response.data.on('end', () => {
        streamEnded = true;
      });

      response.data.pipe(writer);

      // Stall detection - if no data received for 60 seconds, consider it hung
      const stallCheckInterval = setInterval(async () => {
        if (isResolved || isRejected) {
          clearInterval(stallCheckInterval);
          return;
        }
        const stallTime = Date.now() - lastProgress;
        if (stallTime > 60000) { // 60 second stall timeout
          clearInterval(stallCheckInterval);
          await safeReject(
            new Error(`Download stalled (no data for ${Math.round(stallTime / 1000)}s)`),
            `Download stalled (no data for ${Math.round(stallTime / 1000)}s)`
          );
        }
      }, 10000);
      
      writer.on('finish', async () => {
        clearInterval(stallCheckInterval);
        if (isResolved || isRejected) return;
        
        // Verify the download completed successfully
        if (streamError) {
          return; // Error already handled
        }

        // Check if stream ended properly
        if (!streamEnded) {
          // Stream didn't end properly, file is likely incomplete
          await safeReject(
            new Error('Download stream ended prematurely'),
            'Download stream ended prematurely'
          );
          return;
        }

        // Verify file size matches expected size if available
        if (expectedSize !== null) {
          try {
            const stats = await fs.stat(tempPath);
            if (stats.size !== expectedSize) {
              // File size mismatch, incomplete download
              await safeReject(
                new Error(`Download incomplete: expected ${expectedSize} bytes, got ${stats.size}`),
                `Download incomplete: expected ${expectedSize} bytes, got ${stats.size}`
              );
              return;
            }
          } catch (statError) {
            // Can't verify, but assume it's OK
          }
        }

        if (isResolved || isRejected) return;
        isResolved = true;

        // Rename temp file to final destination
        try {
          await fs.rename(tempPath, outputPath);
        } catch (renameError) {
          // If rename fails, try copy + delete
          try {
            await fs.copy(tempPath, outputPath);
            await fs.remove(tempPath);
          } catch (copyError) {
            await safeReject(
              copyError instanceof Error ? copyError : new Error(String(copyError)),
              `Failed to save file: ${copyError}`
            );
            return;
          }
        }

        safeDoneTask(taskId, {
          message: `Downloaded as ${outputPath}`,
          barTransformFn: chalk.green,
        });
        setTimeout(() => {
          try {
            downloadBars.removeTask(taskId);
          } catch (error) {
            // Task already removed, ignore
          }
        }, 2000);
        resolve();
      });
      
      writer.on('error', async (err) => {
        clearInterval(stallCheckInterval);
        // Ignore errors if writer was destroyed by us (streamError is set)
        if (streamError) {
          return; // Already handled
        }
        
        // Check if it's a "write after destroy" error - this is expected when connection fails
        if (err.message.includes('write after a stream was destroyed') || 
            err.message.includes('Cannot call write after a stream was destroyed')) {
          // This is a side effect of connection failure, ignore it
          return;
        }
        
        await safeReject(err, `Write error: ${err.message}`);
      });
    });

    // Add overall timeout for the stream operation
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Download timeout after ${STREAM_TIMEOUT_MS / 1000}s`));
      }, STREAM_TIMEOUT_MS);
    });

    return Promise.race([streamPromise, timeoutPromise]);
  } catch (error) {
    // Clean up incomplete temp file if it exists
    const tempPathCleanup = getTempPath(outputPath);
    try {
      if (await fs.pathExists(tempPathCleanup)) {
        await fs.remove(tempPathCleanup);
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    if (isAxiosError(error)) {
      const status = error.response?.status;
      const errorCode = (error as any).code;
      
      // Handle connection errors (ECONNRESET, ECONNABORTED, ETIMEDOUT)
      if (errorCode === 'ECONNRESET' || errorCode === 'ECONNABORTED' || errorCode === 'ETIMEDOUT') {
        await recordFailure(filePath, fileName);
        safeUpdateTask(taskId, {
          message: `Connection error (${errorCode}). ${retries < MAX_DOWNLOAD_RETRIES ? 'Retrying...' : 'Failed'}`,
          barTransformFn: chalk.red,
        });
        
        if (retries < MAX_DOWNLOAD_RETRIES) {
          // Try next CDN subdomain if available
          if (cdnSubdomainIndex < SUBDOMAINS.length - 1) {
            return downloadFile(downloadQueueEntry, retries, cdnSubdomainIndex + 1);
          }
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, DOWNLOAD_RETRY_WAIT_SECONDS));
          return downloadFile(downloadQueueEntry, retries + 1, 0);
        } else {
          // Exceeded max retries
          throw error;
        }
      }
      
      // Handle 500 Internal Server Error - immediately blacklist and abort
      if (status === 500) {
        await addToBlacklist(filePath, fileName);
        safeDoneTask(taskId, {
          message: `Blacklisted (500 error): ${fileName}`,
          barTransformFn: chalk.red,
        });
        setTimeout(() => {
          try {
            downloadBars.removeTask(taskId);
          } catch (e) {
            // Task already removed, ignore
          }
        }, 2000);
        return; // Abort, don't retry
      }
      
      // Try next CDN subdomain if available
      if (cdnSubdomainIndex < SUBDOMAINS.length - 1) {
        safeUpdateTask(taskId, {
          message: `Trying next CDN host...`,
          barTransformFn: chalk.yellow,
        });
        return downloadFile(downloadQueueEntry, retries, cdnSubdomainIndex + 1);
      }

      safeUpdateTask(taskId, {
        message: `Error: ${status || 'Unknown'} - ${error.response?.statusText || 'Unknown'}. Retrying...`,
        barTransformFn: chalk.red,
      });
      try {
        downloadBars.restartTask(taskId, {
          barTransformFn: chalk.blue,
        });
      } catch (e) {
        // Task doesn't exist, ignore
      }
      if (retries < MAX_DOWNLOAD_RETRIES) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, DOWNLOAD_RETRY_WAIT_SECONDS));
        return downloadFile(downloadQueueEntry, retries + 1, 0);
      } else {
        // Exceeded max retries - record failure
        await recordFailure(filePath, fileName);
        throw error;
      }
    } else {
      // Non-Axios error (e.g., file system error, timeout)
      await recordFailure(filePath, fileName);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('stalled');
      
      safeUpdateTask(taskId, {
        message: `Error: ${errorMessage}`,
        barTransformFn: chalk.red,
      });
      
      // For timeout/stall errors, retry if we haven't exceeded max retries
      if (isTimeout && retries < MAX_DOWNLOAD_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, DOWNLOAD_RETRY_WAIT_SECONDS));
        return downloadFile(downloadQueueEntry, retries + 1, 0);
      }
      
      throw error;
    }
  }
}

interface DownloadResult {
  completed: number;
  failed: DownloadQueueEntry[];
}

async function downloadFiles(downloadQueue: DownloadQueueEntry[], totalFiles: number, completedSoFar: number): Promise<DownloadResult> {
  const queue = new AsyncQueue({ limit: MAX_CONCURRENT_DOWNLOADS });
  const failedDownloads: DownloadQueueEntry[] = [];
  
  return new Promise<DownloadResult>((resolve, reject) => {
    let completedDownloads = completedSoFar;
  
    for (const downloadTask of downloadQueue) {
      queue.push(async () => downloadFile(downloadTask).then(() => {
        completedDownloads++;
        downloadBars.updateTask(overallProgressBarId, {
          percentage: completedDownloads / totalFiles,
          message: `${completedDownloads}/${totalFiles} Files`,
        });
      }).catch(async error => {
        // Don't log individual errors during download, we'll retry later
        // Just track the failure
        failedDownloads.push(downloadTask);
        safeUpdateTask(downloadTask.taskId, {
          message: `Error: ${error instanceof Error ? error.message : String(error)}`,
          barTransformFn: chalk.red,
        });
        // Remove the task after a short delay to avoid clutter
        setTimeout(() => {
          try {
            downloadBars.removeTask(downloadTask.taskId);
          } catch (e) {
            // Ignore
          }
        }, 2000);
      }));
    }
  
    queue.on('done', () => {
      resolve({ completed: completedDownloads, failed: failedDownloads });
    }).on('reject', e => reject(e));
  });
}

const MAX_RETRY_PASSES = 3;

async function downloadAllWithRetries(downloadQueue: DownloadQueueEntry[]): Promise<void> {
  const totalFiles = downloadQueue.length;
  let currentQueue = downloadQueue;
  let completedTotal = 0;
  let passNumber = 0;

  while (currentQueue.length > 0 && passNumber < MAX_RETRY_PASSES) {
    passNumber++;
    
    if (passNumber > 1) {
      console.log(chalk.yellow(`\nRetry pass ${passNumber - 1}: Retrying ${currentQueue.length} failed download(s)...`));
      // Wait a bit before retry pass to let the server recover
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    const result = await downloadFiles(currentQueue, totalFiles, completedTotal);
    completedTotal = result.completed;
    
    // Filter out blacklisted files from retry queue
    currentQueue = result.failed.filter(task => !blacklist.has(task.filePath));
    
    if (currentQueue.length > 0 && passNumber < MAX_RETRY_PASSES) {
      console.log(chalk.yellow(`${currentQueue.length} download(s) failed, will retry...`));
    }
  }

  // After all retries, blacklist any remaining failed items
  if (currentQueue.length > 0) {
    console.log(chalk.red(`\n${currentQueue.length} download(s) failed after ${MAX_RETRY_PASSES} passes, adding to blacklist:`));
    for (const task of currentQueue) {
      console.log(chalk.red(`  - ${task.fileName}`));
      await addToBlacklist(task.filePath, task.fileName);
    }
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[\/\\\?%*:|"<>]/g, '_');
}

// Get temp file path for downloading
function getTempPath(filePath: string): string {
  return filePath + '.downloading';
}

// Clean up leftover temp files from previous failed downloads
async function cleanupTempFiles(directory: string): Promise<number> {
  let cleanedCount = 0;
  try {
    const files = await fs.readdir(directory);
    for (const file of files) {
      if (file.endsWith('.downloading')) {
        try {
          await fs.remove(path.join(directory, file));
          cleanedCount++;
        } catch (e) {
          // Ignore errors
        }
      }
    }
  } catch (e) {
    // Directory might not exist yet, ignore
  }
  return cleanedCount;
}

// Check if file exists, including compressed versions (jxl for images, av1 for videos)
async function fileExistsOrCompressed(filePath: string): Promise<boolean> {
  // Check original file
  if (await fs.pathExists(filePath)) {
    return true;
  }
  
  const ext = path.extname(filePath).toLowerCase();
  const basePath = filePath.slice(0, -ext.length);
  
  // Check for JPEG XL version of images
  if (['.jpg', '.jpeg'].includes(ext)) {
    if (await fs.pathExists(basePath + '.jxl')) {
      return true;
    }
  }
  
  // Check for AV1 re-encoded version of videos
  if (ext === '.mp4') {
    if (await fs.pathExists(basePath + '_av1.mp4')) {
      return true;
    }
  }
  
  return false;
}

(async () => {
  try {
    let offset = 0;
    let hasMorePosts = true;
    const posts: Post[] = [];

    await fs.ensureDir(OUTPUT_DIR);
    
    // Clean up any leftover temp files from previous failed downloads
    const cleanedTempFiles = await cleanupTempFiles(OUTPUT_DIR);
    if (cleanedTempFiles > 0) {
      console.log(chalk.yellow(`Cleaned up ${cleanedTempFiles} incomplete download(s) from previous run`));
    }
    
    // Load blacklist on startup
    await loadBlacklist();

    console.log(chalk.cyan(`Starting to fetch posts for ${service}/${userId}...`));

    const seenPostIds = new Set<string>();
    
    while (hasMorePosts) {
      try {
        const result = await fetchPosts(offset);
        const fetchedPosts = result.posts;
        
        if (!fetchedPosts || fetchedPosts.length === 0) {
          hasMorePosts = false;
          break;
        }

        // Check for duplicates to detect when we've reached the end
        let newPosts = 0;
        for (const post of fetchedPosts) {
          if (!seenPostIds.has(post.id)) {
            seenPostIds.add(post.id);
            posts.push(post);
            newPosts++;
          }
        }

        // If we got no new posts, we've reached the end (API is looping or we've seen everything)
        if (newPosts === 0) {
          console.log(chalk.yellow(`No new posts found at offset ${offset}, reached end`));
          hasMorePosts = false;
          break;
        }

        // If we got very few new posts (less than 10% of the batch), likely reaching the end
        const duplicateRatio = (fetchedPosts.length - newPosts) / fetchedPosts.length;
        if (duplicateRatio > 0.9 && posts.length > 100) {
          console.log(chalk.yellow(`High duplicate ratio (${(duplicateRatio * 100).toFixed(1)}%), likely reached end`));
          hasMorePosts = false;
          break;
        }

        console.log(chalk.cyan(`Total posts so far: ${posts.length} (${newPosts} new, ${fetchedPosts.length - newPosts} duplicates)`));
        
        // Stop if we got fewer posts than PAGE_SIZE (reached actual end)
        if (fetchedPosts.length < PAGE_SIZE) {
          console.log(chalk.yellow(`Got fewer than ${PAGE_SIZE} posts, reached end`));
          hasMorePosts = false;
          break;
        }
        
        // Safety limit: stop if we've fetched more than the max posts limit
        const maxPostsLimit = maxPosts > 0 ? maxPosts : 5000;
        if (posts.length >= maxPostsLimit) {
          console.log(chalk.yellow(`Reached limit of ${maxPostsLimit} posts, stopping`));
          hasMorePosts = false;
          break;
        }
        
        // If we've been fetching for a while and still getting new posts, 
        // check if we should continue (maybe add a max offset limit)
        if (offset >= 10000) {
          console.log(chalk.yellow(`Reached maximum offset of 10000, stopping`));
          hasMorePosts = false;
          break;
        }
        
        offset += PAGE_SIZE;
        
        // Add small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(chalk.red(`Failed to fetch posts at offset ${offset}:`), error);
        hasMorePosts = false;
        break;
      }
    }

    console.log(chalk.yellow(`Loaded ${posts.length} posts.`));

    const downloadQueue: DownloadQueueEntry[] = [];
    let taskCounter = 0;
    for (const post of posts) {
      const postFiles: File[] = post.attachments.slice();
      if (post.file?.path && !postFiles.some(att => att.path === post.file.path)) {
        postFiles.push(post.file);
      }

      for (const file of postFiles) {
        // Skip if blacklisted
        if (blacklist.has(file.path)) {
          continue;
        }
        
        const sanitizedFileName = sanitizeFileName(file.name);
        const filePath = path.join(OUTPUT_DIR, sanitizedFileName);
        downloadQueue.push({
          filePath: file.path,
          fileName: file.name,
          outputPath: filePath,
          postId: post.id,
          taskId: `dl-${++taskCounter}`, // Unique task ID to prevent progress bar collisions
        });
      }
    }

    downloadBars.addTask(overallProgressBarId, {
      type: 'percentage',
      barTransformFn: chalk.yellow,
      message: 'Starting downloads...',
    });
    await downloadAllWithRetries(downloadQueue);
    downloadBars.done(overallProgressBarId, {
      message: 'All files downloaded.',
      barTransformFn: chalk.green,
    });
    downloadBars.close();
    
    // Save blacklist one final time before exiting
    await saveBlacklist();
    
    // Save last updated timestamp
    const lastUpdatedPath = path.join(OUTPUT_DIR, 'lastupdated.txt');
    const now = new Date();
    const humanReadableDate = now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
    await fs.writeFile(lastUpdatedPath, humanReadableDate, 'utf8');
    console.log(chalk.green(`Last updated timestamp saved: ${humanReadableDate}`));
    
    if (blacklist.size > 0) {
      console.log(chalk.yellow(`\nBlacklist: ${blacklist.size} item(s) are blacklisted and will be skipped in future runs.`));
    }
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
