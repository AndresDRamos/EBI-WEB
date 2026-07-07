import "server-only";
import {
  BlobSASPermissions,
  BlobServiceClient,
  type ContainerClient,
} from "@azure/storage-blob";

/**
 * Azure Blob Storage access (ADR 0002 pattern, generalized for multiple
 * modules). The database stores metadata + blob paths only; bytes live in
 * private containers and downloads go through short-lived SAS URLs.
 *
 * Container names are code constants, NOT env vars (user decision 2026-07-06):
 * they are not secrets, and per-environment separation already comes from the
 * per-environment connection string. The only env input is
 * `AZURE_STORAGE_CONNECTION_STRING` (value in `.env` / Key Vault, never
 * committed; must include the account key — SAS generation needs a shared key
 * credential).
 */

/** The portal's private containers. Provisioned on account `ezistorage`. */
export const BLOB_CONTAINERS = {
  /** Maintenance asset documents (manuals, diagrams, photos — ADR 0002). */
  maintenance: "maintenance",
  /** Production plant-layout / footprint source DXFs (plan plant-layout-foundation). */
  production: "production",
} as const;

export type BlobContainerName =
  (typeof BLOB_CONTAINERS)[keyof typeof BLOB_CONTAINERS];

const SAS_TTL_MINUTES = 15;

const containerClients = new Map<BlobContainerName, ContainerClient>();

function getContainer(name: BlobContainerName): ContainerClient {
  const cached = containerClients.get(name);
  if (cached) return cached;
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) {
    throw new Error("Missing AZURE_STORAGE_CONNECTION_STRING");
  }
  const client = BlobServiceClient.fromConnectionString(conn).getContainerClient(
    name,
  );
  containerClients.set(name, client);
  return client;
}

/**
 * Container-relative blob key: `{prefix}/{timestamp}-{sanitized filename}`.
 * The owning row is created after the upload and stores the final key — the
 * DB is the only map from record to blob (blobs are never enumerated to
 * reconstruct state).
 */
export function buildBlobKey(prefix: string, filename: string): string {
  const safe = filename
    .normalize("NFKD")
    // strip combining diacritics left by NFKD
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(-120);
  return `${prefix}/${Date.now()}-${safe}`;
}

/** Upload file bytes to a container; the key is persisted by the caller's row. */
export async function uploadBlob(
  container: BlobContainerName,
  blobPath: string,
  data: Buffer,
  contentType?: string | null,
): Promise<void> {
  const blob = getContainer(container).getBlockBlobClient(blobPath);
  await blob.uploadData(data, {
    blobHTTPHeaders: contentType
      ? { blobContentType: contentType }
      : undefined,
  });
}

/** Short-lived read-only SAS URL for a stored blob. */
export async function getBlobSasUrl(
  container: BlobContainerName,
  blobPath: string,
): Promise<string> {
  const blob = getContainer(container).getBlockBlobClient(blobPath);
  return blob.generateSasUrl({
    permissions: BlobSASPermissions.parse("r"),
    expiresOn: new Date(Date.now() + SAS_TTL_MINUTES * 60 * 1000),
  });
}
