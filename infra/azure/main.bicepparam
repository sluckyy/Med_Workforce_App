using 'main.bicep'

// Example values for a manual `az deployment group create` run. The
// provisioning GitHub Actions workflow (.github/workflows/provision-azure.yml)
// passes every parameter, including the two secrets below, directly from
// GitHub secrets on the command line instead of using this file at all, so
// secrets never need to live on disk or in git history.
//
// postgresAdminPassword and jwtSecretKey are deliberately NOT assigned here
// (`bicep build-params` will correctly refuse to compile this file alone as
// a result). Supply them with `--parameters postgresAdminPassword=... jwtSecretKey=...`
// on the `az deployment group create` command line if you use this file for
// a manual deployment.

param namePrefix = 'medwf'
param environmentName = 'pilot'
param postgresAdminLogin = 'medworkforceadmin'
