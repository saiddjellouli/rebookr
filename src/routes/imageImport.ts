import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { persistAppointmentImportRows } from "../services/import/persistRows.js";
import { analyzeImageImport } from "../services/image/extractAppointments.js";
import { importRowSchema, toImportInput } from "../services/image/schemas.js";

const orgIdSchema = z.string().uuid();

const allowedMime = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
  "application/octet-stream",
]);

const commitBodySchema = z.object({
  rows: z.array(importRowSchema).max(2000),
  defaultTime: z.string().optional(),
  defaultDurationMinutes: z.coerce.number().int().min(5).max(480).optional(),
});

export const imageImportRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/imports/image/analyze",
    async (request, reply) => {
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) {
        return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });
      }

      let fileBuffer: Buffer | null = null;

      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (part.fieldname === "file") {
            if (part.mimetype && !allowedMime.has(part.mimetype)) {
              return reply.code(400).send({
                error: "UNSUPPORTED_IMAGE_TYPE",
                mimetype: part.mimetype,
              });
            }
            fileBuffer = await part.toBuffer();
          } else {
            await part.toBuffer();
          }
        } else {
          void part.value;
        }
      }

      if (!fileBuffer?.length) {
        return reply.code(400).send({ error: "FILE_REQUIRED" });
      }

      try {
        const result = await analyzeImageImport({
          imageBuffer: fileBuffer,
          openaiApiKey: env.OPENAI_API_KEY,
        });
        return reply.send({
          ocrText: result.ocrText,
          rows: result.rows,
          extractionMethod: result.extractionMethod,
          warnings: result.warnings,
          skippedInvalid: result.skippedInvalid,
        });
      } catch (e) {
        request.log.error(e);
        return reply.code(500).send({ error: "IMAGE_ANALYZE_FAILED" });
      }
    },
  );

  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/imports/image/commit",
    async (request, reply) => {
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) {
        return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });
      }

      const parsed = commitBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_BODY", details: parsed.error.flatten() });
      }

      const { rows: rawRows, defaultTime, defaultDurationMinutes } = parsed.data;
      const rows = rawRows.map((r) => toImportInput(r));

      try {
        const result = await persistAppointmentImportRows({
          organizationId: orgId.data,
          rows,
          source: "IMAGE",
          defaultTime,
          defaultDurationMinutes,
          firstLineNumber: 1,
        });

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
        throw e;
      }
    },
  );
};
