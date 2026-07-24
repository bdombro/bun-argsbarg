/*
Helpers for ctx.respond(): content-type defaults and CLI stdout serialization.
*/

import type { CliRespondBody, CliRespondOptions } from "./types.ts";

/** Fills default contentType on respond options based on body shape. */
export function normalizeRespondOptions(opts: CliRespondOptions): CliRespondOptions {
  if (opts.contentType !== undefined) {
    return opts;
  }
  const body = opts.body;
  if (body instanceof Uint8Array) {
    throw new Error("ctx.respond() with Uint8Array body requires an explicit contentType");
  }
  if (typeof body === "string") {
    return { ...opts, contentType: "text/plain; charset=utf-8" };
  }
  return { ...opts, contentType: "application/json; charset=utf-8" };
}

/** Writes a respond body to process.stdout for CLI invocations. */
export function writeRespondBodyToStdout(body: CliRespondBody): void {
  if (body instanceof Uint8Array) {
    process.stdout.write(body);
    return;
  }
  if (typeof body === "string") {
    process.stdout.write(body);
    if (!body.endsWith("\n")) {
      process.stdout.write("\n");
    }
    return;
  }
  process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
}

/** Encodes binary respond bodies as base64 for MCP structuredContent. */
export function encodeRespondBodyBase64(body: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(body).toString("base64");
  }
  let binary = "";
  for (const byte of body) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
