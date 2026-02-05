export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export function parsePaginationParams(query: Record<string, any>): PaginationParams {
  const page = Math.max(1, parseInt(query.page as string) || DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit as string) || DEFAULT_LIMIT));
  const sortBy = query.sortBy as string || 'created_at';
  const sortOrder = (query.sortOrder as string)?.toLowerCase() === 'asc' ? 'asc' : 'desc';
  
  return { page, limit, sortBy, sortOrder };
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  const page = params.page || DEFAULT_PAGE;
  const limit = params.limit || DEFAULT_LIMIT;
  const totalPages = Math.ceil(total / limit);
  
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}
