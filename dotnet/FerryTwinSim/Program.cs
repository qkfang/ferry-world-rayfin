using Azure.Monitor.OpenTelemetry.AspNetCore;
using FerryTwinSim;

var builder = WebApplication.CreateBuilder(args);

if (!string.IsNullOrWhiteSpace(builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]))
{
    builder.Services.AddOpenTelemetry().UseAzureMonitor();
}

builder.Services.Configure<KustoOptions>(builder.Configuration.GetSection("Kusto"));
builder.Services.Configure<FoundryOptions>(builder.Configuration.GetSection("Foundry"));
builder.Services.AddSingleton<TwinSnapshotStore>();
builder.Services.AddSingleton<FoundryAgentService>();
builder.Services.AddHostedService<TwinSimulatorService>();

var app = builder.Build();

app.MapGet("/health", () => Results.Ok("ok"));
app.MapGet("/twin", (TwinSnapshotStore store) => Results.Ok(store.GetAll()));
app.MapGet("/twin/{vesselId}", (string vesselId, TwinSnapshotStore store) =>
{
    var rows = store.GetVessel(vesselId);
    return rows.Count == 0 ? Results.NotFound() : Results.Ok(rows);
});
app.MapPost("/agent/ask", async (AgentQuestion request, FoundryAgentService agent, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Question))
    {
        return Results.BadRequest(new { answer = "Please provide a question." });
    }

    var answer = await agent.AskAsync(request.Question, cancellationToken);
    return Results.Ok(new { answer });
});

app.Run();
