import { describe, it, expect, vi } from 'vitest';
import { LocationResolver } from '@/lib/location-resolver';
import type { Location } from '@shared/schemas';

describe('LocationResolver', () => {
  it('returns bbox directly when valid', async () => {
    const mockInstance = {
      getTextAtLocation: vi.fn().mockResolvedValue('some text'),
    };
    
    const resolver = new LocationResolver(mockInstance);
    
    const location: Location = {
      bbox: { pageIndex: 0, left: 100, top: 200, width: 50, height: 20 },
    };
    
    const result = await resolver.resolveLocation(location);
    
    expect(result).toEqual({
      type: 'bbox',
      bbox: location.bbox,
    });
  });
  
  it('falls back to search_text when bbox is missing', async () => {
    const mockInstance = {
      search: vi.fn().mockResolvedValue([
        { 
          pageIndex: 0, 
          rect: { left: 50, top: 100, width: 30, height: 15 },
        },
      ]),
    };
    
    const resolver = new LocationResolver(mockInstance);
    
    const location: Location = {
      search_text: { text: 'test value', occurrence: 1 },
    };
    
    const result = await resolver.resolveLocation(location);
    
    expect(result?.type).toBe('search_text');
    expect(result?.bbox.pageIndex).toBe(0);
    expect(result?.bbox.left).toBe(50);
  });

  it('returns null when both bbox and search_text fail', async () => {
    const mockInstance = {
      getTextAtLocation: vi.fn().mockResolvedValue(''),
      search: vi.fn().mockResolvedValue([]),
    };
    
    const resolver = new LocationResolver(mockInstance);
    
    const location: Location = {
      bbox: { pageIndex: 0, left: 100, top: 200, width: 50, height: 20 },
      search_text: { text: 'nonexistent', occurrence: 1 },
    };
    
    const result = await resolver.resolveLocation(location);
    
    // Should try bbox first, then search_text, both fail
    expect(result).toBeNull();
  });

  it('uses search_text when bbox verification fails', async () => {
    const mockInstance = {
      getTextAtLocation: vi.fn().mockResolvedValue(''), // Empty = bbox invalid
      search: vi.fn().mockResolvedValue([
        { 
          pageIndex: 1, 
          rect: { left: 200, top: 300, width: 40, height: 18 },
        },
      ]),
    };
    
    const resolver = new LocationResolver(mockInstance);
    
    const location: Location = {
      bbox: { pageIndex: 0, left: 100, top: 200, width: 50, height: 20 },
      search_text: { text: 'found text', occurrence: 1 },
    };
    
    const result = await resolver.resolveLocation(location);
    
    expect(result?.type).toBe('search_text');
    expect(result?.bbox.pageIndex).toBe(1);
  });
});
