// Page structure returned from GROWI API
export interface GrowiPage {
  _id: string;
  path: string;
  revision: {
    _id: string;
    body: string;
    author: {
      _id: string;
      name: string;
    };
    createdAt: string;
  };
  creator: {
    _id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

// Base response with common properties
interface BaseResponse {
  ok: boolean;
  error?: string;
}

// Response for page listing
export interface GrowiPagesResponse extends BaseResponse {
  pages: GrowiPage[];
  meta?: {
    total: number;
    limit: number;
    offset: number;
  };
}

// Response for single page retrieval
export interface GrowiPageResponse extends BaseResponse {
  page: GrowiPage;
}

// Response for page creation/update
export interface GrowiPageUpdateResponse extends BaseResponse {
  page: GrowiPage;
  revision: {
    _id: string;
    body: string;
  };
}

// Response for search
export interface GrowiSearchResponse extends BaseResponse {
  meta?: {
    total: number;
    took: number;
    hitsCount: number;
  };
  data: GrowiPage[];
}

// Response for page existence check
export interface GrowiPageExistResponse extends BaseResponse {
  exists: boolean;
}

// Error response
export interface GrowiErrorResponse {
  ok: false;
  error: string;
} 