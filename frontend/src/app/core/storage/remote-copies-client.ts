export const MAX_REMOTE_BACKUP_BYTES = 5 * 1024 * 1024;

export interface ApiUser {
  username: string;
}

export interface ApiTripMetadata {
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
}

export class RemoteApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | undefined = undefined,
  ) {
    super(message);
    this.name = 'RemoteApiError';
  }
}

export class RemoteNetworkError extends Error {
  constructor(
    message = 'No pudimos contactar la API. Comprueba la conexión e inténtalo de nuevo.',
  ) {
    super(message);
    this.name = 'RemoteNetworkError';
  }
}

export interface RemoteTripResponse {
  body: unknown;
  etag: string;
}

export interface RemotePutResponse {
  metadata: ApiTripMetadata;
  etag: string;
}

export class RemoteCopiesClient {
  private csrfToken: string | null = null;

  constructor(
    private readonly requestFetch: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly timeoutMs = 15_000,
  ) {}

  async initialize(): Promise<ApiUser | null> {
    await this.fetchCsrfToken();
    try {
      return await this.currentUser();
    } catch (error) {
      if (error instanceof RemoteApiError && error.status === 401) return null;
      throw error;
    }
  }

  async currentUser(): Promise<ApiUser> {
    const response = await this.request('/api/auth/me', { method: 'GET' });
    if (!response.ok) throw await this.apiError(response);
    const { userSchema } = await import('./remote-copies-schemas');
    return userSchema.parse(await this.readJson(response));
  }

  async login(username: string, password: string): Promise<ApiUser> {
    const token = this.csrfToken ?? (await this.fetchCsrfToken());
    const response = await this.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) throw await this.apiError(response);
    const { userSchema } = await import('./remote-copies-schemas');
    const user = userSchema.parse(await this.readJson(response));
    // Antiforgery tokens are identity-bound; replace the anonymous token after login.
    try {
      await this.fetchCsrfToken();
    } catch {
      this.csrfToken = null;
    }
    return user;
  }

  async logout(): Promise<void> {
    const token = this.csrfToken ?? (await this.fetchCsrfToken());
    const response = await this.request('/api/auth/logout', {
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': token },
    });
    if (!response.ok && response.status !== 401) throw await this.apiError(response);
    this.csrfToken = null;
  }

  async listTrips(expectedAccount: string): Promise<ApiTripMetadata[]> {
    const response = await this.request('/api/trips', {
      method: 'GET',
      headers: { 'X-Routale-Account': expectedAccount },
    });
    if (!response.ok) throw await this.apiError(response);
    const { tripMetadataArraySchema } = await import('./remote-copies-schemas');
    const result = tripMetadataArraySchema.safeParse(await this.readJson(response));
    if (!result.success) throw new Error('La lista de copias remotas no tiene un formato válido.');
    const ids = new Set<string>();
    for (const item of result.data) {
      if (ids.has(item.id)) throw new Error('La lista remota contiene viajes repetidos.');
      ids.add(item.id);
    }
    return result.data;
  }

  async readTrip(tripId: string, expectedAccount: string): Promise<RemoteTripResponse> {
    const response = await this.request(`/api/trips/${encodeURIComponent(tripId)}`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Routale-Account': expectedAccount },
    });
    if (!response.ok) throw await this.apiError(response);
    const etag = response.headers.get('ETag');
    if (!etag || !/^"[1-9]\d*"$/.test(etag)) {
      throw new Error('La copia remota no informó una revisión válida.');
    }
    const text = await response.text();
    this.assertBodySize(text);
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new Error('La copia remota no contiene JSON válido.');
    }
    return { body, etag };
  }

  async putTrip(
    tripId: string,
    body: string,
    condition: { kind: 'create' } | { kind: 'match'; etag: string },
    expectedAccount: string,
  ): Promise<RemotePutResponse> {
    this.assertBodySize(body);
    const token = this.csrfToken ?? (await this.fetchCsrfToken());
    const headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-CSRF-TOKEN': token,
      'X-Routale-Account': expectedAccount,
    });
    if (condition.kind === 'create') headers.set('If-None-Match', '*');
    else headers.set('If-Match', condition.etag);
    const response = await this.request(`/api/trips/${encodeURIComponent(tripId)}`, {
      method: 'PUT',
      headers,
      body,
    });
    if (!response.ok) throw await this.apiError(response);
    const { tripMetadataSchema } = await import('./remote-copies-schemas');
    const etag = response.headers.get('ETag');
    if (!etag || !/^"[1-9]\d*"$/.test(etag)) {
      throw new Error('La API guardó la copia, pero no confirmó una revisión válida.');
    }
    const metadata = tripMetadataSchema.parse(await this.readJson(response));
    if (metadata.id !== tripId || `"${metadata.revision}"` !== etag) {
      throw new Error('La confirmación de guardado no coincide con la copia enviada.');
    }
    return { metadata, etag };
  }

  private async fetchCsrfToken(): Promise<string> {
    const response = await this.request('/api/auth/csrf', { method: 'GET' });
    if (!response.ok) throw await this.apiError(response);
    const { csrfSchema } = await import('./remote-copies-schemas');
    const parsed = csrfSchema.parse(await this.readJson(response));
    this.csrfToken = parsed.token;
    return parsed.token;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.requestFetch(path, {
        ...init,
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new RemoteNetworkError();
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new RemoteNetworkError();
    }
    this.assertBodySize(text);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('La API devolvió una respuesta JSON inválida.');
    }
  }

  private assertBodySize(body: string): void {
    if (new TextEncoder().encode(body).byteLength > MAX_REMOTE_BACKUP_BYTES) {
      throw new Error('La copia supera el límite remoto de 5 MiB. No se cambió tu cuaderno.');
    }
  }

  private async apiError(response: Response): Promise<RemoteApiError> {
    let code: string | undefined;
    try {
      const body: unknown = await response.json();
      const { problemSchema } = await import('./remote-copies-schemas');
      const parsed = problemSchema.safeParse(body);
      if (parsed.success) code = parsed.data.code;
    } catch {
      // The HTTP status remains authoritative when the response has no Problem Details body.
    }
    const message = this.messageForStatus(response.status, code);
    return new RemoteApiError(response.status, message, code);
  }

  private messageForStatus(status: number, code: string | undefined): string {
    if (status === 401)
      return 'La sesión no está activa. Inicia sesión para usar las copias remotas.';
    if (status === 403)
      return 'La protección de sesión venció. Vuelve a iniciar sesión e inténtalo de nuevo.';
    if (status === 404) return 'No encontramos esa copia remota en esta cuenta.';
    if (status === 412) return 'La copia remota cambió. Revísala antes de guardar otra revisión.';
    if (status === 413)
      return 'La copia supera el límite remoto de 5 MiB. No se cambió tu cuaderno.';
    if (status === 428)
      return 'La API pidió una condición de revisión. No se envió un guardado sin condición.';
    if (status === 429) return 'Hay demasiados intentos de inicio de sesión. Espera un momento.';
    if (status === 409 && code === 'storage_quota_exceeded')
      return 'La cuenta alcanzó su cuota de copias remotas.';
    if (status === 409 && code === 'workspace_account_mismatch')
      return 'La sesión cambió de cuenta en otra pestaña. Se bloqueó esta operación para no mezclar datos.';
    if (status === 503) return 'La API está ocupada. La copia local se conserva.';
    return `La API no pudo completar la operación (HTTP ${status}).`;
  }
}
