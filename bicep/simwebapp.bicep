@description('Azure location')
param location string

@description('Simulator Web App name')
param simWebAppName string

@description('Simulator App Service plan name')
param simAppServicePlanName string

@description('SKU for simulator App Service plan')
param simAppServiceSku string

@description('App Insights connection string')
param appInsightsConnectionString string

@description('Kusto query cluster URI')
param kustoClusterUri string = ''

@description('Kusto ingest URI')
param kustoIngestUri string = ''

@description('Kusto database name')
param kustoDatabase string = 'SydneyFerriesKustoDB'

@description('Kusto table name')
param kustoTable string = 'FerryTwinTelemetry'

@description('Azure AI Foundry project endpoint')
param foundryProjectEndpoint string = ''

@description('Azure AI Foundry model deployment name')
param foundryModelDeployment string = ''

resource simAppServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: simAppServicePlanName
  location: location
  sku: {
    name: simAppServiceSku
  }
  kind: 'app'
  properties: {
    reserved: false
  }
}

resource simWebApp 'Microsoft.Web/sites@2023-12-01' = {
  name: simWebAppName
  location: location
  kind: 'app'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: simAppServicePlan.id
    siteConfig: {
      netFrameworkVersion: 'v8.0'
      appSettings: [
        {
          name: 'Kusto__ClusterUri'
          value: kustoClusterUri
        }
        {
          name: 'Kusto__IngestUri'
          value: kustoIngestUri
        }
        {
          name: 'Kusto__Database'
          value: kustoDatabase
        }
        {
          name: 'Kusto__Table'
          value: kustoTable
        }
        {
          name: 'Foundry__ProjectEndpoint'
          value: foundryProjectEndpoint
        }
        {
          name: 'Foundry__ModelDeployment'
          value: foundryModelDeployment
        }
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
      ]
    }
    httpsOnly: true
  }
}

output siteName string = simWebApp.name
output principalId string = simWebApp.identity.principalId
