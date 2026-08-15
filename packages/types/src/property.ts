/**
 * Properties — one building/venue, one S3 bucket prefix.
 */

/** A property a tablet can be paired to. */
export interface Property {
  /** Slug used in S3 keys and in {@link Entry.property}, e.g. `north-tower`. */
  name: string;
  /** Human-readable name shown in the admin app. */
  display_name: string;
  /** S3 bucket holding this property's entries and config. */
  bucket: string;
  /** Key prefix inside the bucket, without a trailing slash, e.g. `properties/north-tower`. */
  prefix: string;
}

/**
 * Input shape for the S3 key helpers the sync ticket implements
 * (`<prefix>/<device_id>/<YYYY-MM-DD>/<entry_id>/...`).
 */
export interface PropertyPrefixInput {
  property: Property;
  device_id: string;
  /** ISO-8601 UTC instant used to derive the date segment of the key. */
  timestamp_utc: string;
}
