using System.Collections.Concurrent;

namespace FerryTwinSim;

public sealed class TwinSnapshotStore
{
    private readonly ConcurrentDictionary<string, FerryTwinMetricRow> _latest = new(StringComparer.OrdinalIgnoreCase);

    public void Update(IEnumerable<FerryTwinMetricRow> rows)
    {
        foreach (var row in rows)
        {
            _latest[$"{row.VesselId}|{row.DeckId}"] = row;
        }
    }

    public IReadOnlyList<FerryTwinMetricRow> GetAll() => _latest.Values
        .OrderBy(row => row.VesselId)
        .ThenBy(row => row.DeckId)
        .ToArray();

    public IReadOnlyList<FerryTwinMetricRow> GetVessel(string vesselId) => _latest.Values
        .Where(row => string.Equals(row.VesselId, vesselId, StringComparison.OrdinalIgnoreCase))
        .OrderBy(row => row.DeckId)
        .ToArray();
}
