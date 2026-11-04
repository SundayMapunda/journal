import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Server-only: this file uses your secret R2 keys. Never import it in a client component.

const bucket = process.env.R2_BUCKET_NAME!;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB (photos are shrunk in the browser first)
export const MAX_PHOTOS_PER_ENTRY = 4;

// A link the browser can use to upload one file directly to R2. Valid for 5 minutes.
export async function presignUpload(key: string, contentType: string) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: 300 }
  );
}

// A temporary link to view a private photo. Valid for 1 hour.
export async function presignView(key: string) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 3600,
  });
}

// Checks that a file really exists in R2 and returns its true size and type.
export async function headObject(key: string) {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: res.ContentLength ?? 0, type: res.ContentType ?? "" };
  } catch {
    return null;
  }
}

export async function deleteObjects(keys: string[]) {
  if (keys.length === 0) return;
  try {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      })
    );
  } catch {
    // Not critical: a leftover file in the bucket doesn't break the app.
  }
}
