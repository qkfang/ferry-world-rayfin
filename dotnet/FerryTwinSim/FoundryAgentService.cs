using Azure.AI.Agents.Persistent;
using Azure.Identity;
using Microsoft.Extensions.Options;

namespace FerryTwinSim;

public sealed class FoundryAgentService
{
    private const string AgentName = "Ferry Operations Assistant";
    private const string AgentInstructions = "Help operators reason about ferry deck occupancy and digital-twin telemetry. Keep answers concise, operational, and grounded in the supplied question.";

    private readonly FoundryOptions _options;
    private readonly ILogger<FoundryAgentService> _logger;
    private PersistentAgentsClient? _client;
    private PersistentAgent? _agent;
    private bool _failureLogged;

    public FoundryAgentService(IOptions<FoundryOptions> options, ILogger<FoundryAgentService> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task<string> AskAsync(string question, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_options.ProjectEndpoint) || string.IsNullOrWhiteSpace(_options.ModelDeployment))
        {
            return "The assistant is not configured yet. Set the Foundry project endpoint and model deployment to enable answers.";
        }

        try
        {
            var client = GetClient();
            var agent = await GetOrCreateAgentAsync(client, cancellationToken);
            var thread = (await client.Threads.CreateThreadAsync(cancellationToken: cancellationToken)).Value;

            await client.Messages.CreateMessageAsync(thread.Id, MessageRole.User, question, cancellationToken: cancellationToken);
            var run = (await client.Runs.CreateRunAsync(thread, agent, cancellationToken)).Value;

            while (run.Status == RunStatus.Queued || run.Status == RunStatus.InProgress)
            {
                await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
                run = (await client.Runs.GetRunAsync(thread.Id, run.Id, cancellationToken)).Value;
            }

            if (run.Status != RunStatus.Completed)
            {
                return "The assistant could not complete the request. Please try again later.";
            }

            await foreach (var message in client.Messages.GetMessagesAsync(thread.Id, limit: 20, order: ListSortOrder.Descending, cancellationToken: cancellationToken))
            {
                if (message.Role == MessageRole.Agent)
                {
                    var text = string.Join("\n", message.ContentItems.OfType<MessageTextContent>().Select(item => item.Text));
                    if (!string.IsNullOrWhiteSpace(text))
                    {
                        return text;
                    }
                }
            }

            return "The assistant completed the request but did not return text.";
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            if (!_failureLogged)
            {
                _logger.LogWarning(ex, "Foundry assistant is unavailable.");
                _failureLogged = true;
            }

            return "The assistant is currently unavailable. Check the Foundry configuration and managed identity access.";
        }
    }

    private PersistentAgentsClient GetClient()
    {
        return _client ??= new PersistentAgentsClient(_options.ProjectEndpoint!, new DefaultAzureCredential());
    }

    private async Task<PersistentAgent> GetOrCreateAgentAsync(PersistentAgentsClient client, CancellationToken cancellationToken)
    {
        if (_agent is not null)
        {
            return _agent;
        }

        await foreach (var agent in client.Administration.GetAgentsAsync(limit: 100, cancellationToken: cancellationToken))
        {
            if (string.Equals(agent.Name, AgentName, StringComparison.OrdinalIgnoreCase))
            {
                _agent = agent;
                return agent;
            }
        }

        _agent = (await client.Administration.CreateAgentAsync(
            _options.ModelDeployment!,
            AgentName,
            "Assists with ferry deck occupancy telemetry.",
            AgentInstructions,
            cancellationToken: cancellationToken)).Value;

        return _agent;
    }
}
