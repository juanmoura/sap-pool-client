import { Client, Pool, RfcConnectionParameters } from "node-rfc";
import { v4 } from "uuid";

export interface IABAP {
  user: string;
  passwd: string;
  ashost: string;
  sysnr: string;
  client: string;
  lang: string;
  group?: string;
  port?: string;
}

class SapClient {
  private pool: Pool;
  private config: Partial<RfcConnectionParameters>;
  private poolMaxConnections: number;
  withLogDetail = false;

  constructor(abap: IABAP, withLogDetail?: boolean, poolMaxConnections = 10) {
    this.withLogDetail = withLogDetail ?? false;
    this.poolMaxConnections = poolMaxConnections;
    const envs: Partial<RfcConnectionParameters> = {
      user: abap.user,
      passwd: abap.passwd,
      sysnr: abap.sysnr,
      lang: abap.lang,
      client: abap.client,
    };
    if (abap.group) {
      envs.group = abap.group;
      envs.mshost = abap.ashost;
      envs.msserv = abap.port;
    } else {
      envs.ashost = abap.ashost;
    }
    this.config = envs;

    this.pool = new Pool({
      connectionParameters: this.config,
      clientOptions: { timeout: 30 },
      poolOptions: { low: 0, high: this.poolMaxConnections },
    });
    console.warn("Sap Pool created");
  }

  async close() {
    await this.pool.closeAll();
  }

  /**
   * Acquires a connection from the pool with a timeout and a health check.
   */
  private async acquireWithTimeout(timeoutMs = 60000): Promise<Client> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(
          new Error(
            `SAP Acquisition Timeout: Could not acquire connection after ${timeoutMs}ms. Pool Status: [ready:${this.pool.status.ready}, leased:${this.pool.status.leased}]`,
          ),
        );
      }, timeoutMs);
    });

    try {
      // Race the pool acquisition against our timeout
      const client = (await Promise.race([
        this.pool.acquire(),
        timeoutPromise,
      ])) as Client;

      // Basic health check
      if (!client.alive) {
        console.warn(
          "SAP: Acquired connection is dead. Closing and attempting one more retry.",
        );
        await client.close(); // Ensure the dead one is properly closed
        return (await Promise.race([
          this.pool.acquire(),
          timeoutPromise,
        ])) as Client;
      }

      return client;
    } catch (err) {
      throw err;
    }
  }

  async call<T>(
    trans: string,
    params?: any,
    supressLogs = false,
    timeout = 30,
  ): Promise<T> {
    const now = new Date().getTime();
    const hash = v4();

    let client: Client | undefined;

    try {
      if (!supressLogs) console.log(`[${hash}][acquiring]`);

      // Hand over connection management to the robust acquire logic
      client = await this.acquireWithTimeout();

      if (client && client.alive) {
        if (!supressLogs)
          console.log(
            `[${hash}][call][r:${this.pool?.status?.ready}][l:${this.pool?.status?.leased}][${trans}]`,
            `[${hash}][${JSON.stringify(params, null, 2)}]`,
          );

        const res = await client.call(trans, params, { timeout: timeout });

        if (this.withLogDetail && !supressLogs) {
          console.log(`[${hash}]Response: `);
          console.log(JSON.stringify(res, null, 2));
        }

        console.debug(
          `[${hash}][${new Date().getTime() - now}ms][r:${this.pool?.status?.ready}][l:${
            this.pool?.status?.leased - 1
          }]`,
        );
        return res as T;
      }

      throw new Error(`[${hash}] Failed to acquire a live SAP connection`);
    } catch (err: any) {
      console.error(`[${hash}] SAP Call Error:`, err);
      // Return a structured error to avoid [object Object] issues
      const errorMessage = err.message || JSON.stringify(err, null, 2);
      throw new Error(`[${hash}] SAP_CLIENT_ERROR: ${errorMessage}`);
    } finally {
      if (client) {
        // Always release back to pool
        await this.pool.release(client);
      }
    }
  }
}

export { SapClient };
