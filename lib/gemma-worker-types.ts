export interface GemmaGenerateRequest {
  type: 'generate';
  id: string;
  modelId: string;
  prompt: string;
  maxNewTokens?: number;
}

export interface GemmaStatusMessage {
  type: 'status';
  phase: 'loading' | 'ready' | 'generating';
  label: string;
  progress?: number;
}

export interface GemmaResultMessage {
  type: 'result';
  id: string;
  text: string;
}

export interface GemmaErrorMessage {
  type: 'error';
  id?: string;
  error: string;
}

export type GemmaWorkerRequest = GemmaGenerateRequest;
export type GemmaWorkerResponse = GemmaStatusMessage | GemmaResultMessage | GemmaErrorMessage;
