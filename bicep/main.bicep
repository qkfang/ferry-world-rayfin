targetScope = 'resourceGroup'

@description('Azure location')
param location string = resourceGroup().location

@description('Base name for resources')
param baseName string

@description('SKU for App Service plan')
@allowed([
  'F1'
  'B1'
  'S1'
])
param appServiceSku string = 'S1'

@description('Blob container name for noise log files')
param logsContainerName string = 'noise-logs'

@description('Additional principals to grant Storage Blob Data Contributor on the storage account')
param principals array = []

var uniqueSuffix = uniqueString(resourceGroup().id)
var logAnalyticsName = '${baseName}-law'
var appInsightsName = '${baseName}-appi'
var storageAccountName = toLower('${baseName}sa')
var appServicePlanName = '${baseName}-plan'
var webAppName = '${baseName}-web'

module monitoring 'monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    logAnalyticsName: logAnalyticsName
    appInsightsName: appInsightsName
  }
}

module storage 'storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    storageAccountName: storageAccountName
    logsContainerName: logsContainerName
  }
}

module appService 'appservice.bicep' = {
  name: 'appservice'
  params: {
    location: location
    webAppName: webAppName
    appServicePlanName: appServicePlanName
    appServiceSku: appServiceSku
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    storageAccountName: storageAccountName
    logsContainerName: logsContainerName
  }
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource blobDataContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storageAccount
  name: guid(storageAccountName, webAppName, 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    principalId: appService.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

resource principalBlobDataContributorAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principal in principals: {
  scope: storageAccount
  name: guid(storageAccountName, principal.id, 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    principalId: principal.id
    principalType: principal.principalType
  }
}]

output webAppName string = appService.outputs.webAppName
output storageAccountName string = storage.outputs.storageAccountName
output logsContainerName string = storage.outputs.logsContainerName
