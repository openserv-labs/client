import type { PlatformClient } from "./client";

/**
 * Metadata for a single model parameter.
 */
export interface ModelParameterMeta {
  type: "number" | "boolean" | "enum";
  default: number | boolean | string;
  min?: number;
  max?: number;
  values?: string[];
}

/**
 * Information about an available model including its provider and parameter schema.
 */
export interface ModelInfo {
  model: string;
  provider: string;
  parameters: Record<string, ModelParameterMeta>;
}

/**
 * Response from the GET /agents/models endpoint.
 */
export interface ModelsResponse {
  models: ModelInfo[];
  default: string;
}

/**
 * API for discovering available LLM models on the OpenServ platform.
 *
 * @example
 * ```typescript
 * const client = new PlatformClient({ apiKey: 'your-key' });
 * const { models, default: defaultModel } = await client.models.list();
 * console.log('Available models:', models.map(m => m.model));
 * console.log('Default model:', defaultModel);
 * ```
 */
export class ModelsAPI {
  constructor(private client: PlatformClient) {}

  /**
   * List all available models with their parameter schemas.
   * @returns Available models, their providers, parameter metadata, and the platform default model
   */
  async list(): Promise<ModelsResponse> {
    return this.client.get<ModelsResponse>("/agents/models");
  }
}
