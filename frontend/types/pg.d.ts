declare module "pg" {
  export type PoolClient = {
    query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
    release(): void;
  };

  export class Pool {
    constructor(config?: unknown);
    query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
    connect(): Promise<PoolClient>;
  }
}
