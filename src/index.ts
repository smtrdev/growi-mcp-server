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

// ログファイルの設定
const logDir = path.join(process.cwd(), 'logs');
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }
  const logFile = path.join(logDir, `mcp-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  
  // メモリ内ログバッファ（最新100件のログを保持）
  const logBuffer: string[] = [];
  const MAX_LOG_BUFFER = 100;
  
  // ロガー関数
  const logToFileAndStderr = (...args: any[]) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ')}`;
    
    // ログをバッファに追加
    logBuffer.push(logMessage);
    if (logBuffer.length > MAX_LOG_BUFFER) {
      logBuffer.shift();
    }
    
    // ファイルとstderrに書き込み
    logStream.write(logMessage + '\n');
    console.error(logMessage);
  };
  
  // コンソールログをオーバーライド
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  console.log = (...args) => {
    logToFileAndStderr(...args);
    originalConsoleLog(...args);
  };
  console.error = (...args) => {
    logToFileAndStderr(...args);
    originalConsoleError(...args);
  };
  
  // ログファイルの情報を出力
  console.error(`📝 MCP Server logs will be written to: ${logFile}`);
  
} catch (error) {
  console.error(`⚠️ Failed to initialize logging: ${error}`);
}

// Redirect all console logs to stderr to ensure clean JSON output on stdout
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
    
    // 重要: クエリパラメータとしてトークンを直接追加
    // URLSearchParamsを使わず、直接文字列に追加する
    const urlString = url.toString() + `&access_token=${encodeURIComponent(apiToken)}`;
    
    const parsedUrl = new URL(urlString);
    
    // curlと同じリクエストオプション
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'GET',
      headers: {
        'User-Agent': 'curl/8.7.1',
        'Accept': '*/*'
      }
    };
    
    // トークンを隠した形でログ出力
    const safeToken = apiToken.substring(0, 5) + '...';
    console.error(`🌐 Direct curl request: ${parsedUrl.protocol}//${parsedUrl.hostname}${options.path.replace(apiToken, safeToken)}`);
    
    // HTTPリクエスト実行
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      console.error(`🔄 Response status: ${res.statusCode}`);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString();
      });
      
      res.on('end', () => {
        console.error(`✅ Response completed. Data length: ${data.length}`);
        
        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data);
            console.error(`📊 Got ${jsonData.pages?.length || 0} pages out of ${jsonData.totalCount} total`);
            
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
            console.error(`❌ Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`);
            reject(error);
          }
        } else {
          console.error(`❌ HTTP Error: ${res.statusCode} - ${data}`);
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
      console.error(`❌ Request error: ${error.message}`);
      reject(error);
    });
    
    req.end();
  });
}

// Register tools - this is for the MCP 'tools/list' method
server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    console.log('📋 Handling tools/list request');
    return {
      tools: [
        {
          name: 'mcp_growi_growi_list_pages',
          description: 'List GROWI pages under a specific path',
          inputSchema: zodToJsonSchema(listPagesSchema),
        },
      ],
    };
  } catch (error) {
    console.error('❌ Error handling tools/list request:', error);
    throw error;
  }
});

// Tool call handler - this is for the MCP 'tools/call' method
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  try {
    const { name, arguments: args } = request.params;
    console.log(`📋 Handling tools/call request for tool: ${name}`);
    console.log(`📋 Tool arguments:`, JSON.stringify(args, null, 2));
    console.log(`🔍 Request details:`, JSON.stringify({
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
          console.log(`🚀 Executing tool '${name}' with args:`, JSON.stringify(args, null, 2));
          const path = args.path || '/';
          const limit = parseInt(args.limit || '5', 10);
          const page = parseInt(args.page || '1', 10);
          
          console.log(`🌐 Preparing to call GROWI API with: path=${path}, limit=${limit}, page=${page}`);
          // curlのような直接HTTPリクエストで結果を返す
          result = await directGrowiRequest(path, limit, page);
          console.log(`✅ Tool execution completed successfully for '${name}'`);
          console.log(`📊 Response summary:`, JSON.stringify({
            contentLength: result.content?.[0]?.text?.length || 0,
            hasContent: !!result.content?.length
          }, null, 2));
          return result;
        } catch (directError) {
          console.error(`❌ Direct HTTP request failed: ${directError instanceof Error ? directError.message : String(directError)}`);
          console.error(`🔄 Falling back to GrowiClient implementation`);
          
          // エラーが発生した場合は元の実装にフォールバック
          result = await listPages(growiClient, args as any);
          console.log(`🔄 Fallback execution completed for '${name}'`);
          console.log(`📊 Fallback response summary:`, JSON.stringify({
            contentLength: result.content?.[0]?.text?.length || 0,
            hasContent: !!result.content?.length
          }, null, 2));
          return result;
        }

      default:
        console.error(`❌ Unknown tool requested: ${name}`);
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
    console.error('❌ Error handling tools/call request:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
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
    console.error('Connecting to transport...');
    await server.connect(transport);
    console.error('GROWI MCP server is running');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main(); 