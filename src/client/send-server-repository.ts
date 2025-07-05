#!/usr/bin/env node

class SendServerRepository {
  private serverUrl: string;
  private requestId: number = 1;

  constructor(serverUrl: string = "http://localhost:3000") {
    this.serverUrl = serverUrl;
  }

  async makeRequest(method: string, params: any = {}, headers?: RequestInit['headers']): Promise<Response> {
    const request = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method,
      params,
    };

    const response = await fetch(`${this.serverUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(headers ?? {}) },
      body: JSON.stringify(request),
    });

    return response
  }
}

export { SendServerRepository };