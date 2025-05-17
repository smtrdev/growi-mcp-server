import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { z } from 'zod';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';

import { GrowiClient } from './growi-client.js';

// Import tool schemas and implementations
import { listPages, listPagesSchema } from './tools/list-pages.js';
import { recentlyUpdatedPages, recentlyUpdatedPagesSchema } from './tools/recently-updated-pages.js';

// ログファイルの設定
const logDir = path.join(process.cwd(), 'logs');
let logStream: fs.WriteStream | null = null;

try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }
  const logFile = path.join(logDir, `mcp-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  logStream = fs.createWriteStream(logFile, { flags: 'a' });
} catch (error) {
  // ログ設定に失敗した場合は何もしない
}

// ログを書き込む関数（ファイルのみ）
function writeLog(level: string, ...args: any[]) {
  if (!logStream) return;
  
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ')}`;
  
  logStream.write(logMessage + '\n');
}

// ログレベル別の関数
const logger = {
  info: (...args: any[]) => writeLog('INFO', ...args),
  error: (...args: any[]) => writeLog('ERROR', ...args),
  debug: (...args: any[]) => writeLog('DEBUG', ...args),
  warn: (...args: any[]) => writeLog('WARN', ...args)
};

// ログファイルの情報を出力
logger.info(`MCP Server logs will be written to logs directory`);

// Load environment variables
dotenv.config();

// Initialize the Growi client
const apiUrl = process.env.GROWI_API_URL;
const apiToken = process.env.GROWI_API_TOKEN;

if (!apiUrl || !apiToken) {
  logger.error('Error: GROWI_API_URL and GROWI_API_TOKEN must be set in your environment or .env file');
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

/**
 * 直接curlのようなHTTPリクエストを実行する関数
 * @param path ページのパス
 * @param limit 一度に取得するページ数
 * @param page ページ番号
 */
async function directGrowiRequest(path: string = '/', limit: number = 5, page: number = 1) {
  return new Promise<any>((resolve, reject) => {
    // URLの構築
    if (!apiUrl || !apiToken) {
      reject(new Error('Missing API URL or token'));
      return;
    }
    
    const url = new URL(`${apiUrl}/_api/v3/pages/list`);
    url.searchParams.append('path', path);
    url.searchParams.append('limit', String(limit));
    url.searchParams.append('page', String(page));
    
    // アクセストークンはリクエストボディで送信
    const urlString = url.toString();
    const postData = `access_token=${encodeURIComponent(apiToken)}`;
    
    const parsedUrl = new URL(urlString);
    
    // curlと同じリクエストオプション
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'GET',
      headers: {
        'User-Agent': 'curl/8.7.1',
        'Accept': '*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    // トークンを隠した形でログ出力
    const safeToken = apiToken.substring(0, 5) + '...';
    logger.info(`Direct curl request: ${parsedUrl.protocol}//${parsedUrl.hostname}${options.path}`);
    logger.info(`Sending access_token in request body: ${safeToken}`);
    
    // HTTPリクエスト実行
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      logger.info(`Response status: ${res.statusCode}`);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString();
      });
      
      res.on('end', () => {
        logger.info(`Response completed. Data length: ${data.length}`);
        
        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data);
            logger.info(`Got ${jsonData.pages?.length || 0} pages out of ${jsonData.totalCount} total`);
            
            // 結果をMCPツール用に整形
            const pagesCount = jsonData.pages?.length || 0;
            const totalCount = jsonData.totalCount || 0;
            const startIndex = (page - 1) * limit + 1;
            const endIndex = Math.min(startIndex + pagesCount - 1, totalCount);
            
            let resultText = '';
            if (pagesCount === 0) {
              resultText = `No pages found under path: ${path}`;
            } else {
              resultText = `Found ${pagesCount} pages under path: ${path}\n\n`;
              jsonData.pages.forEach((page: any, index: number) => {
                resultText += `- ${page.path}\n`;
              });
              
              resultText += `\nShowing ${startIndex}-${endIndex} of ${totalCount} total pages`;
            }
            
            resolve({
              content: [
                {
                  type: 'text',
                  text: resultText,
                },
              ],
            });
          } catch (error) {
            logger.error('Failed to parse JSON response:', error instanceof Error ? error.message : String(error));
            reject(error);
          }
        } else {
          logger.error(`HTTP Error: ${res.statusCode} - ${data}`);
          resolve({
            content: [
              {
                type: 'text',
                text: `Error listing pages (path: ${path}, offset: ${(page-1) * limit}): HTTP Error (${res.statusCode}) - ${data}`,
              },
            ],
          });
        }
      });
    });
    
    req.on('error', (error) => {
      logger.error(`Request error: ${error.message}`);
      reject(error);
    });
    
    // Send the request with the access token in the body
    req.write(postData);
    req.end();
  });
}

