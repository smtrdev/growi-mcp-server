import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { z } from 'zod';

import { GrowiClient } from './growi-client.js';

// Import tool schemas and implementations
import { listPages, listPagesSchema } from './tools/list-pages.js';

// Load environment variables
dotenv.config();

// Initialize the Growi client
const apiUrl = process.env.GROWI_API_URL;
const apiToken = process.env.GROWI_API_TOKEN;

if (!apiUrl || !apiToken) {
  console.error('Error: GROWI_API_URL and GROWI_API_TOKEN must be set in your environment or .env file');
  process.exit(1);
}

const growiClient = new GrowiClient(apiUrl, apiToken);

// Initialize the MCP server
const server = new Server(
  {
    name: 'growi-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper function to convert Zod schema to JSON schema
function zodToJsonSchema(schema: z.ZodType<any, any, any>) {
  // Convert Zod schema to raw JSON Schema
  const jsonSchema = schema.safeParse({});
  const outputSchema: Record<string, any> = {
    type: 'object',
    properties: {},
    required: [],
  };

  // For each property in the schema
  Object.entries(schema._def.shape()).forEach(([key, value]: [string, any]) => {
    const isOptional = value._def.typeName === 'ZodOptional';
    const valueSchema = isOptional ? value._def.innerType : value;
    const description = valueSchema._def.description;
    
    let type: string;
    switch (valueSchema._def.typeName) {
      case 'ZodString':
        type = 'string';
        break;
      case 'ZodNumber':
        type = 'number';
        break;
      case 'ZodBoolean':
        type = 'boolean';
        break;
      default:
        type = 'string';
    }
    
    outputSchema.properties[key] = {
      type,
      description: description || `The ${key} parameter`,
    };
    
    if (!isOptional) {
      outputSchema.required.push(key);
    }
  });
  
  return outputSchema;
}

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'growi_list_pages',
        description: 'List GROWI pages under a specific path',
        inputSchema: zodToJsonSchema(listPagesSchema),
      },
    ],
  };
});

// Tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'growi_list_pages':
      return await listPages(growiClient, args as any);

    default:
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
      };
  }
});

// Start the server
async function main() {
  try {
    const transport = new StdioServerTransport();
    console.error('Connecting to transport...');
    await server.connect(transport);
    console.error('GROWI MCP server is running');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main(); 