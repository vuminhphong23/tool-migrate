/**
 * DirectusClient - Replacement for useApi hook from Directus Extensions SDK
 * Provides the same interface but works as standalone client
 * Supports both Bearer token and username/password authentication
 */
export class DirectusClient {
  private baseUrl: string;
  private token: string;
  private authType: 'token' | 'login';

  constructor(baseUrl: string, token: string, authType: 'token' | 'login' = 'token') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token.replace(/^Bearer\s+/i, '');
    this.authType = authType;
  }

  /**
   * Create DirectusClient with username/password authentication
   */
  static async createWithLogin(baseUrl: string, email: string, password: string): Promise<DirectusClient> {
    const tempClient = new DirectusClient(baseUrl, '', 'login');
    
    try {
      const response = await tempClient.post('/auth/login', {
        email,
        password
      });
      
      if (response.data?.access_token) {
        return new DirectusClient(baseUrl, response.data.access_token, 'token');
      } else {
        throw new Error('No access token received from login');
      }
    } catch (error: any) {
      throw new Error(`Login failed: ${error.message || 'Invalid credentials'}`);
    }
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      defaultHeaders['Authorization'] = `Bearer ${this.token}`;
    }

    const config: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as any;
        error.response = {
          status: response.status,
          statusText: response.statusText,
          data: errorData,
        };
        throw error;
      }

      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      
      if (contentLength === '0' || response.status === 204) {
        return { data: null };
      }
      
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        if (!text || text.trim() === '') {
          return { data: null };
        }
        try {
          return JSON.parse(text);
        } catch {
          return { data: text };
        }
      }

      const text = await response.text();
      if (!text || text.trim() === '') {
        return { data: null };
      }
      
      return JSON.parse(text);
    } catch (error: any) {
      if (!error.response) {
        error.response = {
          status: 0,
          statusText: 'Network Error',
          data: { message: error.message },
        };
      }
      throw error;
    }
  }

  async get(endpoint: string, options: { params?: Record<string, any> } = {}): Promise<any> {
    let url = endpoint;
    
    if (options.params) {
      const searchParams = new URLSearchParams();
      
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (typeof value === 'object') {
            searchParams.append(key, JSON.stringify(value));
          } else {
            searchParams.append(key, String(value));
          }
        }
      });
      
      const queryString = searchParams.toString();
      if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
    }

    return this.request(url, { method: 'GET' });
  }

  /**
   * Download file as Blob (for file migration)
   */
  async getBlob(endpoint: string): Promise<Blob> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as any;
      error.response = {
        status: response.status,
        statusText: response.statusText,
        data: errorData,
      };
      throw error;
    }

    return response.blob();
  }

  async post(endpoint: string, data?: any, options: RequestInit = {}): Promise<any> {
    const config: RequestInit = {
      method: 'POST',
      ...options,
    };

    if (data) {
      if (data instanceof FormData) {
        const formHeaders: Record<string, string> = {};
        if (this.token) {
          formHeaders['Authorization'] = `Bearer ${this.token}`;
        }
        config.headers = {
          ...formHeaders,
          ...options.headers,
        };
        config.body = data;
      } else {
        config.body = JSON.stringify(data);
      }
    }

    return this.request(endpoint, config);
  }

  async patch(endpoint: string, data: any, options: RequestInit = {}): Promise<any> {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
      ...options,
    });
  }

  async put(endpoint: string, data: any, options: RequestInit = {}): Promise<any> {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
      ...options,
    });
  }

  async delete(endpoint: string, options: RequestInit = {}): Promise<any> {
    return this.request(endpoint, {
      method: 'DELETE',
      ...options,
    });
  }

  async testConnection(): Promise<{ success: boolean; message: string; serverInfo?: any }> {
    try {
      const response = await this.get('/server/info');
      return {
        success: true,
        message: 'Connection successful',
        serverInfo: response.data,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Connection failed',
      };
    }
  }

  getAssetUrl(assetId: string): string {
    return `${this.baseUrl}/assets/${assetId}`;
  }

  getFilesUrl(fileId?: string): string {
    return fileId ? `${this.baseUrl}/files/${fileId}` : `${this.baseUrl}/files`;
  }

  getToken(): string {
    return this.token;
  }
}
