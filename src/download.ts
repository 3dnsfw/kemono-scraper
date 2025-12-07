import axios, { isAxiosError } from 'axios';
import chalk from 'chalk';
import fs from 'fs-extra';
import { AsyncQueue } from '@tanuel/async-queue';
import {
  DOWNLOAD_RETRY_WAIT_SECONDS,
  MAX_DOWNLOAD_RETRIES,
  MAX_RETRY_PASSES,
  REQUEST_TIMEOUT_MS,
  STREAM_TIMEOUT_MS,
} from './constants';
import { addToBlacklist, fileExistsOrCompressed, getTempPath, recordFailure, safeDoneTask, safeUpdateTask } from './files';
import { buildProxyAxiosOptions, recordProxyOutcome } from './context';
import type {
  DownloadAllResult,
  DownloadQueueEntry,
  DownloadResult,
  ScraperContext,
} from './types';

let globalTaskCounter = 0;

export async function downloadFile(
  ctx: ScraperContext,
  downloadQueueEntry: DownloadQueueEntry,
  retries = 0,
  cdnSubdomainIndex = 0
): Promise<void> {
  const { filePath, fileName, outputPath, taskId } = downloadQueueEntry;

  if (ctx.blacklist.has(filePath)) {
    ctx.downloadBars.addTask(taskId, {
      type: 'percentage',
      message: 'Blacklisted (skipping)',
      barTransformFn: chalk.yellow,
    });
    safeDoneTask(ctx, taskId, {
      message: `Skipped (blacklisted): ${fileName}`,
      barTransformFn: chalk.yellow,
    });
    setTimeout(() => {
      try {
        ctx.downloadBars.removeTask(taskId);
      } catch {
        // Task already removed, ignore
      }
    }, 2000);
    return;
  }

  ctx.downloadBars.addTask(taskId, {
    type: 'percentage',
    message: 'Starting...',
    barTransformFn: chalk.blue,
  });

  let proxySelection = null;
  let proxyOptions: Record<string, unknown> = {};
  try {
    if (await fileExistsOrCompressed(outputPath)) {
      safeDoneTask(ctx, taskId, {
        message: `File already exists ${outputPath}`,
        barTransformFn: chalk.green,
      });
      setTimeout(() => {
        try {
          ctx.downloadBars.removeTask(taskId);
        } catch {
          // Task already removed, ignore
        }
      }, 2000);
      return;
    }

    let downloadUrl: string;
    if (cdnSubdomainIndex < ctx.subdomains.length) {
      const subdomain = ctx.subdomains[cdnSubdomainIndex];
      const cdnHost = `${subdomain}.${ctx.baseDomain}`;
      downloadUrl = `https://${cdnHost}/data${filePath}?f=${encodeURIComponent(fileName)}`;
    } else {
      downloadUrl = `https://${ctx.baseDomain}/data${filePath}?f=${encodeURIComponent(fileName)}`;
    }

    const tempPath = getTempPath(outputPath);
    try {
      if (await fs.pathExists(tempPath)) {
        await fs.remove(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }

    const proxyResult = buildProxyAxiosOptions(ctx, downloadUrl);
    proxySelection = proxyResult.selection;
    proxyOptions = proxyResult.options;

    const requestController = new AbortController();
    const requestTimeout = setTimeout(() => {
      requestController.abort();
    }, REQUEST_TIMEOUT_MS);

    let response;
    try {
      response = await axios.get(downloadUrl, {
        responseType: 'stream',
        timeout: REQUEST_TIMEOUT_MS,
        signal: requestController.signal,
        ...proxyOptions,
        onDownloadProgress: progressEvent => {
          if (progressEvent.total) {
            safeUpdateTask(ctx, taskId, {
              percentage: progressEvent.loaded / progressEvent.total,
              message: chalk.blue('Downloading'),
            });
          } else {
            safeUpdateTask(ctx, taskId, {
              percentage: progressEvent.loaded ? 100 : 0,
              message: chalk.blue('Downloading'),
            });
          }
        },
      });
    } finally {
      clearTimeout(requestTimeout);
    }
    recordProxyOutcome(ctx, proxySelection);

    if (response.status === 500) {
      await addToBlacklist(ctx, filePath, fileName);
      safeDoneTask(ctx, taskId, {
        message: `Blacklisted (500 error): ${fileName}`,
        barTransformFn: chalk.red,
      });
      setTimeout(() => {
        try {
          ctx.downloadBars.removeTask(taskId);
        } catch {
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

    const streamPromise = new Promise<void>((resolve, reject) => {
      let isResolved = false;
      let isRejected = false;
      let lastProgress = Date.now();

      const safeReject = async (err: Error, errorMessage: string) => {
        if (isResolved || isRejected) return;
        isRejected = true;

        streamError = err;

        try {
          response.data.unpipe(writer);
        } catch {
          // Ignore unpipe errors
        }

        try {
          if (!writer.destroyed) {
            writer.destroy();
          }
        } catch {
          // Ignore destroy errors
        }

        try {
          if (await fs.pathExists(tempPath)) {
            await fs.remove(tempPath);
          }
        } catch {
          // Ignore cleanup errors
        }

        await recordFailure(ctx, filePath, fileName);
        safeUpdateTask(ctx, taskId, {
          message: errorMessage,
          barTransformFn: chalk.red,
        });
        reject(err);
      };

      response.data.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        lastProgress = Date.now();
      });

      response.data.on('error', async (err: Error) => {
        await safeReject(err, `Connection error: ${err.message}`);
      });

      response.data.on('end', () => {
        streamEnded = true;
      });

      response.data.pipe(writer);

      const stallCheckInterval = setInterval(async () => {
        if (isResolved || isRejected) {
          clearInterval(stallCheckInterval);
          return;
        }
        const stallTime = Date.now() - lastProgress;
        if (stallTime > 60000) {
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

        if (streamError) {
          return;
        }

        if (!streamEnded) {
          await safeReject(
            new Error('Download stream ended prematurely'),
            'Download stream ended prematurely'
          );
          return;
        }

        if (expectedSize !== null) {
          try {
            const stats = await fs.stat(tempPath);
            if (stats.size !== expectedSize) {
              await safeReject(
                new Error(`Download incomplete: expected ${expectedSize} bytes, got ${stats.size}`),
                `Download incomplete: expected ${expectedSize} bytes, got ${stats.size}`
              );
              return;
            }
          } catch {
            // Can't verify, assume OK
          }
        }

        if (isResolved || isRejected) return;
        isResolved = true;

        try {
          await fs.rename(tempPath, outputPath);
        } catch (renameError) {
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

        safeDoneTask(ctx, taskId, {
          message: `Downloaded as ${outputPath}`,
          barTransformFn: chalk.green,
        });
        setTimeout(() => {
          try {
            ctx.downloadBars.removeTask(taskId);
          } catch {
            // Task already removed, ignore
          }
        }, 2000);
        resolve();
      });

      writer.on('error', async (err) => {
        clearInterval(stallCheckInterval);
        if (streamError) {
          return;
        }

        if (err.message.includes('write after a stream was destroyed') ||
            err.message.includes('Cannot call write after a stream was destroyed')) {
          return;
        }

        await safeReject(err, `Write error: ${err.message}`);
      });
    });

    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Download timeout after ${STREAM_TIMEOUT_MS / 1000}s`));
      }, STREAM_TIMEOUT_MS);
    });

    return Promise.race([streamPromise, timeoutPromise]);
  } catch (error) {
    recordProxyOutcome(ctx, proxySelection, error);
    const tempPathCleanup = getTempPath(outputPath);
    try {
      if (await fs.pathExists(tempPathCleanup)) {
        await fs.remove(tempPathCleanup);
      }
    } catch {
      // Ignore cleanup errors
    }

    if (isAxiosError(error)) {
      const status = error.response?.status;
      const errorCode = (error as any).code;
      const isAbort = errorCode === 'ERR_CANCELED' || (error as any).name === 'CanceledError' || (error as any).name === 'AbortError';

      if (errorCode === 'ECONNRESET' || errorCode === 'ECONNABORTED' || errorCode === 'ETIMEDOUT' || isAbort) {
        await recordFailure(ctx, filePath, fileName);
        safeUpdateTask(ctx, taskId, {
          message: `Connection error (${errorCode || 'aborted'}). ${retries < MAX_DOWNLOAD_RETRIES ? 'Retrying...' : 'Failed'}`,
          barTransformFn: chalk.red,
        });

        if (retries < MAX_DOWNLOAD_RETRIES) {
          if (cdnSubdomainIndex < ctx.subdomains.length - 1) {
            return downloadFile(ctx, downloadQueueEntry, retries, cdnSubdomainIndex + 1);
          }
          await new Promise(resolve => setTimeout(resolve, DOWNLOAD_RETRY_WAIT_SECONDS));
          return downloadFile(ctx, downloadQueueEntry, retries + 1, 0);
        }
        throw error;
      }

      if (status === 500) {
        await addToBlacklist(ctx, filePath, fileName);
        safeDoneTask(ctx, taskId, {
          message: `Blacklisted (500 error): ${fileName}`,
          barTransformFn: chalk.red,
        });
        setTimeout(() => {
          try {
            ctx.downloadBars.removeTask(taskId);
          } catch {
            // Task already removed, ignore
          }
        }, 2000);
        return;
      }

      if (cdnSubdomainIndex < ctx.subdomains.length - 1) {
        safeUpdateTask(ctx, taskId, {
          message: 'Trying next CDN host...',
          barTransformFn: chalk.yellow,
        });
        return downloadFile(ctx, downloadQueueEntry, retries, cdnSubdomainIndex + 1);
      }

      safeUpdateTask(ctx, taskId, {
        message: `Error: ${status || 'Unknown'} - ${error.response?.statusText || 'Unknown'}. Retrying...`,
        barTransformFn: chalk.red,
      });
      try {
        ctx.downloadBars.restartTask(taskId, {
          barTransformFn: chalk.blue,
        });
      } catch {
        // Task doesn't exist, ignore
      }
      if (retries < MAX_DOWNLOAD_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, DOWNLOAD_RETRY_WAIT_SECONDS));
        return downloadFile(ctx, downloadQueueEntry, retries + 1, 0);
      }

      await recordFailure(ctx, filePath, fileName);
      throw error;
    }

    await recordFailure(ctx, filePath, fileName);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('stalled');

    safeUpdateTask(ctx, taskId, {
      message: `Error: ${errorMessage}`,
      barTransformFn: chalk.red,
    });

    if (isTimeout && retries < MAX_DOWNLOAD_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, DOWNLOAD_RETRY_WAIT_SECONDS));
      return downloadFile(ctx, downloadQueueEntry, retries + 1, 0);
    }

    throw error;
  }
}

export async function downloadFiles(
  ctx: ScraperContext,
  downloadQueue: DownloadQueueEntry[],
  totalFiles: number,
  completedSoFar: number
): Promise<DownloadResult> {
  const queue = new AsyncQueue({ limit: ctx.maxConcurrentDownloads });
  const failedDownloads: DownloadQueueEntry[] = [];

  return new Promise<DownloadResult>((resolve, reject) => {
    let completedDownloads = completedSoFar;

    for (const downloadTask of downloadQueue) {
      queue.push(async () => downloadFile(ctx, downloadTask).then(() => {
        completedDownloads++;
        ctx.downloadBars.updateTask(ctx.overallProgressBarId, {
          percentage: completedDownloads / totalFiles,
          message: `${completedDownloads}/${totalFiles} Files`,
        });
      }).catch(async error => {
        failedDownloads.push(downloadTask);
        safeUpdateTask(ctx, downloadTask.taskId, {
          message: `Error: ${error instanceof Error ? error.message : String(error)}`,
          barTransformFn: chalk.red,
        });
        setTimeout(() => {
          try {
            ctx.downloadBars.removeTask(downloadTask.taskId);
          } catch {
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

export async function downloadAllWithRetries(ctx: ScraperContext, downloadQueue: DownloadQueueEntry[]): Promise<DownloadAllResult> {
  const totalFiles = downloadQueue.length;
  let currentQueue = downloadQueue;
  let completedTotal = 0;
  let passNumber = 0;

  while (currentQueue.length > 0 && passNumber < MAX_RETRY_PASSES) {
    passNumber++;

    if (passNumber > 1) {
      console.log(chalk.yellow(`\nRetry pass ${passNumber - 1}: Retrying ${currentQueue.length} failed download(s)...`));
      await new Promise(resolve => setTimeout(resolve, 5000));

      currentQueue = currentQueue.map(entry => ({
        ...entry,
        taskId: `dl-retry-${passNumber}-${++globalTaskCounter}`,
      }));
    }

    const result = await downloadFiles(ctx, currentQueue, totalFiles, completedTotal);
    completedTotal = result.completed;

    currentQueue = result.failed.filter(task => !ctx.blacklist.has(task.filePath));

    if (currentQueue.length > 0 && passNumber < MAX_RETRY_PASSES) {
      console.log(chalk.yellow(`${currentQueue.length} download(s) failed, will retry...`));
    }
  }

  const finalFailed = currentQueue.length;
  if (finalFailed > 0) {
    console.log(chalk.red(`\n${finalFailed} download(s) failed after ${MAX_RETRY_PASSES} passes, adding to blacklist:`));
    for (const task of currentQueue) {
      console.log(chalk.red(`  - ${task.fileName}`));
      await addToBlacklist(ctx, task.filePath, task.fileName);
    }
  }

  return { completed: completedTotal, failed: finalFailed, total: totalFiles };
}
