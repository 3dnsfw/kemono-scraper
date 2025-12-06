import axios, { isAxiosError } from 'axios';
import fs from 'fs-extra';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { MultiProgressBars } from 'multi-progress-bars';
import chalk from 'chalk';
import { AsyncQueue } from "@tanuel/async-queue";

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
  .alias('help', 'help').argv;

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
  const { filePath, fileName, outputPath, postId } = downloadQueueEntry;
  
  // Check if this asset is blacklisted
  if (blacklist.has(filePath)) {
    downloadBars.addTask(postId, {
      type: 'percentage',
      message: 'Blacklisted (skipping)',
      barTransformFn: chalk.yellow,
    });
    downloadBars.done(postId, {
      message: `Skipped (blacklisted): ${fileName}`,
      barTransformFn: chalk.yellow,
    });
    setTimeout(() => {
      downloadBars.removeTask(postId);
    }, 2000);
    return;
  }
  
  downloadBars.addTask(postId, {
    type: 'percentage',
    message: 'Starting...',
    barTransformFn: chalk.blue,
  });
  try {
    if (await fileExistsOrCompressed(outputPath)) {
      downloadBars.done(postId, {
        message: `File already exists ${outputPath}`,
        barTransformFn: chalk.green,
      });
      setTimeout(() => {
        downloadBars.removeTask(postId);
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

    const response = await axios.get(downloadUrl, {
      responseType: 'stream',
      timeout: 30000,
      onDownloadProgress: progressEvent => {
        if (progressEvent.total) {
          // can calculate percentage
          downloadBars.updateTask(postId, {
            percentage: progressEvent.loaded / progressEvent.total,
            message: chalk.blue(`Downloading`),
          });
        } else {
          downloadBars.updateTask(postId, {
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
      downloadBars.done(postId, {
        message: `Blacklisted (500 error): ${fileName}`,
        barTransformFn: chalk.red,
      });
      setTimeout(() => {
        downloadBars.removeTask(postId);
      }, 2000);
      return;
    }

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        downloadBars.done(postId, {
          message: `Downloaded as ${outputPath}`,
          barTransformFn: chalk.green,
        });
        setTimeout(() => {
          downloadBars.removeTask(postId);
        }, 2000);
        resolve();
      });
      writer.on('error', async (err) => {
        // Record failure for file system errors
        await recordFailure(filePath, fileName);
        reject(err);
      });
    });
  } catch (error) {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      
      // Handle 500 Internal Server Error - immediately blacklist and abort
      if (status === 500) {
        await addToBlacklist(filePath, fileName);
        downloadBars.done(postId, {
          message: `Blacklisted (500 error): ${fileName}`,
          barTransformFn: chalk.red,
        });
        setTimeout(() => {
          downloadBars.removeTask(postId);
        }, 2000);
        return; // Abort, don't retry
      }
      
      // Try next CDN subdomain if available
      if (cdnSubdomainIndex < SUBDOMAINS.length - 1) {
        downloadBars.updateTask(postId, {
          message: `Trying next CDN host...`,
          barTransformFn: chalk.yellow,
        });
        return downloadFile(downloadQueueEntry, retries, cdnSubdomainIndex + 1);
      }

      downloadBars.updateTask(postId, {
        message: `Error: ${status || 'Unknown'} - ${error.response?.statusText || 'Unknown'}. Retrying...`,
        barTransformFn: chalk.red,
      });
      downloadBars.restartTask(postId, {
        barTransformFn: chalk.blue,
      });
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
      // Non-Axios error (e.g., file system error)
      await recordFailure(filePath, fileName);
      throw error;
    }
  }
}

async function downloadFiles(downloadQueue: DownloadQueueEntry[]) {
  const queue = new AsyncQueue({ limit: MAX_CONCURRENT_DOWNLOADS });
  return new Promise<void>((resolve, reject) => {
    let completedDownloads = 0;
    const totalFiles = downloadQueue.length;
  
    for (const downloadTask of downloadQueue) {
      queue.push(async () => downloadFile(downloadTask).then(() => {
        completedDownloads++;
        downloadBars.updateTask(overallProgressBarId, {
          percentage: completedDownloads / totalFiles,
          message: `${completedDownloads}/${totalFiles} Files`,
        });
      }).catch(async error => {
        console.error(`Failed to download ${downloadTask.fileName}:`, error);
        // Record failure (this will also check if we should blacklist)
        await recordFailure(downloadTask.filePath, downloadTask.fileName);
        downloadBars.updateTask(downloadTask.postId, {
          message: `Error: ${error}`,
          barTransformFn: chalk.red,
        });
      }));
    }
  
    queue.on('done', () => {
      resolve();
    }).on('reject', e => reject(e));
  });
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[\/\\\?%*:|"<>]/g, '_');
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
        });
      }
    }

    downloadBars.addTask(overallProgressBarId, {
      type: 'percentage',
      barTransformFn: chalk.yellow,
      message: 'Starting downloads...',
    });
    await downloadFiles(downloadQueue);
    downloadBars.done(overallProgressBarId, {
      message: 'All files downloaded.',
      barTransformFn: chalk.green,
    });
    downloadBars.close();
    
    // Save blacklist one final time before exiting
    await saveBlacklist();
    
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
