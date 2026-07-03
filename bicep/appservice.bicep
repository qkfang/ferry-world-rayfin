@description('Azure location')
param location string

@description('Web App name')
param webAppName string

@description('App Service plan name')
param appServicePlanName string

@description('SKU for App Service plan')
param appServiceSku string

@description('App Insights connection string')
param appInsightsConnectionString string

@description('Storage account name used for noise log blobs')
param storageAccountName string

@description('Storage container name used for noise log blobs')
param logsContainerName string

@description('Folder path for local JSON persistence')
param localDataFolder string = '/home/site/data'

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: appServiceSku
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|10.0'
      appCommandLine: 'dotnet NoiseCapture.Web.dll'
      appSettings: [
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'NoiseStorage__AccountUrl'
          value: 'https://${storageAccountName}.blob.${environment().suffixes.storage}'
        }
        {
          name: 'NoiseStorage__ContainerName'
          value: logsContainerName
        }
        {
          name: 'NoiseStorage__TenantId'
          value: subscription().tenantId
        }
        {
          name: 'LocalData__FolderPath'
          value: localDataFolder
        }
      ]
    }
    httpsOnly: true
  }
}

output webAppName string = webApp.name
output principalId string = webApp.identity.principalId
