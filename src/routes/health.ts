import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { PRODUCT_NAME } from "../product.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    return { ok: true, service: PRODUCT_NAME };
  });

  app.get("/health/db", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, database: "up" };
  });
};
