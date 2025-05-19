import { jest } from '@jest/globals';
import { getPage } from './get-page.js';

describe('getPage', () => {
  it('formats result text with page path', async () => {
    const mockClient = {
      getPage: jest.fn(async () => ({
        ok: true,
        page: { path: '/test', revision: { body: 'hello', author: { _id: '', name: '' }, _id: '', createdAt: '' }, creator: { _id: '', name: '' }, _id: '', createdAt: '', updatedAt: '' }
      })),
    } as any;

    const result = await getPage(mockClient, { path: '/test' });

    expect(result.content[0].text).toContain('/test');
  });

  it('returns full page content without limiting characters', async () => {
    // 300文字の長いコンテンツを生成
    const longContent = 'a'.repeat(300);
    
    const mockClient = {
      getPage: jest.fn(async () => ({
        ok: true,
        page: { 
          path: '/long-content', 
          revision: { 
            body: longContent, 
            author: { _id: '', name: '' }, 
            _id: '', 
            createdAt: '' 
          }, 
          creator: { _id: '', name: '' }, 
          _id: '', 
          createdAt: '', 
          updatedAt: '' 
        }
      })),
    } as any;

    const result = await getPage(mockClient, { path: '/long-content' });
    
    // フルコンテンツが含まれていることを確認
    expect(result.content[0].text).toContain(longContent);
    
    // 文字数に制限がないことを確認
    expect(result.content[0].text.length).toBeGreaterThan(300);
  });
});
