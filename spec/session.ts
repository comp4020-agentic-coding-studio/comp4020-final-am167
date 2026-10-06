// A visitor to the running app: one cookie jar, so two Sessions are two
// people (ADR 0002). Shared by the spec tests; not a test itself.
export class Session {
  private cookies = new Map<string, string>();

  constructor(private readonly baseUrl: string) {}

  url(path: string): URL {
    return new URL(path, this.baseUrl);
  }

  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    return { ...(cookie ? { cookie } : {}), ...extra };
  }

  keep(res: Response): Response {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      this.cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
    }
    return res;
  }

  async get(path: string): Promise<Response> {
    return this.keep(await fetch(this.url(path), { headers: this.headers(), redirect: "manual" }));
  }

  // A launch as the plain HTML form sends it (no JavaScript), or as the
  // page's script sends it when `json` is set.
  async launch(
    fields: Record<string, string>,
    { json = false, headers = {} as Record<string, string> } = {},
  ): Promise<Response> {
    const res = await fetch(this.url("/"), {
      method: "POST",
      redirect: "manual",
      headers: this.headers({
        origin: this.url("/").origin,
        "content-type": "application/x-www-form-urlencoded",
        ...(json ? { accept: "application/json" } : {}),
        ...headers,
      }),
      body: new URLSearchParams(fields).toString(),
    });
    return this.keep(res);
  }
}

// A form posted as a browser sends it, without JavaScript.
export async function post(session: Session, path: string, fields: Record<string, string>): Promise<Response> {
  const res = await fetch(session.url(path), {
    method: "POST",
    redirect: "manual",
    headers: session.headers({
      origin: session.url("/").origin,
      "content-type": "application/x-www-form-urlencoded",
    }),
    body: new URLSearchParams(fields).toString(),
  });
  return session.keep(res);
}

// A callsign no other test run has used, so a test can find its own satellite.
export function callsign(prefix = "T"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export interface StreamEvent {
  event: string;
  data: unknown;
}

// Reads a text/event-stream response one event at a time.
export function events(res: Response): { next(timeoutMs?: number): Promise<StreamEvent>; close(): void } {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  return {
    async next(timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const end = buffer.indexOf("\n\n");
        if (end !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          let event = "message";
          const data: string[] = [];
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
          }
          if (data.length === 0) continue; // a comment: keep-alive or hello
          return { event, data: JSON.parse(data.join("\n")) };
        }
        const left = deadline - Date.now();
        if (left <= 0) throw new Error("no event from the stream in time");
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("no event from the stream in time")), left),
          ),
        ]);
        if (chunk.done) throw new Error("the stream closed");
        buffer += chunk.value;
      }
    },
    close() {
      reader.cancel().catch(() => {});
    },
  };
}
