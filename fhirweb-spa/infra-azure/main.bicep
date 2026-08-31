@description('Storage account name (3-24 chars, lowercase letters and numbers, globally unique)')
param storageAccountName string = 'fhirwebspa'

@description('Azure region')
param location string = 'eastasia'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: false
    allowBlobPublicAccess: true
    minimumTlsVersion: 'TLS1_0'
  }
}

output storageAccountName string = storageAccount.name
output webEndpointHttps string = storageAccount.properties.primaryEndpoints.web
output webEndpointHttp string = replace(storageAccount.properties.primaryEndpoints.web, 'https://', 'http://')
