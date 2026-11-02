import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
  }
}

// The spec checks a RUNNING app over HTTP, so it holds whatever the app is
// built with. CI builds the Dockerfile, starts the image and points APP_URL
// at it, so what passes there is what deploys. Locally, start your app however
// you run it, then `pnpm check`; APP_URL says where it's listening. It waits
// up to a minute, since some stacks take a while to boot or migrate.
export default async function setup(project: TestProject): Promise<void> {
  const baseUrl = process.env.APP_URL ?? "http://localhost:8080";

  // The suite launches hundreds of satellites into whatever it points at.
  // Run against the live app on 2026-11-02, it buried the real sky in test
  // debris and stalled the machine for twenty minutes (notes/log.md).
  if (new URL(baseUrl).hostname.endsWith(".fly.dev") && process.env.SPEC_AGAINST_LIVE !== "yes") {
    throw new Error(
      `refusing to run the spec against ${baseUrl}: it writes test satellites into the live sky. ` +
        "Point APP_URL at a local or scratch app, or set SPEC_AGAINST_LIVE=yes if you really mean it",
    );
  }

  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(baseUrl);
      break;
    } catch {
      // not up yet
    }
    if (attempt >= 300) {
      throw new Error(
        `nothing is answering at ${baseUrl}: start your app first, or set APP_URL to where it's listening`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  project.provide("baseUrl", baseUrl);
}
