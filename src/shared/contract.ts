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
