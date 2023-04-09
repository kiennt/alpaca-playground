import * as dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import { Client, sleep } from "./poe";

const BATCH = 0;
const FLUSH_TIME = 5000;
const BOTS = process.env.BOT_NAMES?.split(",");
const CONCURRENT = 3;

async function translate(item: any, bot: string) {
  const client = new Client(bot);
  return await client.ask(JSON.stringify(item));
}

class AsyncWorker<T> {
  messages: T[] = [];
  fn: (message: T) => Promise<void>;

  constructor(messages: T[], fn: (message: T) => Promise<void>) {
    this.messages = messages;
    this.fn = fn;
  }

  send(message: T) {
    this.messages.push(message);
  }

  async run() {
    while (true) {
      const message = this.messages.shift();
      if (!message) return;
      await this.fn(message);
      await sleep(1);
    }
  }
}

class AsyncWriter<T> {
  input: T[] = [];
  output: T[] = [];
  filePath: string;

  constructor(input: T[], output: T[], filePath: string) {
    this.input = input;
    this.output = output;
    this.filePath = filePath;
  }

  async run() {
    while (true) {
      if (this.output.length > 0) {
        console.log("flush items", this.output.length, this.output);
        let result = [];
        try {
          result = JSON.parse(fs.readFileSync(this.filePath).toString());
        } catch {}

        const newResult = result.concat(this.output);
        fs.writeFileSync(this.filePath, JSON.stringify(newResult), {
          flag: "w",
        });
        // clear the output
        this.output.length = 0;
      }
      if (this.input.length === 0) return;
      await sleep(FLUSH_TIME);
    }
  }
}

function getCrawledIds(outputPath: string) {
  const ids = new Set();
  try {
    const result = JSON.parse(fs.readFileSync(outputPath).toString());
    result.forEach((item: any) => {
      ids.add(item.id);
    });
  } catch {}
  return ids;
}

async function startApp() {
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  const dataPath = path.join(__dirname, "..", "data");
  const inputPath = path.join(dataPath, `${BATCH}.json`);
  const items = JSON.parse(fs.readFileSync(inputPath).toString());

  const outputPath = path.join(dataPath, `${BATCH}_vi.json`);
  const ids = getCrawledIds(outputPath);
  // skip item we already crawled
  const input = items.filter((item: any) => !ids.has(item.id));
  const output: any[] = [];
  const writer = new AsyncWriter(input, output, outputPath);
  const bots = BOTS.slice(0, CONCURRENT).map(
    (name) =>
      new AsyncWorker<any>(input, async (message) => {
        console.log("bot", name, "process message", message.instruction);
        try {
          while (true) {
            const translatedMessage = await translate(message, name);
            output.push(JSON.parse(translatedMessage));
            return;
          }
        } catch (e) {
          console.log("bot", name, "got error", e);
        }
      })
  );

  const runners = [writer.run()];
  for (const bot of bots) {
    runners.push(bot.run());
  }
  await Promise.all(runners);
}

(async function () {
  await startApp();
})();
