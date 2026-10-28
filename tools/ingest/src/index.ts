import * as fs from "fs";
import * as path from "path";

interface Question {
  id?: number;
  title: string;
  content: string;
  topic: string;
  sourceUrl: string;
}

/** Recursively collect file paths */
function walkDir(dir: string, list: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(full, list);
    else list.push(full);
  }
  return list;
}

/** Turn a local file path into the raw GitHub URL */
function rawUrl(filePath: string): string {
  const rel = path.relative(
    path.resolve(__dirname, "..", "data", "aptitude-questions"),
    filePath,
  );
  return `https://raw.githubusercontent.com/drsarveshwarbharti/Aptitude-For-Placements/main/${rel.replace(/\\/g, "/")}`;
}

/** Parse a question file – first line = title, rest = details */
function parseFile(filePath: string, topic: string): Question {
  const txt = fs.readFileSync(filePath, "utf-8").trimEnd();
  const lines = txt.split(/\r?\n/);
  const title = lines[0].trim();
  const content = lines.slice(1).join("\n").trim();
  return { title, content, topic, sourceUrl: rawUrl(filePath) };
}

/** Main ingestion routine */
function ingest() {
  const base = path.resolve(__dirname, "..", "data", "aptitude-questions");
  const files = walkDir(base);
  const questions: Question[] = [];
  for (const f of files) {
    if (path.basename(f).startsWith('.')) continue;
    const topic = path.relative(base, f).split(path.sep)[0];
    questions.push(parseFile(f, topic));
  }
  const outPath = path.join(base, "questions.json");
  fs.writeFileSync(outPath, JSON.stringify(questions, null, 2), "utf-8");
  console.log(`✅ ${questions.length} questions written to ${outPath}`);
}

if (require.main === module) ingest();
