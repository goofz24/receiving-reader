// Starts the back end: `npm start` or `npm run dev`.
import "./env"; // must be first: loads .env before other files read settings
import { serve } from "@hono/node-server";
import { createApp } from "./index";

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: createApp().fetch, port });
console.log(
  `API on http://localhost:${port} (${process.env.ANTHROPIC_API_KEY ? "live: API key found" : "sample mode: no API key"})`,
);
