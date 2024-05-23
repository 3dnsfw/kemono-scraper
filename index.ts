import axios, { isAxiosError } from 'axios';
import fs from 'fs-extra';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { MultiProgressBars } from 'multi-progress-bars';
import chalk from 'chalk';

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
  url: string;
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
    description: 'The host to scrape from',
    choices: ['kemono.su', 'coomer.su'],
    default: 'kemono.su',
  })
  .option('cdnHost', {
    alias: 'c',
    type: 'string',
    description: 'The CDN host for downloading files',
    choices: ['c1.kemono.su', 'c6.coomer.su'],
    default: 'c1.kemono.su',
  })
  .option('outputDir', {
    alias: 'o',
    type: 'string',
    description: 'The output directory for downloads',
    default: 'downloads-%username%',
  })
  .help()
  .alias('help', 'help').argv;

const { service, userId, host, cdnHost, outputDir } = argv;

const API_URL = `https://${host}/api/v1/${service}/user/${userId}`;
const DOWNLOAD_URL = `https://${cdnHost}/data`;
// Replace %username% in the output directory with the actual user ID
const OUTPUT_DIR = outputDir.replace('%username%', userId);
const PAGE_SIZE = 50;
const MAX_CONCURRENT_DOWNLOADS = 5;
const MAX_DOWNLOAD_RETRIES = 3;
const DOWNLOAD_RETRY_WAIT_SECONDS = 5000;

const downloadBars = new MultiProgressBars({
  initMessage: 'Downloads',
  anchor: 'bottom',
  persist: true,
});

const overallProgressBarId = 'Overall Progress';
downloadBars.addTask(overallProgressBarId, {
  type: 'percentage',
  barTransformFn: chalk.yellow,
});

async function fetchPosts(offset: number = 0): Promise<Post[]> {
  const url = `${API_URL}?o=${offset}`;
  const response = await axios.get(url);
  return response.data;
}

async function downloadFile(downloadQueueEntry: DownloadQueueEntry, retries = 0): Promise<void> {
  const { url, outputPath, postId } = downloadQueueEntry;
  try {
    if (await fs.pathExists(outputPath)) {
      downloadBars.done(postId, {
        message: `File already exists ${outputPath}`,
        barTransformFn: chalk.green,
      });
      setTimeout(() => {
        downloadBars.removeTask(postId);
      }, 2000);
      return;
    }

    const response = await axios.get(url, {
      responseType: 'stream',
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
      writer.on('error', reject);
    });
  } catch (error) {
    if (isAxiosError(error)) {
      downloadBars.updateTask(postId, {
        message: `Error: ${error.response?.status} - ${error.response?.statusText}. Retrying...`,
        barTransformFn: chalk.red,
      });
      downloadBars.restartTask(postId, {
        barTransformFn: chalk.blue,
      });
      if (retries < MAX_DOWNLOAD_RETRIES) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, DOWNLOAD_RETRY_WAIT_SECONDS));
        return downloadFile(downloadQueueEntry, retries + 1);
      } else {
        // Exceeded max retries
        throw error;
      }
    }
  }
}

async function downloadFiles(downloadQueue: DownloadQueueEntry[]) {
  let completedDownloads = 0;
  const totalFiles = downloadQueue.length;
  const activeDownloads: Promise<void>[] = [];

  for (const downloadTask of downloadQueue) {
    downloadBars.addTask(downloadTask.postId, {
      type: 'percentage',
      message: 'Starting...',
      barTransformFn: chalk.blue,
    });

    if (activeDownloads.length >= MAX_CONCURRENT_DOWNLOADS) {
      await Promise.race(activeDownloads);
    }

    const downloadPromise = downloadFile(downloadTask)
      .then(() => {
        const index = activeDownloads.indexOf(downloadPromise);
        if (index !== -1) {
          activeDownloads.splice(index, 1);
        }
        completedDownloads++;
        downloadBars.updateTask(overallProgressBarId, {
          percentage: completedDownloads / totalFiles,
          message: `${completedDownloads}/${totalFiles} Files`,
        });
      })
      .catch(error => {
        console.error(`Failed to download ${downloadTask.url}:`, error);
        downloadBars.updateTask(downloadTask.postId, {
          message: `Error: ${error}`,
          barTransformFn: chalk.red,
        });
      });

    activeDownloads.push(downloadPromise);
  }

  await Promise.all(activeDownloads);
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[\/\\\?%*:|"<>]/g, '_');
}

try {
  let offset = 0;
  let hasMorePosts = true;
  const posts: Post[] = [];

  await fs.ensureDir(OUTPUT_DIR);

  while (hasMorePosts) {
    const fetchedPosts = await fetchPosts(offset);
    if (fetchedPosts.length === 0) {
      hasMorePosts = false;
      break;
    }

    posts.push(...fetchedPosts);
    offset += PAGE_SIZE;
  }

  console.log(chalk.yellow(`Loaded ${posts.length} posts.`));

  // aggregate files
  const files: File[] = posts.reduce((allFiles, post) => {
    const postFiles = post.attachments.slice();
    // add post.file if it's set and not already in there
    if (post?.file?.path && !postFiles.some(att => att.path === post.file.path)) {
      postFiles.push(post.file);
    }
    return [...allFiles, ...postFiles];
  }, [] as File[]);

  const downloadQueue: DownloadQueueEntry[] = [];

  for (const post of posts) {
    const postFiles: File[] = post.attachments.slice();
    if (post.file?.path && !postFiles.some(att => att.path === post.file.path)) {
      postFiles.push(post.file);
    }

    for (const file of postFiles) {
      const sanitizedFileName = sanitizeFileName(file.name);
      const filePath = path.join(OUTPUT_DIR, sanitizedFileName);
      downloadQueue.push({
        url: `${DOWNLOAD_URL}${file.path}?f=${encodeURIComponent(file.name)}`,
        outputPath: filePath,
        postId: post.id,
      });
    }
  }

  downloadBars.updateTask(overallProgressBarId, {
    message: 'Starting downloads...',
  });
  await downloadFiles(downloadQueue);
  downloadBars.done(overallProgressBarId, {
    message: 'All files downloaded.',
    barTransformFn: chalk.green,
  });
  downloadBars.close();
} catch (error) {
  console.error(chalk.red(error));
}
