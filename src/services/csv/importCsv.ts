import { parse } from "csv-parse/sync";
import { prisma } from "../../lib/prisma.js";
import { persistAppointmentImportRows, type ImportAppointmentInput } from "../import/persistRows.js";
import { autoMapHeaders, listMissingForSchedule, mergeMappings } from "./autoMap.js";
import type { CanonicalField, ColumnMapping } from "./canonical.js";
import { randomUUID } from "node:crypto";

const MAX_ROWS = 2000;

export type CsvImportOk = {
  ok: true;
  importBatchId: string;
  created: number;
  skipped: number;
  errors: { line: number; message: string }[];
};

export type CsvImportMappingError = {
  ok: false;
  code: "MAPPING_INCOMPLETE";
  csvHeaders: string[];
  suggestedMapping: ColumnMapping;
  missing: CanonicalField[];
};

export type CsvImportResult = CsvImportOk | CsvImportMappingError;

function detectDelimiter(headerLine: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of headerLine) {
    if (ch in counts) counts[ch]++;
  }
  let best = ",";
  let max = -1;
  for (const [sep, n] of Object.entries(counts)) {
    if (n > max) {
      max = n;
      best = sep;
    }
  }
  return best;
}

function getCell(
  row: Record<string, unknown>,
  field: CanonicalField,
  mapping: ColumnMapping,
): string | undefined {
  const header = mapping[field];
  if (!header) return undefined;
  const v = row[header];
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

export async function importCsvFromBuffer(params: {
  organizationId: string;
  buffer: Buffer;
  userMapping?: ColumnMapping;
  defaultTime?: string;
  defaultDurationMinutes?: number;
}): Promise<CsvImportResult> {
  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
  });
  if (!org) {
    throw new Error("ORG_NOT_FOUND");
  }

  const text = params.buffer.toString("utf8");
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const delimiter = detectDelimiter(firstLine);

  let records: Record<string, string>[];
  try {
    records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      delimiter,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch {
    throw new Error("CSV_PARSE_ERROR");
  }

  if (records.length === 0) {
    return {
      ok: true,
      importBatchId: randomUUID(),
      created: 0,
      skipped: 0,
      errors: [{ line: 1, message: "Fichier vide ou sans ligne de données" }],
    };
  }

  const csvHeaders = Object.keys(records[0] ?? {});
  const auto = autoMapHeaders(csvHeaders);
  const mapping = mergeMappings(auto, params.userMapping ?? {});

  const missingSchedule = listMissingForSchedule(mapping);
  if (missingSchedule.length > 0) {
    return {
      ok: false,
      code: "MAPPING_INCOMPLETE",
      csvHeaders,
      suggestedMapping: auto,
      missing: missingSchedule,
    };
  }

  if (records.length > MAX_ROWS) {
    return {
      ok: true,
      importBatchId: randomUUID(),
      created: 0,
      skipped: 0,
      errors: [
        {
          line: 0,
          message: `Trop de lignes (max ${MAX_ROWS}). Fractionnez le fichier.`,
        },
      ],
    };
  }

  const rows: ImportAppointmentInput[] = records.map((row) => ({
    name: getCell(row, "name", mapping),
    email: getCell(row, "email", mapping),
    phone: getCell(row, "phone", mapping),
    date: getCell(row, "date", mapping),
    time: getCell(row, "time", mapping),
    datetime: getCell(row, "datetime", mapping),
    duration: getCell(row, "duration", mapping),
    title: getCell(row, "title", mapping),
  }));

  const result = await persistAppointmentImportRows({
    organizationId: params.organizationId,
    rows,
    source: "CSV",
    defaultTime: params.defaultTime,
    defaultDurationMinutes: params.defaultDurationMinutes,
    firstLineNumber: 2,
  });

  return {
    ok: true,
    ...result,
  };
}
