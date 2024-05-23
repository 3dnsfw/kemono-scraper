import axios from "axios";
import fs from "fs-extra";
import path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { SingleBar, Presets } from "cli-progress";

interface Attachment {
  name: string;
  path: string;
}

interface Post {
  id: string;
  user: string;
  service:
    | "patreon"
    | "fanbox"
    | "discord"
    | "fantia"
    | "afdian"
    | "boosty"
    | "gumroad"
    | "subscribestar"
    | "onlyfans"
    | "fansly"
    | "candfans";
  title: string;
  content: string;
  shared_file: boolean;
  added: Date;
  published: Date;
  edited: Date | null;
  file: Attachment;
  attachments: Attachment[];
}

// Define command-line arguments
const argv = yargs(hideBin(process.argv))
  .option("service", {
    alias: "s",
    type: "string",
    description: "The service to scrape from",
    choices: [
      "patreon",
      "fanbox",
      "discord",
      "fantia",
      "afdian",
      "boosty",
      "gumroad",
      "subscribestar",
      "onlyfans",
      "fansly",
      "candfans",
    ],
    demandOption: true,
  })
  .option("userId", {
    alias: "u",
    type: "string",
    description: "The user ID to scrape from",
    demandOption: true,
  })
  .option("host", {
    alias: "h",
    type: "string",
    description: "The host to scrape from",
    choices: ["kemono.su", "coomer.su"],
    default: "kemono.su",
  })
  .option("cdnHost", {
    alias: "c",
    type: "string",
    description: "The CDN host for downloading files",
    choices: ["c1.kemono.su", "c6.coomer.su"],
    default: "c1.kemono.su",
  })
  .help()
  .alias("help", "help").argv;

const { service, userId, host, cdnHost } = argv;

const API_URL = `https://${host}/api/v1/${service}/user/${userId}`;
const DOWNLOAD_URL = `https://${cdnHost}/data`;
const OUTPUT_DIR = "./downloads";
const PAGE_SIZE = 50;

async function fetchPosts(offset: number = 0): Promise<Post[]> {
  const url = `${API_URL}?o=${offset}`;
  const response = await axios.get(url);
  return response.data;
}

async function downloadFile(
  url: string,
  outputPath: string,
  progressBar: SingleBar
): Promise<void> {
  const writer = fs.createWriteStream(outputPath);
  const response = await axios.get(url, { responseType: "stream" });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => {
      progressBar.increment();
      progressBar.update(progressBar.value, {
        status: `Downloaded: ${outputPath}`,
      });
      resolve();
    });
    writer.on("error", reject);
  });
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[\/\\\?%*:|"<>]/g, "_");
}

async function main() {
  let offset = 0;
  let hasMorePosts = true;
  const allPosts: Post[] = [];

  await fs.ensureDir(OUTPUT_DIR);

  while (hasMorePosts) {
    const posts = await fetchPosts(offset);
    if (posts.length === 0) {
      hasMorePosts = false;
      break;
    }

    allPosts.push(...posts);
    offset += PAGE_SIZE;
  }

  console.log(`Loaded ${allPosts.length} posts.`);

  const totalAttachments = allPosts.reduce(
    (sum, post) => sum + post.attachments.length,
    0
  );
  console.log(`Total attachments to download: ${totalAttachments}`);

  const progressBar = new SingleBar(
    {
      format:
        "Progress | {bar} | {percentage}% | ETA: {eta}s | {value}/{total} Files | {status}",
    },
    Presets.shades_classic
  );
  progressBar.start(totalAttachments, 0, { status: "Starting..." });

  for (const post of allPosts) {
    for (const attachment of post.attachments) {
      const sanitizedFileName = sanitizeFileName(attachment.name);
      const filePath = path.join(OUTPUT_DIR, sanitizedFileName);
      if (await fs.pathExists(filePath)) {
        progressBar.increment();
        progressBar.update(progressBar.value, {
          status: `File already exists: ${filePath}`,
        });
      } else {
        const encodedName = encodeURIComponent(attachment.name);
        const downloadUrl = `${DOWNLOAD_URL}${attachment.path}?f=${encodedName}`;
        await downloadFile(downloadUrl, filePath, progressBar);
      }
    }
  }

  progressBar.update(totalAttachments, { status: "All files downloaded." });
  progressBar.stop();
}

main().catch(console.error);
