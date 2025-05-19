# GROWI MCP Server

This Model Context Protocol (MCP) server provides growi integration.

## Features

- **List Pages**: List pages under a specific path
- **Recently Updated Pages**: Get a list of pages recently edited on GROWI
- **Get Page**: Retrieve the contents of a single page
- **Search Pages**: Search pages matching a query
- **Page Exists**: Check if a page exists
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

### Recently Updated Pages

```text
mcp_growi_growi_recently_updated_pages show me the latest edited pages
```

```text
mcp_growi_growi_recently_updated_pages limit=5 offset=0
```

### Get Page

```text
mcp_growi_growi_get_page path=/user/test
```

```text
mcp_growi_growi_get_page /user/test を表示して
```

### Search Pages

```text
mcp_growi_growi_search_pages query=meeting limit=5
```

### Page Exists

```text
mcp_growi_growi_page_exists path=/projects/plan
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

