import { createEnvironmentIngestRelay } from "./relay.ts";

declare const Deno: {
  serve(handler: (request: Request) => Promise<Response>): void;
};

const handler = createEnvironmentIngestRelay({
  upstreamUrl: "https://shawn1300.cc.cd/api/environment/v2/ingest",
  upstreamTimeoutMs: 10_000,
  log(event) {
    console.info("Environment ingest relay", event);
  },
});

Deno.serve(handler);
