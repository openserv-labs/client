import axios, { type AxiosError, type AxiosInstance } from "axios";

const DEFAULT_ORCHESTRATOR_URL = "https://agent-orchestrator.openserv.ai";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | undefined,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  apiKey: string;
  orchestratorUrl?: string;
}

export interface ContainerInfo {
  id: string;
  appName: string;
  machineId: string;
  status: string;
}

export interface StatusInfo {
  id: string;
  appName: string;
  machineId: string;
  status: string;
  machineState: string;
  metadata: Record<string, unknown>;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GoLiveResult {
  publicUrl: string;
}

export class ApiClient {
  private client: AxiosInstance;

  constructor(opts: ApiClientOptions) {
    const headers: Record<string, string> = {
      "x-openserv-key": opts.apiKey,
    };

    this.client = axios.create({
      baseURL: opts.orchestratorUrl || DEFAULT_ORCHESTRATOR_URL,
      headers,
      maxBodyLength: 100 * 1024 * 1024,
      maxContentLength: 100 * 1024 * 1024,
    });
  }

  async createContainer(): Promise<ContainerInfo> {
    return this.request<ContainerInfo>("POST", "/container/create");
  }

  async getStatus(id: string): Promise<StatusInfo> {
    return this.request<StatusInfo>("GET", `/container/${id}/status`);
  }

  async upload(id: string, tarBuffer: Buffer): Promise<void> {
    await this.request("POST", `/container/${id}/upload`, tarBuffer, {
      headers: { "Content-Type": "application/gzip" },
    });
  }

  async exec(
    id: string,
    command: string[],
    timeout?: number,
  ): Promise<ExecResult> {
    return this.request<ExecResult>("POST", `/container/${id}/exec`, {
      command,
      timeout,
    });
  }

  async start(id: string, entrypoint?: string): Promise<void> {
    await this.request("POST", `/container/${id}/start`, {
      entrypoint: entrypoint || "npx tsx src/agent.ts",
    });
  }

  async restart(id: string): Promise<void> {
    await this.request("POST", `/container/${id}/restart`);
  }

  async goLive(id: string, mode = "on-demand"): Promise<GoLiveResult> {
    return this.request<GoLiveResult>("POST", `/container/${id}/go-live`, {
      mode,
    });
  }

  async updateEndpointUrl(
    agentId: number,
    agentApiKey: string,
    endpointUrl: string,
  ): Promise<void> {
    const platformUrl =
      process.env.OPENSERV_API_URL || "https://api.openserv.ai";
    await axios.put(
      `${platformUrl}/agents/${agentId}/endpoint-url`,
      { endpoint_url: endpointUrl },
      { headers: { "x-openserv-key": agentApiKey } },
    );
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    config?: { headers?: Record<string, string> },
  ): Promise<T> {
    try {
      const res = await this.client.request<T>({
        method,
        url: path,
        data: body,
        ...config,
      });
      return res.data;
    } catch (err) {
      const axiosErr = err as AxiosError;
      const statusCode = axiosErr.response?.status;
      const data = axiosErr.response?.data ?? axiosErr.message;
      const detail = typeof data === "string" ? data : JSON.stringify(data);
      throw new ApiError(
        `${method} ${path} failed (${statusCode ?? "unknown"}): ${detail}`,
        statusCode,
      );
    }
  }
}
