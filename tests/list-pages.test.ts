import { listPages } from '../src/tools/list-pages.js';
import { GrowiClient } from '../src/growi-client.js';

// Helper to create a mock GrowiClient
function mockClient(response: any, throwError = false): GrowiClient {
  const client: any = {
    baseURL: undefined,
    apiToken: undefined,
    listPages: jest.fn(),
  };

  if (throwError) {
    client.listPages.mockRejectedValue(new Error(response));
  } else {
    client.listPages.mockResolvedValue(response);
  }

  return client as GrowiClient;
}

describe('listPages', () => {
  it('parses parameters and formats successful response', async () => {
    const pages = [{ path: '/foo' }, { path: '/bar' }];
    const response = {
      ok: true,
      pages,
      meta: { total: 2, limit: 5, offset: 0 },
    };
    const client = mockClient(response);

    const result = await listPages(client, { path: 'foo', limit: '5', page: '1' });

    expect(client.listPages).toHaveBeenCalledWith('/foo', 5, 1);
    const text = result.content[0].text;
    expect(text).toContain('Found 2 pages under path: /foo');
    expect(text).toContain('- /foo');
    expect(text).toContain('- /bar');
    expect(text).toContain('Showing 1-2 of 2 total pages');
  });

  it('uses defaults for invalid numeric params', async () => {
    const response = {
      ok: true,
      pages: [],
      meta: { total: 0, limit: 100, offset: 0 },
    };
    const client = mockClient(response);

    const result = await listPages(client, { limit: '-1', page: '0' });

    expect(client.listPages).toHaveBeenCalledWith('/', 100, 1);
    expect(result.content[0].text).toContain('No pages found under path: /');
  });

  it('returns formatted error when client reports failure', async () => {
    const response = {
      ok: false,
      pages: [],
      error: 'server error',
    };
    const client = mockClient(response);

    const result = await listPages(client, { path: '/err', limit: 5, page: 1 });

    expect(result.content[0].text).toBe(
      'Error listing pages (path: /err, offset: 0): server error'
    );
  });

  it('handles thrown exceptions', async () => {
    const client = mockClient('boom', true);

    const result = await listPages(client, {});

    expect(result.content[0].text).toBe('Error listing pages: boom');
  });
});
