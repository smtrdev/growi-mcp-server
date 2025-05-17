# GROWI MCP Server

This Model Context Protocol (MCP) server provides growi integration.

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

Add this configuration to your MCP client setup:

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

```text
mcp_growi_growi_list_pages can you list all pages under the /projects path?
```

```text
/user のパスから10件取ってきて
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

