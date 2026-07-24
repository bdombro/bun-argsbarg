import { expect, test } from "bun:test";
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
  expect(out.properties).toEqual({
    invoice: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  });
  expect(out.definitions).toBeUndefined();
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
  expect(out.properties).toEqual({ item: { type: "string" } });
  expect(out.$defs).toBeUndefined();
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
  expect(out.properties.invoice).toEqual({
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
  expect(out.properties.self.type).toBe("object");
  expect(out.properties.self.properties.again).toEqual({ $ref: "#/definitions/Node" });
});

test("dereferenceJsonSchema leaves external refs unchanged", () => {
  const schema = {
    type: "object",
    properties: {
      remote: { $ref: "https://example.com/schema.json" },
    },
  };
  const out = dereferenceJsonSchema(schema);
  expect(out.properties).toEqual({
    remote: { $ref: "https://example.com/schema.json" },
  });
});
