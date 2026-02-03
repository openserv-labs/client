import type { PlatformClient } from "./client";
import type {
  TriggerDefinition,
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
    triggers?: TriggerDefinition[];
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
   * Set the workflow to running state
   */
  async setRunning(): Promise<void> {
    await this.client.workflows.setRunning({ id: this.id });
    this.status = "running";
  }
}
