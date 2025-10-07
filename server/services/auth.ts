import { GoogleAuth as GoogleAuthLib } from 'google-auth-library';
import { JWT } from 'google-auth-library';

interface AuthStatus {
  isAuthenticated: boolean;
  email?: string;
  lastLogin?: string;
}

export class GoogleAuth {
  private authClient: JWT | null = null;
  private serviceAccountEmail: string | null = null;

  constructor() {
    this.initializeServiceAccount();
  }

  private initializeServiceAccount(): void {
    try {
      const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      
      if (!serviceAccountJson) {
        console.log('⚠ GOOGLE_SERVICE_ACCOUNT_JSON not found in environment');
        return;
      }

      const credentials = JSON.parse(serviceAccountJson);
      this.serviceAccountEmail = credentials.client_email;

      this.authClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: [
          'https://www.googleapis.com/auth/forms.body',
          'https://www.googleapis.com/auth/forms.body.readonly',
          'https://www.googleapis.com/auth/forms.responses.readonly',
          'https://www.googleapis.com/auth/drive.readonly',
        ],
      });

      console.log('✓ Google service account initialized:', this.serviceAccountEmail);
    } catch (error) {
      console.error('Failed to initialize service account:', error);
      this.authClient = null;
      this.serviceAccountEmail = null;
    }
  }

  async getAuthStatus(): Promise<AuthStatus> {
    if (!this.authClient || !this.serviceAccountEmail) {
      return { isAuthenticated: false };
    }

    try {
      await this.authClient.authorize();
      return {
        isAuthenticated: true,
        email: this.serviceAccountEmail,
        lastLogin: new Date().toISOString()
      };
    } catch (error) {
      console.error('Service account authorization failed:', error);
      return { isAuthenticated: false };
    }
  }

  async getAuthClient(): Promise<JWT> {
    if (!this.authClient) {
      throw new Error('Service account not initialized. Please configure GOOGLE_SERVICE_ACCOUNT_JSON');
    }
    
    await this.authClient.authorize();
    return this.authClient;
  }

  async getAccessToken(): Promise<string> {
    const client = await this.getAuthClient();
    const tokenResponse = await client.getAccessToken();
    
    if (!tokenResponse.token) {
      throw new Error('Failed to get access token');
    }
    
    return tokenResponse.token;
  }

  clearAuth(): void {
    this.authClient = null;
    this.serviceAccountEmail = null;
    console.log('✓ Cleared Google authentication');
  }
}

export const googleAuth = new GoogleAuth();
