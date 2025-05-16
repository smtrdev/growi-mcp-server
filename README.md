# GROWI MCP Server

This Model Context Protocol (MCP) server provides integration between Claude Desktop and [GROWI](https://github.com/weseek/growi), a modern Wiki system. It allows Claude AI to interact with GROWI wikis - listing, reading, creating, updating, and searching pages.

## Features

- **List Pages**: List pages under a specific path
- And coming soon...

## Prerequisites

- Node.js v18+ or v20+
- A running GROWI instance
- A GROWI API token (generated from the GROWI admin panel)

## Installation

### Clone and Build

```bash
# Clone the repository
git clone https://github.com/smtrdev/growi-mcp-server.git
cd growi-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```


## Usage 


```json
{
  "mcpServers": {
    "growi": {
      "command": "node",
      "args": ["/path/to/your/growi-mcp-server/dist/index.js"],
      "env": {
        "GROWI_API_URL": "https://your-growi-instance.com",
        "GROWI_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```


## Using the Tools in Claude

Once configured, you can use the following commands in Claude Desktop:

### List Pages

```
growi_list_pages can you list all pages under the /projects path?
```

And coming soon...

## Development

```bash
# Run the server in development mode
npm run dev

# Run linting
npm run lint

# Run tests
npm run test
```

## License

MIT

