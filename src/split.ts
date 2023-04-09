import path from "path";
import fs from "fs";

async function startApp() {
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  const filePath = path.join(__dirname, "..", "data", "alpaca_gpt4_data.json");
  const items = JSON.parse(fs.readFileSync(filePath).toString());
  const size = 10;
  // split items into size files
  for (let i = 0; i < size; i++) {
    const subItems = items
      .slice((i * items.length) / size, ((i + 1) * items.length) / size)
      .map((item: any, index: number) => ({
        id: index,
        ...item,
      }));
    const subFilePath = path.join(__dirname, "..", "data", i + ".json");
    fs.writeFileSync(subFilePath, JSON.stringify(subItems));
  }
}

(async function () {
  await startApp();
})();
