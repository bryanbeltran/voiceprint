import type { CorpusSampleInput, CorpusSourceFormat, RegisterName } from "../domain";

export function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("Unable to read file")));
    reader.readAsText(file);
  });
}

export interface CorpusFileReadResult {
  samples: CorpusSampleInput[];
  skipped: string[];
}

function formatForFile(file: Pick<File, "name" | "type">): CorpusSourceFormat {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "html" || extension === "htm" || file.type === "text/html") return "html";
  if (extension === "json" || file.type === "application/json") return "json";
  if (extension === "txt" || file.type === "text/plain") return "plain-text";
  return "unknown";
}

function registerForPath(path: string): RegisterName {
  const value = path.toLowerCase();
  if (/email|mail|inbox/.test(value)) return "email";
  if (/chat|slack|discord|sms|message|dm/.test(value)) return "chat";
  if (/public|social|blog|post|linkedin|twitter/.test(value)) return "public";
  if (/technical|tech|docs|readme|code|engineering|api/.test(value)) return "technical";
  return "default";
}

function stripHtml(value: string): string {
  if (typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(value, "text/html");
    document.querySelectorAll("script,style,noscript,template").forEach((element) => element.remove());
    return document.body?.textContent || document.documentElement.textContent || "";
  }
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function jsonText(value: unknown): string[] {
  const results: string[] = [];
  const visit = (node: unknown, key = ""): void => {
    if (typeof node === "string") {
      const normalized = node.trim();
      if (normalized.length >= 20 && !/^(?:https?:\/\/|urn:|[\da-f-]{8,})/i.test(normalized)) results.push(normalized);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, key));
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.content === "string") visit(record.content, "content");
    else if (typeof record.text === "string") visit(record.text, "text");
    else if (typeof record.body === "string") visit(record.body, "body");
    Object.entries(record).forEach(([childKey, child]) => {
      if (!["content", "text", "body"].includes(childKey)) visit(child, childKey);
    });
  };
  visit(value);
  return [...new Set(results)];
}

function parseJson(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    return jsonText(parsed).join("\n\n");
  } catch {
    return "";
  }
}

export function parseCorpusFileText(value: string, format: CorpusSourceFormat): string {
  if (format === "html") return stripHtml(value).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (format === "json") return parseJson(value).trim();
  return value.trim();
}

export async function readFilesAsCorpusSamples(files: FileList | File[]): Promise<CorpusFileReadResult> {
  const fileList = Array.from(files);
  const samples: CorpusSampleInput[] = [];
  const skipped: string[] = [];
  for (const file of fileList) {
    const format = formatForFile(file);
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (format === "unknown") {
      skipped.push(path);
      continue;
    }
    const text = parseCorpusFileText(await readFileAsText(file), format);
    if (!text.trim()) {
      skipped.push(path);
      continue;
    }
    samples.push({
      id: `file-${path}`,
      label: path,
      sourcePath: path,
      format,
      register: registerForPath(path),
      text
    });
  }
  return { samples, skipped };
}

export { formatForFile, registerForPath, stripHtml, jsonText };