// Register tools - this is for the MCP 'tools/list' method
server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    logger.info('Handling tools/list request');
    return {
      tools: [
        {
          name: 'mcp_growi_growi_list_pages',
          description: 'List GROWI pages under a specific path',
          inputSchema: zodToJsonSchema(listPagesSchema),
        },
        {
          name: 'mcp_growi_growi_recently_updated_pages',
          description: 'Get recently updated GROWI pages',
          inputSchema: zodToJsonSchema(recentlyUpdatedPagesSchema),
        },
      ],
    };
  } catch (error) {
    logger.error('Error handling tools/list request:', error);
    throw error;
  }
});

// Tool call handler - this is for the MCP 'tools/call' method
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  try {
    const { name, arguments: args } = request.params;
    logger.info(`Handling tools/call request for tool: ${name}`);
    logger.info(`Tool arguments:`, JSON.stringify(args, null, 2));
    logger.info(`Request details:`, JSON.stringify({
      id: request.id,
      jsonrpc: request.jsonrpc,
      method: request.method,
      params: {
        name: request.params.name,
        arguments: request.params.arguments
      }
    }, null, 2));

    let result;
    switch (name) {
      case 'mcp_growi_growi_list_pages':
        // 直接HTTP実装を使用
        try {
          logger.info(`Executing tool '${name}' with args:`, JSON.stringify(args, null, 2));
          const path = args.path || '/';
          const limit = parseInt(args.limit || '5', 10);
          const page = parseInt(args.page || '1', 10);
          
          logger.info(`Preparing to call GROWI API with: path=${path}, limit=${limit}, page=${page}`);
          // curlのような直接HTTPリクエストで結果を返す
          result = await directGrowiRequest(path, limit, page);
          logger.info(`Tool execution completed successfully for '${name}'`);
          logger.info(`Response summary:`, JSON.stringify({
            contentLength: result.content?.[0]?.text?.length || 0,
            hasContent: !!result.content?.length
          }, null, 2));
          return result;
        } catch (directError) {
          logger.error(`Direct HTTP request failed: ${directError instanceof Error ? directError.message : String(directError)}`);
          logger.error(`Falling back to GrowiClient implementation`);
          
          // エラーが発生した場合は元の実装にフォールバック
          result = await listPages(growiClient, args as any);
          logger.info(`Fallback execution completed for '${name}'`);
          logger.info(`Fallback response summary:`, JSON.stringify({
            contentLength: result.content?.[0]?.text?.length || 0,
            hasContent: !!result.content?.length
          }, null, 2));
          return result;
        }

      case 'mcp_growi_growi_recently_updated_pages':
        try {
          logger.info(`Executing tool '${name}' with args:`, JSON.stringify(args, null, 2));
          const limit = parseInt(args.limit || '20', 10);
          const offset = parseInt(args.offset || '0', 10);

          logger.info(`Preparing to call GROWI API with: limit=${limit}, offset=${offset}`);
          result = await recentlyUpdatedPages(growiClient, { limit, offset });
          logger.info(`Tool execution completed successfully for '${name}'`);
          logger.info(`Response summary:`, JSON.stringify({
            contentLength: result.content?.[0]?.text?.length || 0,
            hasContent: !!result.content?.length
          }, null, 2));
          return result;
        } catch (error) {
          logger.error(`Error executing '${name}': ${error instanceof Error ? error.message : String(error)}`);
          return {
            isError: true,
            content: [
              { type: 'text', text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }

      default:
        logger.error(`Unknown tool requested: ${name}`);
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
  } catch (error) {
    logger.error('Error handling tools/call request:', error);
    logger.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

// Start the server
async function main() {
  try {
    const transport = new StdioServerTransport();
    logger.info('Connecting to transport...');
    await server.connect(transport);
    logger.info('GROWI MCP server is running');
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main(); 