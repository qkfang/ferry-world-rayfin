/**
 * Data contract shared by the KQL query layer and the 3D frontend.
 * Mirrors the SydneyFerries / ReferenceLocation tables in the Eventhouse.
 */

/** One ferry's latest known position. `id` is the ferry_name business key. */
export interface Ferry {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Free-text schedule, e.g. "01:25pm Mosman Bay - Circular Quay". */
  destination: string;
  /** Epoch milliseconds of the sample. */
  ts: number;
}

/** A wharf / landmark from ReferenceLocation, used to dress the scene. */
export interface ReferenceLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/** Payload returned by GET /api/ferries/live. */
export interface FerryFeed {
  asOf: string;
  ferries: Ferry[];
}

export interface ReferenceFeed {
  locations: ReferenceLocation[];
}

/** One scheduled ferry departure from its origin wharf (TfNSW GTFS timetable). */
export interface FerryDeparture {
  /** Scheduled departure time, `HH:MM:SS` in Sydney local time. May exceed 24h for after-midnight trips. */
  time: string;
  /** Route code, e.g. "F1". */
  route: string;
  /** Trip headsign / destination, e.g. "Manly". */
  headsign: string;
  /** Origin wharf name. */
  from: string;
  /** GTFS trip_id. */
  tripId: string;
}

/** A single deck of a ferry in the digital twin. */
export type DeckId = 'lower' | 'upper' | 'bridge';

/** Latest passenger occupancy for one deck, from the digital-twin telemetry. */
export interface DeckOccupancy {
  deck: DeckId;
  /** People currently on this deck. */
  occupancy: number;
  /** Deck capacity (from the telemetry attributes). */
  capacity: number;
}

/**
 * Per-ferry digital-twin snapshot: how many passengers are on each deck right
 * now. Sourced from the `FerryTwinTelemetry` OpenTelemetry metrics in Fabric.
 */
export interface FerryTwin {
  vesselId: string;
  asOf: string;
  decks: DeckOccupancy[];
}

/** Payload returned by GET /api/ferries/schedule. */
export interface FerryScheduleFeed {
  /** Service date the schedule was computed for (`YYYY-MM-DD`, Sydney). */
  date: string;
  /** ISO timestamp the feed was built. */
  asOf: string;
  /** Number of departures in this payload. */
  count: number;
  departures: FerryDeparture[];
}
