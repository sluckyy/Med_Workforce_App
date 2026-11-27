export const env = {
  port: Number(process.env.PORT ?? 8000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecretKey: process.env.JWT_SECRET_KEY ?? "",
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  azureStorageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING ?? "",
  evidenceContainerName: process.env.EVIDENCE_CONTAINER_NAME ?? "evidence",
  // Public URL of the doctor-facing app, used to build links in outbound
  // notifications (share links, approval links). Empty disables link-bearing
  // notifications rather than emitting a broken relative URL.
  doctorWebUrl: (process.env.DOCTOR_WEB_URL ?? "").replace(/\/+$/, ""),
  // Azure Communication Services Email. Unset means "no provider": sends are
  // skipped and recorded as such (modules/notifications), never faked.
  acsConnectionString: process.env.ACS_CONNECTION_STRING ?? "",
  emailSender: process.env.EMAIL_SENDER ?? "",
};
