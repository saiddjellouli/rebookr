import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance } from "fastify";
import { env } from "../config.js";

export async function registerJwt(app: FastifyInstance): Promise<void> {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });
}
