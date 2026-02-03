import { describe, it } from "node:test";
import assert from "node:assert";
import {
  triggers,
  inputSchemaToJsonSchema,
  triggerConfigToProps,
} from "../../src/triggers-api";

describe("Triggers Helpers", () => {
  describe("triggers factory", () => {
    it("should create a webhook trigger config", () => {
      const config = triggers.webhook();
      assert.strictEqual(config.type, "webhook");
    });

    it("should create a webhook trigger config with options", () => {
      const config = triggers.webhook({
        waitForCompletion: true,
        timeout: 300,
        input: { query: { type: "string" } },
      });

      assert.strictEqual(config.type, "webhook");
      assert.strictEqual(config.waitForCompletion, true);
      assert.strictEqual(config.timeout, 300);
      assert.deepStrictEqual(config.input, { query: { type: "string" } });
    });

    it("should create an x402 trigger config", () => {
      const config = triggers.x402({ price: "0.01" });
      assert.strictEqual(config.type, "x402");
      assert.strictEqual(config.price, "0.01");
    });

    it("should create an x402 trigger config with all options", () => {
      const config = triggers.x402({
        price: "0.05",
        timeout: 600,
        walletAddress: "0x123",
        input: { prompt: { type: "string", description: "User prompt" } },
      });

      assert.strictEqual(config.type, "x402");
      assert.strictEqual(config.price, "0.05");
      assert.strictEqual(config.timeout, 600);
      assert.strictEqual(config.walletAddress, "0x123");
      assert.ok(config.input?.prompt);
    });

    it("should create an x402 trigger config with name and description", () => {
      const config = triggers.x402({
        name: "AI Research Assistant",
        description:
          "Get comprehensive research reports on any topic powered by AI",
        price: "0.01",
      });

      assert.strictEqual(config.type, "x402");
      assert.strictEqual(config.name, "AI Research Assistant");
      assert.strictEqual(
        config.description,
        "Get comprehensive research reports on any topic powered by AI",
      );
      assert.strictEqual(config.price, "0.01");
    });

    it("should create a webhook trigger config with name and description", () => {
      const config = triggers.webhook({
        name: "Data Ingestion Webhook",
        description: "Receives data from external systems for processing",
        waitForCompletion: true,
      });

      assert.strictEqual(config.type, "webhook");
      assert.strictEqual(config.name, "Data Ingestion Webhook");
      assert.strictEqual(
        config.description,
        "Receives data from external systems for processing",
      );
    });

    it("should create a cron trigger config with name and description", () => {
      const config = triggers.cron({
        name: "Daily Report Generator",
        description: "Generates daily analytics reports",
        schedule: "0 9 * * *",
      });

      assert.strictEqual(config.type, "cron");
      assert.strictEqual(config.name, "Daily Report Generator");
      assert.strictEqual(
        config.description,
        "Generates daily analytics reports",
      );
    });

    it("should create a manual trigger config with name and description", () => {
      const config = triggers.manual({
        name: "Manual Test Trigger",
        description: "For testing workflows manually",
      });

      assert.strictEqual(config.type, "manual");
      assert.strictEqual(config.name, "Manual Test Trigger");
      assert.strictEqual(config.description, "For testing workflows manually");
    });

    it("should create a cron trigger config", () => {
      const config = triggers.cron({ schedule: "0 9 * * *" });
      assert.strictEqual(config.type, "cron");
      assert.strictEqual(config.schedule, "0 9 * * *");
    });

    it("should create a cron trigger config with timezone", () => {
      const config = triggers.cron({
        schedule: "0 9 * * *",
        timezone: "America/New_York",
      });

      assert.strictEqual(config.type, "cron");
      assert.strictEqual(config.schedule, "0 9 * * *");
      assert.strictEqual(config.timezone, "America/New_York");
    });

    it("should create a manual trigger config", () => {
      const config = triggers.manual();
      assert.strictEqual(config.type, "manual");
    });
  });

  describe("inputSchemaToJsonSchema", () => {
    it("should convert simple input schema to JSON schema", () => {
      const input = {
        name: { type: "string" as const },
        age: { type: "number" as const },
      };

      const schema = inputSchemaToJsonSchema(input);

      assert.strictEqual(
        schema.$schema,
        "http://json-schema.org/draft-07/schema#",
      );
      assert.strictEqual(schema.type, "object");
      assert.deepStrictEqual(schema.properties, {
        name: { type: "string" },
        age: { type: "number" },
      });
      assert.deepStrictEqual(schema.required, ["name", "age"]);
    });

    it("should include optional fields with descriptions", () => {
      const input = {
        query: {
          type: "string" as const,
          title: "Search Query",
          description: "The search term to use",
        },
      };

      const schema = inputSchemaToJsonSchema(input);
      const queryProp = schema.properties as Record<string, unknown>;

      assert.deepStrictEqual(queryProp.query, {
        type: "string",
        title: "Search Query",
        description: "The search term to use",
      });
    });

    it("should handle enum values", () => {
      const input = {
        status: {
          type: "string" as const,
          enum: ["pending", "active", "completed"],
        },
      };

      const schema = inputSchemaToJsonSchema(input);
      const statusProp = (schema.properties as Record<string, unknown>)
        .status as Record<string, unknown>;

      assert.deepStrictEqual(statusProp.enum, [
        "pending",
        "active",
        "completed",
      ]);
    });

    it("should mark fields with defaults as optional", () => {
      const input = {
        required_field: { type: "string" as const },
        optional_field: { type: "string" as const, default: "default_value" },
      };

      const schema = inputSchemaToJsonSchema(input);

      // Only required_field should be in required array
      assert.deepStrictEqual(schema.required, ["required_field"]);
    });

    it("should include default values", () => {
      const input = {
        limit: { type: "number" as const, default: 10 },
      };

      const schema = inputSchemaToJsonSchema(input);
      const limitProp = (schema.properties as Record<string, unknown>)
        .limit as Record<string, unknown>;

      assert.strictEqual(limitProp.default, 10);
    });
  });

  describe("triggerConfigToProps", () => {
    it("should convert webhook config to props", () => {
      const config = triggers.webhook({
        waitForCompletion: true,
        timeout: 300,
      });

      const props = triggerConfigToProps(config);

      assert.strictEqual(props.waitForCompletion, true);
      assert.strictEqual(props.timeout, 300);
    });

    it("should use default values for webhook config", () => {
      const config = triggers.webhook();
      const props = triggerConfigToProps(config);

      assert.strictEqual(props.waitForCompletion, false);
      assert.strictEqual(props.timeout, 180);
    });

    it("should convert webhook config with input schema", () => {
      const config = triggers.webhook({
        input: { query: { type: "string" } },
      });

      const props = triggerConfigToProps(config);

      assert.ok(props.inputSchema);
      const inputSchema = props.inputSchema as Record<string, unknown>;
      assert.strictEqual(
        inputSchema.$schema,
        "http://json-schema.org/draft-07/schema#",
      );
    });

    it("should convert x402 config to props", () => {
      const config = triggers.x402({
        price: "0.05",
        timeout: 600,
        walletAddress: "0x123",
      });

      const props = triggerConfigToProps(config);

      assert.strictEqual(props.x402Pricing, "0.05");
      assert.strictEqual(props.timeout, 600);
      assert.strictEqual(props.x402WalletAddress, "0x123");
    });

    it("should use default timeout for x402 config", () => {
      const config = triggers.x402({ price: "0.01" });
      const props = triggerConfigToProps(config);

      assert.strictEqual(props.x402Pricing, "0.01");
      assert.strictEqual(props.timeout, 180);
      assert.strictEqual(props.x402WalletAddress, undefined);
    });

    it("should convert cron config to props", () => {
      const config = triggers.cron({
        schedule: "0 9 * * *",
        timezone: "America/New_York",
      });

      const props = triggerConfigToProps(config);

      assert.strictEqual(props.schedule, "0 9 * * *");
      assert.strictEqual(props.timezone, "America/New_York");
    });

    it("should use UTC as default timezone for cron config", () => {
      const config = triggers.cron({ schedule: "0 0 * * *" });
      const props = triggerConfigToProps(config);

      assert.strictEqual(props.schedule, "0 0 * * *");
      assert.strictEqual(props.timezone, "UTC");
    });

    it("should convert manual config to empty props", () => {
      const config = triggers.manual();
      const props = triggerConfigToProps(config);

      assert.deepStrictEqual(props, {});
    });
  });
});
