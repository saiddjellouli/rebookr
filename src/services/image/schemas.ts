import { z } from "zod";
import type { ImportAppointmentInput } from "../import/persistRows.js";

export const importRowSchema = z.object({
  name: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  date: z.string().nullish(),
  time: z.string().nullish(),
  datetime: z.string().nullish(),
  duration: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => (v === undefined || v === null ? null : String(v))),
  title: z.string().nullish(),
});

export type ParsedImportRow = z.infer<typeof importRowSchema>;

export function toImportInput(row: ParsedImportRow): ImportAppointmentInput {
  return {
    name: row.name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    date: row.date ?? null,
    time: row.time ?? null,
    datetime: row.datetime ?? null,
    duration: row.duration ?? null,
    title: row.title ?? null,
  };
}

export function parseImportRowList(raw: unknown[]): {
  rows: ImportAppointmentInput[];
  skippedInvalid: number;
} {
  const rows: ImportAppointmentInput[] = [];
  let skippedInvalid = 0;
  for (const item of raw) {
    const r = importRowSchema.safeParse(item);
    if (r.success) {
      rows.push(toImportInput(r.data));
    } else {
      skippedInvalid++;
    }
  }
  return { rows, skippedInvalid };
}
