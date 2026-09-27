# Deploying to Azure

The application ships as three container images (`api`, `doctor-web`,
`hospital-web`) and runs on **Azure Container Apps** with managed
**PostgreSQL Flexible Server**. Everything is described in
`infra/azure/main.bicep`.

```
                 ┌──────────────────── Container Apps environment ───────────────────┐
browser ──https─▶│  doctor-web (nginx, SPA)   api (Fastify) ──▶ PostgreSQL Flexible   │
                 │  hospital-web (nginx, SPA)      │            Server                │
                 │        │ /config.js              │                                  │
                 │        └── API_BASE_URL ─────────┘                                  │
                 └──────────────────────────── Log Analytics ─────────────────────────┘
```

This is a **pilot/co-design deployment**, not a production one — see
`docs/addendum/v0.3-addendum.md` §6. Do not put real practitioner data in it
until privacy, security and clinical safety review has happened (same
document, §5).

## 0. Fastest path: one-click from GitHub (no local tooling)

You do not need the Azure CLI on your own machine, and I (the assistant)
cannot deploy into your Azure tenant myself — I have no credentials for it.
This path uses GitHub Actions, authenticated with a service principal you
create, to do the deployment.

1. In the [Azure Cloud Shell](https://shell.azure.com) (or any machine with
   the Azure CLI logged in to the right subscription), create a deployment
   identity:

   ```bash
   az ad sp create-for-rbac --name medworkforce-github --role Contributor \
     --scopes /subscriptions/$(az account show --query id -o tsv) --sdk-auth
   ```

   Copy the JSON it prints — this is a credential, so paste it only into the
   GitHub secret below, never into chat or a committed file.

2. In GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**:

   | Secret | Value |
   | --- | --- |
   | `AZURE_CREDENTIALS` | the JSON from step 1 |
   | `PG_ADMIN_PASSWORD` | a strong database password (16+ chars) |
   | `JWT_SECRET_KEY` | 32+ random characters, e.g. `openssl rand -base64 32` |

3. **Actions → Provision Azure (first deployment) → Run workflow**. Pick the
   resource group name and region (default `australiaeast`). A few minutes
   later the job summary shows the doctor-web, hospital-web and API URLs.

4. Share the two web URLs with whoever you want feedback from. Subsequent
   pushes to `main` that touch `packages/`, `services/api/` or `apps/` deploy
   automatically via the **Deploy to Azure Container Apps** workflow — no
   further Azure steps needed.

The provisioning workflow creates the resource group and every resource,
builds all three images in ACR (cloud build — no local Docker needed), rolls
them out and smoke-tests the API. It is idempotent, so re-running it is safe
(e.g. to rotate secrets, or after changing `infra/azure/main.bicep`).

The sections below describe the same steps done manually, if you'd rather
drive it yourself from the Azure CLI.

## 1. Prerequisites

- Azure CLI 2.60+ (`az version`), logged in to the target subscription.
- Resource providers registered once per subscription:
  `az provider register -n Microsoft.App -n Microsoft.OperationalInsights -n Microsoft.DBforPostgreSQL -n Microsoft.ContainerRegistry`
- A PostgreSQL admin password and a JWT secret ready.

## 2. Create the infrastructure

```bash
az group create -n med_wf_aus -l australiaeast

export PG_ADMIN_PASSWORD='<strong password>'
export JWT_SECRET_KEY="$(openssl rand -base64 32)"

az deployment group create \
  -g med_wf_aus \
  -f infra/azure/main.bicep \
  -p infra/azure/main.bicepparam \
  --parameters postgresAdminPassword="$PG_ADMIN_PASSWORD" jwtSecretKey="$JWT_SECRET_KEY" \
  --query properties.outputs -o json
```

The first deployment starts the apps with a public placeholder image so the
environment is healthy before any application image exists. Note the
outputs: `acrName`, `apiAppName`, `doctorWebAppName`, `hospitalWebAppName`,
`apiUrl`, `doctorWebUrl`, `hospitalWebUrl`.

Re-running the same command is safe and is how you rotate secrets or change
settings (the template is idempotent).

