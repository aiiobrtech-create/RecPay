import { getAppIdentity, loadMonorepoEnv } from "@re/app-config";
import { buildApp } from "./app.js";

loadMonorepoEnv(import.meta.url);

const identity = getAppIdentity();
const port = Number(process.env.API_PORT ?? "3000");
const host = process.env.API_HOST ?? "0.0.0.0";

const app = await buildApp();

await app.listen({ port, host });

app.log.info(
  { port, host, appId: identity.id },
  `${identity.displayName} — API no ar`,
);
