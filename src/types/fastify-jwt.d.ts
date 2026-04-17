import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      orgId: string;
      email: string;
      role: "OWNER" | "STAFF";
    };
  }
}
