declare module "pg" {
  export class Pool {
    constructor(config?: unknown);
    query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
  }
}
