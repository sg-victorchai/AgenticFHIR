#!/usr/bin/env bash
# Deploy fhirweb-spa to Azure Blob Storage static website (HTTP-accessible)
# Usage: ./infra-azure/deploy.sh [storage-account-name] [resource-group]
set -euo pipefail

SUBSCRIPTION="6a591668-996b-41ea-a3e2-a8953421ee9c"
STORAGE_ACCOUNT="${1:-fhirwebspa}"
RESOURCE_GROUP="${2:-fhirweb-rg}"
LOCATION="eastasia"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Setting subscription: $SUBSCRIPTION"
az account set --subscription "$SUBSCRIPTION"

echo "==> Creating resource group '$RESOURCE_GROUP' in '$LOCATION' (idempotent)"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

echo "==> Deploying storage account via Bicep..."
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$SCRIPT_DIR/main.bicep" \
  --parameters storageAccountName="$STORAGE_ACCOUNT" location="$LOCATION" \
  --output none

echo "==> Enabling static website (index: index.html, 404: index.html)..."
ACCOUNT_KEY=$(az storage account keys list \
  --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[0].value" --output tsv)

az storage blob service-properties update \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$ACCOUNT_KEY" \
  --static-website \
  --index-document index.html \
  --404-document index.html \
  --output none

echo "==> Building app with azure profile (.env.azure)..."
cd "$REPO_ROOT"
npm ci --prefer-offline
npx tsc --noEmit
npx vite build --mode azure --base /

echo "==> Uploading dist/ to \$web container..."
az storage blob upload-batch \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$ACCOUNT_KEY" \
  --source dist/ \
  --destination '$web' \
  --overwrite \
  --output none

WEB_HTTPS=$(az storage account show \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --query "primaryEndpoints.web" --output tsv | tr -d '\n')
WEB_HTTP="${WEB_HTTPS/https:\/\//http://}"

echo ""
echo "==> Deployment complete!"
echo "    HTTP URL:  $WEB_HTTP"
echo "    HTTPS URL: $WEB_HTTPS"
