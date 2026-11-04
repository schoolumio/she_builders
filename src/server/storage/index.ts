import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomToken } from "../crypto";
import { db } from "../db";
import { env } from "../env";
import { ValidationError } from "../errors";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type ImageType = { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" };

/** Identify an image by its magic bytes; the browser-supplied MIME type is never trusted. SVG is refused. */
export function sniffImage(buf: Uint8Array): ImageType | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.length >= 12 && String.fromCharCode(...buf.slice(0, 4)) === "RIFF" && String.fromCharCode(...buf.slice(8, 12)) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

interface StorageDriver {
  putPublic(key: string, body: Buffer, contentType: string): Promise<string>;
}

const LOCAL_ROOT = path.join(process.cwd(), "storage");

class LocalDriver implements StorageDriver {
  async putPublic(key: string, body: Buffer) {
    const file = path.join(LOCAL_ROOT, "public", key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return `/api/files/${key}`;
  }
}

class S3Driver implements StorageDriver {
  private client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  async putPublic(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: `public/${key}`, Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
    const base = (process.env.STORAGE_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
    return `${base}/public/${key}`;
  }
}

/** Keeps images in Postgres. Suited to small demos/staging on hosts without a persistent disk (e.g. Vercel). */
class DatabaseDriver implements StorageDriver {
  async putPublic(key: string, body: Buffer, contentType: string) {
    await db.storedFile.create({ data: { key, contentType, body: new Uint8Array(body), size: body.length } });
    return `/api/files/${key}`;
  }
}

function driver(): StorageDriver {
  if (process.env.STORAGE_DRIVER === "s3") return new S3Driver();
  if (process.env.STORAGE_DRIVER === "database") return new DatabaseDriver();
  if (env.isProduction) throw new Error("STORAGE_DRIVER=s3 (or database) is required in production");
  return new LocalDriver();
}

/** Stores an approved public image (logo, cover, campaign image) and returns its URL. */
export async function storePublicImage(file: File, prefix: string): Promise<string> {
  if (!file || file.size === 0) throw new ValidationError("Choose an image to upload.");
  if (file.size > MAX_IMAGE_BYTES) throw new ValidationError("Images must be 2 MB or smaller.");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffImage(buf);
  if (!type) throw new ValidationError("Upload a PNG, JPEG or WebP image.");
  const key = `${prefix.replace(/[^a-z0-9/_-]/gi, "")}/${randomToken(16)}.${type.ext}`;
  return driver().putPublic(key, buf, type.mime);
}

/** Local and database drivers: read a public file served from /api/files (path traversal safe). */
export async function readLocalPublicFile(key: string): Promise<{ body: Buffer; type: ImageType } | null> {
  if (!/^[a-z0-9/_-]+\.(png|jpg|webp)$/i.test(key) || key.includes("..")) return null;
  if (process.env.STORAGE_DRIVER === "database") {
    const row = await db.storedFile.findUnique({ where: { key } });
    if (!row) return null;
    const body = Buffer.from(row.body);
    const type = sniffImage(body);
    return type ? { body, type } : null;
  }
  try {
    const body = await readFile(path.join(LOCAL_ROOT, "public", key));
    const type = sniffImage(body);
    return type ? { body, type } : null;
  } catch {
    return null;
  }
}
