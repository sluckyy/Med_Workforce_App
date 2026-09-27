// Medical Workforce Passport & Exchange - Azure Container Apps deployment
//
// Deploys (resource-group scope):
//   - Log Analytics workspace + Container Apps environment
//   - Azure Container Registry (images are pushed by the GitHub Actions workflow)
//   - Azure Database for PostgreSQL Flexible Server (+ database)
//   - Three container apps: api (public), doctor-web (public), hospital-web (public)
//
// This is a pilot/co-design deployment, not a production one — see
// docs/addendum/v0.3-addendum.md §6 (adaptive, risk-triggered governance).
// No object storage is provisioned yet because credential evidence upload
// is not implemented in the scaffold; add a storage account + Container
// Apps Azure Files mount here when that module lands (see
// docs/spec/01-technical-architecture-data-model-v0.2.docx §32).
//
// Deploy with (the two secure params are never stored on disk — see
// infra/azure/main.bicepparam for why they are deliberately left unset there):
//   az deployment group create -g <rg> -f infra/azure/main.bicep -p infra/azure/main.bicepparam \
//     --parameters postgresAdminPassword=<...> jwtSecretKey=<...>
// In CI, .github/workflows/provision-azure.yml passes every parameter
// directly from GitHub secrets instead of using the .bicepparam file.

targetScope = 'resourceGroup'

@description('Short name used as a prefix for all resources (lowercase letters/numbers).')
@minLength(3)
@maxLength(12)
param namePrefix string = 'medwf'

@description('Deployment environment label (pilot, staging, prod).')
param environmentName string = 'pilot'

param location string = resourceGroup().location

@description('PostgreSQL administrator login.')
param postgresAdminLogin string = 'medworkforceadmin'

@secure()
@description('PostgreSQL administrator password.')
param postgresAdminPassword string

@secure()
@description('JWT signing secret (>= 32 random characters).')
param jwtSecretKey string

@description('Container image for the API. Set by the deploy workflow; defaults to a placeholder for first deployment.')
param apiImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Container image for the doctor-facing web app. Set by the deploy workflow; defaults to a placeholder for first deployment.')
param doctorWebImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Container image for the hospital-facing web app. Set by the deploy workflow; defaults to a placeholder for first deployment.')
param hospitalWebImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('PostgreSQL SKU name.')
param postgresSkuName string = 'Standard_B1ms'

@description('PostgreSQL SKU tier.')
@allowed(['Burstable', 'GeneralPurpose', 'MemoryOptimized'])
param postgresSkuTier string = 'Burstable'

var suffix = toLower('${namePrefix}${environmentName}')
var uniq = uniqueString(resourceGroup().id, suffix)
var acrName = toLower(replace('${suffix}acr${uniq}', '-', ''))
var postgresServerName = '${suffix}-pg-${uniq}'
var databaseName = 'med_workforce'
var usePlaceholderImages = apiImage == 'mcr.microsoft.com/k8se/quickstart:latest'

// ---------------------------------------------------------------------------
// Logging + Container Apps environment
// ---------------------------------------------------------------------------
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${suffix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${suffix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Container registry
// ---------------------------------------------------------------------------
resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: true
  }
}

// ---------------------------------------------------------------------------
// PostgreSQL Flexible Server
// ---------------------------------------------------------------------------
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: postgresServerName
  location: location
  sku: {
    name: postgresSkuName
    tier: postgresSkuTier
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32 }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
    authConfig: {
      passwordAuth: 'Enabled'
      activeDirectoryAuth: 'Disabled'
    }
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgres
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Allow Azure services (Container Apps outbound) to reach the server. For a
// hardened setup put the environment in a VNet and use private access
// instead — see docs/addendum/v0.3-addendum.md §5 (legal/privacy review
// trigger before any real practitioner data is used).
resource postgresFirewallAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: postgres
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ---------------------------------------------------------------------------
// Shared configuration
// ---------------------------------------------------------------------------
var databaseUrl = 'postgresql://${postgresAdminLogin}:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'

var apiFqdn = '${suffix}-api.${containerEnv.properties.defaultDomain}'
var doctorWebFqdn = '${suffix}-doctor.${containerEnv.properties.defaultDomain}'
var hospitalWebFqdn = '${suffix}-hospital.${containerEnv.properties.defaultDomain}'
var apiUrl = 'https://${apiFqdn}'
var doctorWebUrl = 'https://${doctorWebFqdn}'
var hospitalWebUrl = 'https://${hospitalWebFqdn}'

var apiSecrets = [
  { name: 'database-url', value: databaseUrl }
  { name: 'jwt-secret-key', value: jwtSecretKey }
  { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
]

var apiEnv = [
  { name: 'DATABASE_URL', secretRef: 'database-url' }
  { name: 'JWT_SECRET_KEY', secretRef: 'jwt-secret-key' }
  { name: 'CORS_ALLOWED_ORIGINS', value: '${doctorWebUrl},${hospitalWebUrl}' }
]

var registries = usePlaceholderImages ? [] : [
  {
    server: acr.properties.loginServer
    username: acr.name
    passwordSecretRef: 'acr-password'
  }
]

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${suffix}-api'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: usePlaceholderImages ? 80 : 8000
        transport: 'auto'
        allowInsecure: false
      }
      secrets: apiSecrets
      registries: registries
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          env: apiEnv
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: usePlaceholderImages ? [] : [
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 8000 }
              initialDelaySeconds: 20
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/health/ready', port: 8000 }
              initialDelaySeconds: 10
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http'
            http: { metadata: { concurrentRequests: '50' } }
          }
        ]
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Doctor-facing web app (static SPA)
// ---------------------------------------------------------------------------
resource doctorWebApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${suffix}-doctor'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 80
        transport: 'auto'
        allowInsecure: false
      }
      secrets: [
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
      ]
      registries: registries
    }
    template: {
      containers: [
        {
          name: 'doctor-web'
          image: doctorWebImage
          env: [
            { name: 'API_BASE_URL', value: apiUrl }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Hospital/workforce-facing web app (static SPA)
// ---------------------------------------------------------------------------
resource hospitalWebApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${suffix}-hospital'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 80
        transport: 'auto'
        allowInsecure: false
      }
      secrets: [
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
      ]
      registries: registries
    }
    template: {
      containers: [
        {
          name: 'hospital-web'
          image: hospitalWebImage
          env: [
            { name: 'API_BASE_URL', value: apiUrl }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
      }
    }
  }
}

output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
output containerAppsEnvironment string = containerEnv.name
output apiAppName string = apiApp.name
output doctorWebAppName string = doctorWebApp.name
output hospitalWebAppName string = hospitalWebApp.name
output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'
output doctorWebUrl string = 'https://${doctorWebApp.properties.configuration.ingress.fqdn}'
output hospitalWebUrl string = 'https://${hospitalWebApp.properties.configuration.ingress.fqdn}'
output postgresServer string = postgres.properties.fullyQualifiedDomainName
