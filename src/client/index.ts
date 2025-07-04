import { app, port } from "./client-view";
import { MCPClient } from "./mcp-client";

async function main() {
    const proxy = new MCPClient();
    await proxy.start();
    app.listen(port, () => {
        console.log(`MCP Client running on port ${port}`);
    });
}

if (require.main === module) {
    main().catch(console.error);
}