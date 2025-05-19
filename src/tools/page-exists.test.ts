import { jest } from '@jest/globals';
import { pageExists } from './page-exists.js';

describe('pageExists', () => {
  it('indicates existence of page', async () => {
    const mockClient = {
      pageExists: jest.fn(async () => ({ ok: true, exists: true }))
    } as any;

    const result = await pageExists(mockClient, { path: '/test' });

    expect(result.content[0].text).toContain('Page exists');
  });
});
