export interface ApiError {
  message?: string;
  response?: {
    data?: {
      message?: string;
      error?: string;
      details?: unknown;
      success?: boolean;
      data?: unknown;
    };
    status?: number;
  };
}

export interface ImportLogEntry {
  timestamp: string;
  step: string;
  details: Record<string, unknown>;
}

export interface ValidationResult {
  success: boolean;
  message: string;
  serverInfo?: {
    version: string;
    project: string;
  };
  error?: any;
}

export interface ImportResult {
  success: boolean;
  message: string;
  importedItems?: any[];
  error?: any;
  importLog?: ImportLogEntry[];
}

export interface ImportedItem {
  originalId: string | number;
  newId?: string | number;
  status: "success" | "error";
  data?: any;
  error?: {
    message: string;
    status?: number;
    details?: any;
  };
}

// Additional types for React app
export interface Collection {
  collection: string;
  meta?: {
    is_folder?: boolean;
    singleton?: boolean;
    note?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface OperationStatus {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  status?: number;
}

export interface LoadingStates {
  [key: string]: boolean;
}
