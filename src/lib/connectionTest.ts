import { DirectusClient } from './DirectusClient';

export interface TestConnectionResult {
  success: boolean;
  message: string;
  serverInfo?: {
    version?: string;
    project?: string;
    [key: string]: any;
  };
}

export async function testDirectusConnection(
  url: string,
  token?: string,
  email?: string,
  password?: string
): Promise<TestConnectionResult> {
  try {
    if (!url) {
      return {
        success: false,
        message: 'URL is required'
      };
    }

    let client: DirectusClient;

    if (token) {
      client = new DirectusClient(url, token);
    } else if (email && password) {
      try {
        client = await DirectusClient.createWithLogin(url, email, password);
      } catch (loginError: any) {
        return {
          success: false,
          message: `Login failed: ${loginError.message}`
        };
      }
    } else {
      return {
        success: false,
        message: 'Either token or email/password is required'
      };
    }
    
    const response = await client.get('/server/info');
    
    if (response && response.data) {
      const serverInfo = response.data;
      return {
        success: true,
        message: `Connected successfully! Directus ${serverInfo.directus?.version || 'Unknown'} - Project: ${serverInfo.project?.project_name || 'Unknown'}`,
        serverInfo
      };
    } else {
      return {
        success: false,
        message: 'Connected but received unexpected response format'
      };
    }
  } catch (error: any) {
    
    if (error.response) {
      const status = error.response.status;
      const statusText = error.response.statusText;
      
      switch (status) {
        case 401:
          return {
            success: false,
            message: 'Authentication failed: Invalid token or insufficient permissions'
          };
        case 403:
          return {
            success: false,
            message: 'Access forbidden: Token does not have required permissions'
          };
        case 404:
          return {
            success: false,
            message: 'Server not found: Check if URL is correct and server is running'
          };
        case 500:
          return {
            success: false,
            message: 'Server error: Internal server error occurred'
          };
        default:
          return {
            success: false,
            message: `Connection failed: HTTP ${status} ${statusText}`
          };
      }
    } else if (error.message.includes('fetch')) {
      return {
        success: false,
        message: 'Network error: Cannot reach server. Check URL and network connection'
      };
    } else {
      return {
        success: false,
        message: `Connection failed: ${error.message}`
      };
    }
  }
}

export function savePresetConfiguration(config: {
  name: string;
  environment: string;
  url: string;
  token: string;
  authType?: 'token' | 'login';
  email?: string;
  password?: string;
  type: 'source' | 'target';
}) {
  try {
    const existingPresets = JSON.parse(localStorage.getItem('directus-migration-presets') || '[]');
    
    const newPreset = {
      name: config.name,
      [`${config.type}Environment`]: config.environment,
      [`${config.type}Url`]: config.url,
      [`${config.type}Token`]: config.token,
      [`${config.type}AuthType`]: config.authType || 'token',
      [`${config.type}Email`]: config.email || '',
      [`${config.type}Password`]: config.password || '',
      ...(config.type === 'source' ? {
        targetEnvironment: '',
        targetUrl: '',
        targetToken: '',
        targetAuthType: 'token',
        targetEmail: '',
        targetPassword: ''
      } : {
        sourceEnvironment: '',
        sourceUrl: '',
        sourceToken: '',
        sourceAuthType: 'token',
        sourceEmail: '',
        sourcePassword: ''
      }),
      createdAt: new Date().toISOString()
    };
    
    const existingIndex = existingPresets.findIndex((p: any) => p.name === config.name);
    
    if (existingIndex >= 0) {
      existingPresets[existingIndex] = {
        ...existingPresets[existingIndex],
        ...newPreset
      };
    } else {
      existingPresets.push(newPreset);
    }
    
    localStorage.setItem('directus-migration-presets', JSON.stringify(existingPresets));
    
    return {
      success: true,
      message: `Preset "${config.name}" saved successfully!`
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to save preset: ${error.message}`
    };
  }
}
