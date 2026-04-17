import type { FastifyReply, FastifyRequest } from "fastify";

export async function requireJwt(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }
}

/** JWT + contrôle que `organizationId` dans l’URL = tenant du token. */
/** À chaîner après JWT + portée org : réservé au rôle OWNER (ex. gestion des comptes STAFF). */
export async function requireOwner(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.user as { role?: string };
  if (user?.role !== "OWNER") {
    return reply.code(403).send({ error: "OWNER_ONLY" });
  }
}

export async function requireOrgScope(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: "UNAUTHORIZED" });
    return;
  }
  const orgId = (request.params as { organizationId?: string }).organizationId;
  if (!orgId) return;
  const user = request.user as { orgId?: string };
  if (!user?.orgId || user.orgId !== orgId) {
    return reply.code(403).send({ error: "FORBIDDEN_ORG" });
  }
}
