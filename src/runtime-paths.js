import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(__dirname, "..");
export const IS_SERVERLESS_RUNTIME = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.AWS_EXECUTION_ENV
);

const RUNTIME_ROOT = IS_SERVERLESS_RUNTIME
  ? path.join("/tmp", "ferramentadepesquisa")
  : PROJECT_ROOT;

export const DATA_DIR = path.join(RUNTIME_ROOT, "data");
export const OUTPUT_DIR = path.join(RUNTIME_ROOT, "output");
export const APPROVED_FILES_DIR = path.join(OUTPUT_DIR, "approved-posts");

export function resolveProjectPath(...segments) {
  return path.resolve(PROJECT_ROOT, ...segments);
}

export function resolveDataPath(...segments) {
  return path.resolve(DATA_DIR, ...segments);
}

export function resolveOutputPath(...segments) {
  return path.resolve(OUTPUT_DIR, ...segments);
}
