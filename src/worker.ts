import { recordAuditHit, type AuditHitCtx, type AuditHitEnv } from "./lib/audit-hit";
import { VERSION } from "./version.generated";

const APP = "recording-studio";
const VERSION_HEADER = "X-Cybush-Version";

/** Statuses that must not carry a body. */
const NULL_BODY = new Set([101, 204, 205, 304]);

type AssetFetcher = {
  fetch(request: Request): Promise<Response>;
};

type Env = AuditHitEnv & {
  ASSETS: AssetFetcher;
  CF_VERSION?: { id?: string };
};

export default {
  async fetch(request: Request, env: Env, ctx: AuditHitCtx): Promise<Response> {
    recordAuditHit(request, env, ctx);

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/__version") {
      const body = JSON.stringify({
        app: APP,
        sha: VERSION.sha,
        built: VERSION.built,
        cf_version_id: env.CF_VERSION?.id ?? null,
      });
      return new Response(body, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          [VERSION_HEADER]: VERSION.sha,
        },
      });
    }

    const asset = await env.ASSETS.fetch(request);
    return stampVersion(asset);
  },
};

function stampVersion(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set(VERSION_HEADER, VERSION.sha);
  const body = NULL_BODY.has(response.status) ? null : response.body;
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
