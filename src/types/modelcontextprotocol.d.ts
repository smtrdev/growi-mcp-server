declare module '@modelcontextprotocol/sdk/server' {
  export class Server {
    constructor(
      info: { name: string; version: string },
      options: { capabilities: { tools?: {}; resources?: {}; prompts?: {} } }
    );
    connect(transport: any): Promise<void>;
    setRequestHandler(schema: any, handler: (request: any) => Promise<any>): void;
  }
}

declare module '@modelcontextprotocol/sdk/server/stdio' {
  export class StdioServerTransport {
    constructor();
  }
}

declare module '@modelcontextprotocol/sdk/types' {
  export const ListToolsRequestSchema: any;
  export const CallToolRequestSchema: any;
  export const ListResourcesRequestSchema: any;
  export const ReadResourceRequestSchema: any;
  export const ListPromptsRequestSchema: any;
  export const ReadPromptRequestSchema: any;
} 