import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

const COOKIES_FILE = path.join(process.cwd(), '.google-cookies.json');

interface AuthStatus {
  isAuthenticated: boolean;
  email?: string;
  lastLogin?: string;
}

export class GoogleAuth {
  private cookies: any[] = [];
  
  constructor() {
    this.loadCookies();
  }

  private loadCookies(): void {
    try {
      if (fs.existsSync(COOKIES_FILE)) {
        const data = fs.readFileSync(COOKIES_FILE, 'utf-8');
        this.cookies = JSON.parse(data);
        console.log('✓ Loaded saved Google session cookies');
      }
    } catch (error) {
      console.error('Failed to load cookies:', error);
      this.cookies = [];
    }
  }

  private saveCookies(cookies: any[]): void {
    try {
      fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
      this.cookies = cookies;
      console.log('✓ Saved Google session cookies');
    } catch (error) {
      console.error('Failed to save cookies:', error);
    }
  }

  async getAuthStatus(): Promise<AuthStatus> {
    if (this.cookies.length === 0) {
      return { isAuthenticated: false };
    }

    // Check if cookies are still valid by testing them
    try {
      const browser = await puppeteer.launch({
        headless: true,
        executablePath: '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setCookie(...this.cookies);
      await page.goto('https://accounts.google.com/', { waitUntil: 'networkidle2', timeout: 10000 });
      
      // Check if we're still logged in
      const isLoggedIn = await page.evaluate(() => {
        return !document.body.innerText.includes('Sign in');
      });

      // Try to get email if logged in
      let email = undefined;
      if (isLoggedIn) {
        email = await page.evaluate(() => {
          const emailElement = document.querySelector('[data-email]');
          return emailElement?.getAttribute('data-email') || undefined;
        });
      }

      await browser.close();

      if (isLoggedIn) {
        return {
          isAuthenticated: true,
          email,
          lastLogin: new Date().toISOString()
        };
      } else {
        // Cookies expired, clear them
        this.cookies = [];
        return { isAuthenticated: false };
      }
    } catch (error) {
      console.error('Auth status check failed:', error);
      return { isAuthenticated: false };
    }
  }

  async initiateLogin(): Promise<{ loginUrl: string; sessionId: string }> {
    // Generate a session ID for this login attempt
    const sessionId = Math.random().toString(36).substring(7);
    
    // Return the login URL - we'll handle the actual login in a separate endpoint
    return {
      loginUrl: '/api/auth/login-browser',
      sessionId
    };
  }

  async performInteractiveLogin(): Promise<boolean> {
    let browser: Browser | null = null;
    
    try {
      // Launch browser in non-headless mode for user to sign in
      browser = await puppeteer.launch({
        headless: false, // Show browser window for user login
        executablePath: '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });

      const page = await browser.newPage();
      
      // Go to Google sign-in page
      await page.goto('https://accounts.google.com/signin', { 
        waitUntil: 'networkidle2',
        timeout: 60000 
      });

      console.log('Waiting for user to complete Google sign-in...');
      
      // Wait for user to complete sign-in (detect when redirected away from login)
      await page.waitForFunction(
        () => !window.location.href.includes('accounts.google.com/signin'),
        { timeout: 300000 } // 5 minutes for user to login
      );

      console.log('Login detected, saving session...');

      // Get all cookies after successful login
      const cookies = await page.cookies();
      this.saveCookies(cookies);

      await browser.close();
      return true;
    } catch (error) {
      console.error('Interactive login failed:', error);
      if (browser) {
        await browser.close();
      }
      return false;
    }
  }

  async applyCookies(page: Page): Promise<void> {
    if (this.cookies.length > 0) {
      await page.setCookie(...this.cookies);
      console.log('✓ Applied saved Google session cookies');
    }
  }

  getCookies(): any[] {
    return this.cookies;
  }

  clearAuth(): void {
    this.cookies = [];
    if (fs.existsSync(COOKIES_FILE)) {
      fs.unlinkSync(COOKIES_FILE);
    }
    console.log('✓ Cleared Google authentication');
  }
}

// Singleton instance
export const googleAuth = new GoogleAuth();
