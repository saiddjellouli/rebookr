import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { CANONICAL_FIELDS, type ColumnMapping } from "../services/csv/canonical.js";
import { importCsvFromBuffer } from "../services/csv/importCsv.js";

const orgIdSchema = z.string().uuid();

function parseMappingField(raw: string | undefined): ColumnMapping | undefined {
  if (raw == null || !String(raw).trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    throw new Error("INVALID_MAPPING_JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("INVALID_MAPPING_JSON");
  }
  const out: ColumnMapping = {};
  for (const key of CANONICAL_FIELDS) {
    const v = (parsed as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export const csvImportRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/imports/csv",
    async (request, reply) => {
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) {
        return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });
      }

      let fileBuffer: Buffer | null = null;
      let userMapping: ColumnMapping | undefined;
      let defaultTime: string | undefined;
      let defaultDurationMinutes: number | undefined;

      try {
        for await (const part of request.parts()) {
          if (part.type === "file") {
            if (part.fieldname === "file") {
              fileBuffer = await part.toBuffer();
            } else {
              await part.toBuffer();
            }
          } else {
            const value = String(part.value ?? "");
            if (part.fieldname === "mapping") {
              userMapping = parseMappingField(value);
            }
            if (part.fieldname === "defaultTime" && value.trim()) {
              defaultTime = value.trim();
            }
            if (part.fieldname === "defaultDurationMinutes" && value.trim()) {
              const n = Number.parseInt(value, 10);
              if (Number.isFinite(n)) defaultDurationMinutes = n;
            }
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message === "INVALID_MAPPING_JSON") {
          return reply.code(400).send({ error: "INVALID_MAPPING_JSON" });
        }
        throw e;
      }

      if (!fileBuffer?.length) {
        return reply.code(400).send({ error: "FILE_REQUIRED" });
      }

      try {
        const result = await importCsvFromBuffer({
          organizationId: orgId.data,
          buffer: fileBuffer,
          userMapping,
          defaultTime,
          defaultDurationMinutes,
        });

        if (!result.ok) {
          return reply.code(422).send({
            error: result.code,
            csvHeaders: result.csvHeaders,
            suggestedMapping: result.suggestedMapping,
            missing: result.missing,
            hint:
              "Renvoyez le même fichier avec un champ multipart « mapping » (JSON) : clés name, email, phone, date, time, datetime, duration, title ; valeurs = libellés exacts des colonnes du CSV.",
          });
        }

        return reply.send({
          importBatchId: result.importBatchId,
          created: result.created,
          skipped: result.skipped,
          errors: result.errors,
        });
      } catch (e) {
        if (e instanceof Error && e.message === "ORG_NOT_FOUND") {
          return reply.code(404).send({ error: "ORG_NOT_FOUND" });
        }
        if (e instanceof Error && e.message === "CSV_PARSE_ERROR") {
          return reply.code(400).send({ error: "CSV_PARSE_ERROR" });
        }
        throw e;
      }
    },
  );
};
