import assert from "node:assert/strict";
import { test } from "node:test";
import { dereferenceJsonSchema } from "./schema-deref.ts";

test("dereferenceJsonSchema inlines nested definitions", () => {
  const schema = {
    type: "object",
    properties: {
      invoice: { $ref: "#/definitions/InvoiceData" },
    },
    definitions: {
      InvoiceData: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  };
  const out = dereferenceJsonSchema(schema);
  assert.deepEqual(out.properties, {
    invoice: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  });
  assert.equal(out.definitions, undefined);
});

test("dereferenceJsonSchema supports $defs", () => {
  const schema = {
    type: "object",
    properties: {
      item: { $ref: "#/$defs/Item" },
    },
    $defs: {
      Item: { type: "string" },
    },
  };
  const out = dereferenceJsonSchema(schema);
  assert.deepEqual(out.properties, { item: { type: "string" } });
  assert.equal(out.$defs, undefined);
});

test("dereferenceJsonSchema merges $ref siblings", () => {
  const schema = {
    type: "object",
    properties: {
      invoice: {
        $ref: "#/definitions/InvoiceData",
        description: "Invoice payload",
      },
    },
    definitions: {
      InvoiceData: { type: "object" },
    },
  };
  const out = dereferenceJsonSchema(schema) as {
    properties: { invoice: { type: string; description: string } };
  };
  assert.deepEqual(out.properties.invoice, {
    type: "object",
    description: "Invoice payload",
  });
});

test("dereferenceJsonSchema ignores circular refs", () => {
  const schema = {
    type: "object",
    properties: {
      self: { $ref: "#/definitions/Node" },
    },
    definitions: {
      Node: {
        type: "object",
        properties: {
          again: { $ref: "#/definitions/Node" },
        },
      },
    },
  };
  const out = dereferenceJsonSchema(schema) as {
    properties: { self: { type: string; properties: { again: { $ref: string } } } };
  };
  assert.equal(out.properties.self.type, "object");
  assert.deepEqual(out.properties.self.properties.again, { $ref: "#/definitions/Node" });
});

test("dereferenceJsonSchema leaves external refs unchanged", () => {
  const schema = {
    type: "object",
    properties: {
      remote: { $ref: "https://example.com/schema.json" },
    },
  };
  const out = dereferenceJsonSchema(schema);
  assert.deepEqual(out.properties, {
    remote: { $ref: "https://example.com/schema.json" },
  });
});
