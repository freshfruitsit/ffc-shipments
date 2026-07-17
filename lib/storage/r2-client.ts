import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 is S3-API-compatible, so the standard AWS SDK works
 * against it unchanged — only the endpoint differs (R2's own per-account
 * URL instead of an AWS region endpoint). `forcePathStyle` is required
 * for R2 (and most non-AWS S3-compatible providers).
 *
 * `server-only` guards against ever importing this into client code —
 * these credentials must never reach the browser.
 */
/**
 * .trim() defends against a real failure mode: a copy-pasted env var value
 * picking up a trailing newline or stray whitespace in whatever UI it was
 * entered through. An R2 bucket name (or any of these) with an embedded
 * "\n" silently corrupts every URL built from it — R2 returns nothing
 * usable, and the browser reports it as a CORS failure since a malformed/
 * non-matching resource doesn't send back proper CORS headers either,
 * which makes the REAL cause much harder to spot than it should be.
 */
function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getR2Client(): S3Client {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: true,
  });
}

export function getR2BucketName(): string {
  return requireEnv("R2_BUCKET_NAME");
}
