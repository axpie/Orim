import { PublicClientApplication } from '@azure/msal-browser';
import type { MicrosoftAuthProvider } from '../../types/models';

let cachedKey: string | null = null;
let cachedApplication: PublicClientApplication | null = null;

async function getApplication(config: MicrosoftAuthProvider): Promise<PublicClientApplication> {
  const key = `${config.clientId}|${config.authority}`;
  if (!cachedApplication || cachedKey !== key) {
    cachedApplication = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: config.authority,
        redirectUri: `${window.location.origin}/login`,
      },
      cache: {
        cacheLocation: 'sessionStorage',
      },
    });
    await cachedApplication.initialize();
    cachedKey = key;
  }

  return cachedApplication;
}

export async function signInWithMicrosoft(config: MicrosoftAuthProvider): Promise<string> {
  const application = await getApplication(config);
  const result = await application.loginPopup({
    scopes: config.scopes,
    prompt: 'select_account',
  });

  if (!result.idToken) {
    throw new Error('Microsoft sign-in did not return an id token.');
  }

  return result.idToken;
}
