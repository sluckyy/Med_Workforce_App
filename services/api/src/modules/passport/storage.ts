import { randomUUID } from "node:crypto";
import { BlobSASPermissions, BlobServiceClient } from "@azure/storage-blob";
import { env } from "../../config/env.js";

// Lazy + memoized: constructing a BlobServiceClient is cheap but touching
// env.azureStorageConnectionString before config has been read (e.g. at
// module-import time in a test) would throw for no reason — only the first
// actual upload/download call needs it.
let containerClientPromise: ReturnType<typeof initContainerClient> | null = null;

async function initContainerClient() {
  if (!env.azureStorageConnectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured — evidence upload is unavailable");
  }
  const serviceClient = BlobServiceClient.fromConnectionString(env.azureStorageConnectionString);
  const containerClient = serviceClient.getContainerClient(env.evidenceContainerName);
  // Idempotent — the container is provisioned by infra/azure/main.bicep in
  // real deployments, but local dev against an emulator (e.g. Azurite)
  // starts with nothing.
  await containerClient.createIfNotExists();
  return containerClient;
}

function getContainerClient() {
  containerClientPromise ??= initContainerClient();
  return containerClientPromise;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-100);
}

// practitionerId is folded into the key (not just the credentialId) so a
// directory listing of the container groups by owner, matching how the
// data is actually accessed and making a future per-practitioner export
// straightforward.
export function buildObjectKey(practitionerId: string, credentialId: string, originalFilename: string): string {
  return `${practitionerId}/${credentialId}/${randomUUID()}-${sanitizeFilename(originalFilename)}`;
}

export async function uploadEvidence(objectKey: string, buffer: Buffer, contentType: string): Promise<void> {
  const containerClient = await getContainerClient();
  const blockBlobClient = containerClient.getBlockBlobClient(objectKey);
  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

// Short-lived, read-only SAS URL — the browser downloads directly from
// Blob Storage rather than proxying bytes through the API process.
export async function getEvidenceDownloadUrl(objectKey: string): Promise<string> {
  const containerClient = await getContainerClient();
  const blockBlobClient = containerClient.getBlockBlobClient(objectKey);
  const expiresOn = new Date(Date.now() + 5 * 60 * 1000);
  return blockBlobClient.generateSasUrl({
    permissions: BlobSASPermissions.parse("r"),
    expiresOn,
  });
}

export async function deleteEvidence(objectKey: string): Promise<void> {
  const containerClient = await getContainerClient();
  await containerClient.getBlockBlobClient(objectKey).deleteIfExists();
}
