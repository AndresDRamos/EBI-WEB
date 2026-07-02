import "server-only";
import {
  BlobSASPermissions,
  BlobServiceClient,
  type ContainerClient,
} from "@azure/storage-blob";

/**
 * Azure Blob Storage access for maintenance asset documents (ADR 0002).
 * The database stores metadata + `blob_path` only; bytes live in the
 * `AZURE_STORAGE_CONTAINER_MAINT` container. Downloads are served through
 * short-lived SAS URLs so the container can stay private.
 *
 * Env vars (values in `.env`, never committed):
 *  - AZURE_STORAGE_CONNECTION_STRING — account connection string (must include
 *    the account key; SAS generation needs a shared key credential).
 *  - AZURE_STORAGE_CONTAINER_MAINT — container name for maintenance documents.
 */

const SAS_TTL_MINUTES = 15;

let containerClient: ContainerClient | null = null;

function getContainer(): ContainerClient {
  if (containerClient) return containerClient;
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const container = process.env.AZURE_STORAGE_CONTAINER_MAINT;
  if (!conn || !container) {
    throw new Error(
      "Missing AZURE_STORAGE_CONNECTION_STRING / AZURE_STORAGE_CONTAINER_MAINT",
    );
  }
  containerClient = BlobServiceClient.fromConnectionString(conn)
    .getContainerClient(container);
  return containerClient;
}

/**
 * Container-relative blob key. `document_id` is not known before the metadata
 * row exists, so the key salts with a timestamp instead and the row stores the
 * final key — the DB is the only map from document to blob.
 */
export function buildBlobKey(assetId: number, filename: string): string {
  const safe = filename
    .normalize("NFKD")
    // strip combining diacritics left by NFKD
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(-120);
  return `assets/${assetId}/${Date.now()}-${safe}`;
}

/** Upload file bytes; returns the blob key persisted as `blob_path`. */
export async function uploadDocumentBlob(
  blobPath: string,
  data: Buffer,
  contentType?: string | null,
): Promise<void> {
  const blob = getContainer().getBlockBlobClient(blobPath);
  await blob.uploadData(data, {
    blobHTTPHeaders: contentType
      ? { blobContentType: contentType }
      : undefined,
  });
}

/** Short-lived read-only SAS URL for a stored document. */
export async function getDocumentSasUrl(blobPath: string): Promise<string> {
  const blob = getContainer().getBlockBlobClient(blobPath);
  return blob.generateSasUrl({
    permissions: BlobSASPermissions.parse("r"),
    expiresOn: new Date(Date.now() + SAS_TTL_MINUTES * 60 * 1000),
  });
}
