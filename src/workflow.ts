import type { PlatformClient } from "./client";
import type { TriggerConfig } from "./triggers-api";
import type {
  TaskDefinition,
  EdgeDefinition,
  WorkflowData,
  Trigger,
  Task,
  Edge,
  Agent,
} from "./types";

export class Workflow {
  readonly id: number;
  /** Workflow name. Also used as the agent name in ERC-8004. */
  readonly name: string;
  readonly goal: string;
  status: string;
  triggers: Trigger[];
  tasks: Task[];
  edges: Edge[];
  agents: Agent[];

  private client: PlatformClient;

  constructor(data: WorkflowData, client: PlatformClient) {
    this.id = data.id;
    this.name = data.name;
    this.goal = data.goal;
    this.status = data.status;
    this.triggers = data.triggers;
    this.tasks = data.tasks;
    this.edges = data.edges;
    this.agents = data.agents;
    this.client = client;
  }

  /**
   * Sync the workflow with a new configuration (declarative update)
   */
  async sync(config: {
    triggers?: TriggerConfig[];
    tasks?: TaskDefinition[];
    edges?: EdgeDefinition[];
  }): Promise<void> {
    await this.client.workflows.sync({
      id: this.id,
      triggers: config.triggers,
      tasks: config.tasks,
      edges: config.edges,
    });

    // Refresh local state
    const updated = await this.client.workflows.get({ id: this.id });
    this.triggers = updated.triggers;
    this.tasks = updated.tasks;
    this.edges = updated.edges;
    this.status = updated.status;
  }

  /**
   * Add an agent to this workflow's workspace.
   *
   * Required before assigning tasks to agents not yet in the workspace.
   * Called automatically by sync() when tasks reference new agents.
   *
   * @param agentId - The agent ID to add
   */
  async addAgent(agentId: number): Promise<void> {
    await this.client.workflows.addAgent({ id: this.id, agentId });
    // Refresh agents list
    const updated = await this.client.workflows.get({ id: this.id });
    this.agents = updated.agents;
  }

  /**
   * Set the workflow to running state
   */
  async setRunning(): Promise<void> {
    await this.client.workflows.setRunning({ id: this.id });
    this.status = "running";
  }
}