Cost note: the default SKUs (Postgres `Standard_B1ms` burstable, Container
Apps consumption plan) are the cheapest managed options and are fine for a
pilot. Scale them via the template parameters when real load requires it.

## 3. Build and roll out the images

### Option A: GitHub Actions (recommended)

1. Create a service principal scoped to just this resource group:

   ```bash
   az ad sp create-for-rbac --name medworkforce-github-deploy \
     --role Contributor \
     --scopes /subscriptions/<subscription-id>/resourceGroups/med_wf_aus \
     --sdk-auth
   ```

   Store the JSON output as the repository secret `AZURE_CREDENTIALS`.
2. Add repository **variables** `AZURE_RESOURCE_GROUP`, `AZURE_ACR_NAME`,
   `AZURE_API_APP`, `AZURE_DOCTOR_WEB_APP`, `AZURE_HOSPITAL_WEB_APP` from the
   deployment outputs.
3. Run the **Deploy to Azure Container Apps** workflow from the Actions tab
   (it also runs automatically on pushes to `main` that touch `packages/`,
   `services/api/` or `apps/`).

The workflow builds all three images inside ACR (`az acr build`, no local
Docker needed), updates the three container apps and smoke-tests `/health`
and `/health/ready`.

### Option B: from your machine

```bash
ACR=<acrName from outputs>
az acr build -r $ACR -t medworkforce-api:manual --file services/api/Dockerfile .
az acr build -r $ACR -t medworkforce-doctor-web:manual --file apps/doctor-web/Dockerfile .
az acr build -r $ACR -t medworkforce-hospital-web:manual --file apps/hospital-web/Dockerfile .
LOGIN=$(az acr show -n $ACR --query loginServer -o tsv)
az containerapp update -g med_wf_aus -n medwfpilot-api      --image $LOGIN/medworkforce-api:manual
az containerapp update -g med_wf_aus -n medwfpilot-doctor   --image $LOGIN/medworkforce-doctor-web:manual
az containerapp update -g med_wf_aus -n medwfpilot-hospital --image $LOGIN/medworkforce-hospital-web:manual
```

On start-up the API container runs `prisma migrate deploy`, so a fresh
environment comes up with the full schema with no manual migration step.

## 4. First-run checks

```bash
API=$(az containerapp show -g med_wf_aus -n medwfpilot-api --query properties.configuration.ingress.fqdn -o tsv)
curl https://$API/health
curl https://$API/health/ready   # checks the database connection
```

Open the doctor-web and hospital-web URLs — the Home/Dashboard screen shows
a live "API connectivity: ok" line once the API is reachable, which is a
quick way to confirm the whole chain works end to end.

## 5. Custom domains and TLS

`az containerapp hostname add -g med_wf_aus -n <app> --hostname <your-domain>`,
create the CNAME/TXT records it prints, then
`az containerapp hostname bind ... --environment medwfpilot-env --validation-method CNAME`
for a managed certificate. Redeploy the Bicep with the real hostnames if you
want `CORS_ALLOWED_ORIGINS` to reflect them precisely rather than the
generated `*.azurecontainerapps.io` hostnames.

## 6. Operations

| Task | Command |
| --- | --- |
| Tail API logs | `az containerapp logs show -g <rg> -n <api app> --follow` |
| Run migrations only | `az containerapp exec -g <rg> -n <api app> --command "npx prisma migrate deploy"` |
| Roll back | `az containerapp revision list ...` then `az containerapp revision activate ...` |
| Postgres backups | 7-day automatic backups are enabled by the template; take a manual `pg_dump` before risky migrations |

## Hardening beyond the template (before any real practitioner data)

- Put the Container Apps environment in a VNet and switch PostgreSQL to a
  private endpoint (the template currently allows Azure-service IPs only).
- Move secrets into Azure Key Vault and reference them from the container
  apps instead of passing them as deployment parameters.
- Add Azure Front Door or Application Gateway with WAF in front of the web apps.
- Enable Microsoft Defender for Containers and alerting on `/health/ready` failures.
- Complete the Privacy Impact Assessment and security review named in
  `docs/spec/04-ynlhn-implementation-evaluation-plan-v0.2.docx` §17 before
  any real credential, scope or feedback data is entered.
