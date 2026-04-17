export const CANONICAL_FIELDS = [
  "name",
  "email",
  "phone",
  "date",
  "time",
  "datetime",
  "duration",
  "title",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export type ColumnMapping = Partial<Record<CanonicalField, string>>;
