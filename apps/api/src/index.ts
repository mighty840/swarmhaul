import { buildApp } from "./app.js";

const app = await buildApp({ logger: true });

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
  app.log.info(`SwarmHaul API running on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
