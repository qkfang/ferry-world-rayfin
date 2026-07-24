

- minimal output for logging and description of the code changes
- don't include any markdown files
- don't include any unit test
- keep the code as readable and simple as possible
- never include any business name or application name from customer
- make sure remove any sensitive information in mock data
- any sample or mock telemetry data must follow open telemetry schema

rayfin app docs:

https://learn.microsoft.com/en-us/fabric/apps/overview#key-features



This is a fabric rayfin project, rayfin configuration is below
the service account (sp-demo-01) has access to deploy fabric resources, and the project is deployed to fabric with the following details. 

📝 Deployment details:
  - Rayfin Item ID: bf06b958-19e0-464e-8bf3-23f26258af4d
  - Endpoint: https://4779d9fa35d346348a0a62f4373b2059.pbidedicated.windows.net/webapi/capacities/4779d9fa-35d3-4634-8a0a-62f4373b2059/workloads/BaaS/BaaSService/automatic/v1/workspaces/bd5002bf-994a-4f7a-926b-b90391e5c5b2/appbackends/bf06b958-19e0-464e-8bf3-23f26258af4d/
  - Fabric Workspace: bd5002bf-994a-4f7a-926b-b90391e5c5b2
  - Portal: https://app.fabric.microsoft.com/groups/bd5002bf-994a-4f7a-926b-b90391e5c5b2/appbackends/bf06b958-19e0-464e-8bf3-23f26258af4d?ctid=9d2116ce-afe6-4ce8-8bc3-c7c7b69856c2
  - Publishable Key: pk-2Fftn…

🎉 Project "ferry-world-rayfin" is now deployed to Fabric!

📌 Next steps:
   • Open in Fabric portal: https://app.fabric.microsoft.com/groups/bd5002bf-994a-4f7a-926b-b90391e5c5b2/appbackends/bf06b958-19e0-464e-8bf3-23f26258af4d?ctid=9d2116ce-afe6-4ce8-8bc3-c7c7b69856c2
   • Build your frontend — use `rayfin env` to generate env variables for your framework (e.g. VITE_RAYFIN_API_URL) and reference them in your code to connect to the backend
   • Use the publishable key as X-Publishable-Key header in data-plane requests

   rayfin documentations

   https://learn.microsoft.com/en-us/fabric/apps/