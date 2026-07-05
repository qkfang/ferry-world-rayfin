import os
from azure.identity import ClientSecretCredential
from fabric_cicd import FabricWorkspace, publish_all_items, unpublish_all_orphan_items

credential = ClientSecretCredential(
    tenant_id=os.environ["AZURE_TENANT_ID"],
    client_id=os.environ["AZURE_CLIENT_ID"],
    client_secret=os.environ["AZURE_CLIENT_SECRET"],
)

workspace = FabricWorkspace(
    workspace_id=os.environ["FABRIC_WORKSPACE_ID"],
    environment=os.environ.get("FABRIC_ENVIRONMENT", "DEV"),
    repository_directory=os.path.join(os.path.dirname(__file__)),
    item_type_in_scope=["Report", "SemanticModel", "KQLQueryset"],
    token_credential=credential,
)

publish_all_items(workspace)
unpublish_all_orphan_items(workspace)
