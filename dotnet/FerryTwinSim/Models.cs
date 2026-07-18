namespace FerryTwinSim;

public sealed record FerryTwinMetricRow(
    DateTimeOffset Timestamp,
    string VesselId,
    string DeckId,
    string MetricName,
    double MetricValue,
    string Unit,
    IReadOnlyDictionary<string, object> Attributes,
    string TraceId,
    string SpanId);

public sealed record AgentQuestion(string Question);

public sealed class KustoOptions
{
    public string? ClusterUri { get; init; }
    public string? IngestUri { get; init; }
    public string Database { get; init; } = "SydneyFerriesKustoDB";
    public string Table { get; init; } = "FerryTwinTelemetry";
}

public sealed class FoundryOptions
{
    public string? ProjectEndpoint { get; init; }
    public string? ModelDeployment { get; init; }
}
