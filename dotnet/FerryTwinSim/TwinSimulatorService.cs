using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Azure.Identity;
using Kusto.Data;
using Kusto.Data.Common;
using Kusto.Data.Ingestion;
using Kusto.Ingest;
using Microsoft.Extensions.Options;

namespace FerryTwinSim;

public sealed class TwinSimulatorService : BackgroundService
{
    private static readonly string[] VesselIds = ["Ferry-01", "Ferry-02", "Ferry-03", "Ferry-04", "Ferry-05", "Ferry-06"];
    private static readonly IReadOnlyDictionary<string, int> DeckCapacities = new Dictionary<string, int>
    {
        ["lower"] = 120,
        ["upper"] = 90,
        ["bridge"] = 12
    };

    private readonly TwinSnapshotStore _store;
    private readonly KustoOptions _options;
    private readonly ILogger<TwinSimulatorService> _logger;
    private readonly Random _random = new();
    private readonly Dictionary<string, double> _occupancy = new(StringComparer.OrdinalIgnoreCase);
    private IKustoQueuedIngestClient? _ingestClient;
    private bool _missingConfigLogged;
    private bool _ingestFailureLogged;

    public TwinSimulatorService(TwinSnapshotStore store, IOptions<KustoOptions> options, ILogger<TwinSimulatorService> logger)
    {
        _store = store;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var rows = SimulateRows();
            _store.Update(rows);
            await IngestAsync(rows, stoppingToken);
            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        }
    }

    private IReadOnlyList<FerryTwinMetricRow> SimulateRows()
    {
        var timestamp = DateTimeOffset.UtcNow;
        var rows = new List<FerryTwinMetricRow>();

        foreach (var vesselId in VesselIds)
        {
            foreach (var (deckId, capacity) in DeckCapacities)
            {
                var key = $"{vesselId}|{deckId}";
                var current = _occupancy.TryGetValue(key, out var value) ? value : capacity * _random.NextDouble() * 0.6;
                var next = Math.Clamp(current + _random.Next(-8, 9), 0, capacity);
                _occupancy[key] = next;

                rows.Add(new FerryTwinMetricRow(
                    timestamp,
                    vesselId,
                    deckId,
                    "ferry.deck.occupancy",
                    Math.Round(next, 0),
                    "{passenger}",
                    new Dictionary<string, object>
                    {
                        ["vessel.name"] = vesselId.ToLowerInvariant(),
                        ["deck.capacity"] = capacity,
                        ["net.peer.name"] = "eventhouse"
                    },
                    ActivityTraceId.CreateRandom().ToString(),
                    ActivitySpanId.CreateRandom().ToString()));
            }
        }

        return rows;
    }

    private async Task IngestAsync(IReadOnlyList<FerryTwinMetricRow> rows, CancellationToken cancellationToken)
    {
        if (!TryEnsureIngestClient())
        {
            return;
        }

        try
        {
            var payload = string.Join('\n', rows.Select(row => JsonSerializer.Serialize(row)));
            await using var stream = new MemoryStream(Encoding.UTF8.GetBytes(payload));
            var properties = new KustoIngestionProperties(_options.Database, _options.Table)
            {
                Format = DataSourceFormat.multijson,
                IngestionMapping = new IngestionMapping
                {
                    IngestionMappingKind = IngestionMappingKind.Json,
                    IngestionMappingReference = "FerryTwinTelemetryMapping"
                }
            };

            await _ingestClient!.IngestFromStreamAsync(stream, properties, new StreamSourceOptions { LeaveOpen = false });
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            if (!_ingestFailureLogged)
            {
                _logger.LogWarning(ex, "Ferry twin telemetry ingestion is unavailable; simulation will continue.");
                _ingestFailureLogged = true;
            }
        }
    }

    private bool TryEnsureIngestClient()
    {
        if (_ingestClient is not null)
        {
            return true;
        }

        var ingestUri = string.IsNullOrWhiteSpace(_options.IngestUri) ? _options.ClusterUri : _options.IngestUri;
        if (string.IsNullOrWhiteSpace(ingestUri) || string.IsNullOrWhiteSpace(_options.Database) || string.IsNullOrWhiteSpace(_options.Table))
        {
            if (!_missingConfigLogged)
            {
                _logger.LogInformation("Kusto configuration is incomplete; ferry twin simulation is running without ingestion.");
                _missingConfigLogged = true;
            }

            return false;
        }

        var connection = new KustoConnectionStringBuilder(ingestUri)
            .WithAadAzureTokenCredentialsAuthentication(new DefaultAzureCredential());
        _ingestClient = KustoIngestFactory.CreateQueuedIngestClient(connection);
        return true;
    }

    public override void Dispose()
    {
        _ingestClient?.Dispose();
        base.Dispose();
    }
}
