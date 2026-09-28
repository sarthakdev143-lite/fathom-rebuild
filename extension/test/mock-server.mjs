// TEST FIXTURE target: serves the mock captions page and receives what the
// extension delivers, so scripts/extension-check.mjs can assert on it. Never
// pointed at the production deployment, so tests cannot pollute seeded data.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const received = [];

const server = createServer((req, res) => {
  if (req.url === "/captions") {
    res.setHeader("content-type", "text/html");
    res.end(readFileSync(join(HERE, "mock-captions.html")));
    return;
  }
  if (req.url === "/api/meetings/from-transcript" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { received.push(JSON.parse(body)); } catch { received.push({ raw: body }); }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "mock-meeting-1", segment_count: received.at(-1)?.segments?.length || 0 }));
    });
    return;
  }
  if (req.url === "/received") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(received));
    return;
  }
  res.statusCode = 404;
  res.end("not found");
});

server.listen(8899, () => console.log("mock target + captions on http://localhost:8899"));
