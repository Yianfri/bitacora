export interface LocalCredentials {
  username: string;
  password: string;
}
export interface LocalStack {
  url: string;
  directory: string;
  credentials: LocalCredentials;
  accessFile: string;
  stopApi(): Promise<void>;
  restartApi(): Promise<void>;
  stop(): Promise<void>;
  createUser(): Promise<LocalCredentials>;
}
export function startLocalStack(options?: {
  directory?: string;
  port?: number;
  apiPort?: number;
  build?: boolean;
}): Promise<LocalStack>;
