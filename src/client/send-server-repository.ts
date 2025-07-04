#!/usr/bin/env node

class SendServerRepository {
  private serverUrl: string;
  private requestId: number = 1;

  constructor(serverUrl: string = "http://localhost:3000") {
    this.serverUrl = serverUrl;
  }

  async makeRequest(method: string, params: any = {}, oriRequest?: any): Promise<any> {
    const request = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method,
      params,
      oriRequest
    };

    const response = await fetch(`${this.serverUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result: any = await response.json();

    if (result.error) {
      throw new Error(`MCP error: ${result.error.message}`);
    }

    return result.result;
  }
}

export { SendServerRepository };