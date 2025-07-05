import { MCPClient } from "./mcp-client";
import { app, port } from "./simple-http-server";

async function main() {
    console.error('Starting MCP Client...');

    app.listen(port, () => {
        console.log('MCP Client HTTP Server running on http://localhost:' + port);
    })

    const proxy = new MCPClient();
    await proxy.start();
}


if (require.main === module) {
    main().catch(console.error);
}