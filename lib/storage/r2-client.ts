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
function requireEnv(name: string): string {
  const value = process.env[name];
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
