
$appName = 'noise-capture'  # TODO: replace with your app name when using this template

az group create --name "rg-$appName" --location 'westus3'

az deployment group create --name "$appName-deploy" --resource-group "rg-$appName" --template-file './main.bicep' --parameters './main.bicepparam'

$spObjectId = 'a6efe236-83c5-472b-a068-65006e369ad7'  # sp-demo-01
$subscriptionId = az account show --query 'id' -o tsv
az role assignment create --assignee-object-id $spObjectId --assignee-principal-type ServicePrincipal --role 'Contributor' --scope "/subscriptions/$subscriptionId/resourceGroups/rg-$appName"
az role assignment create --assignee-object-id $spObjectId --assignee-principal-type ServicePrincipal --role 'User Access Administrator' --scope "/subscriptions/$subscriptionId/resourceGroups/rg-$appName"

