import NextAuth, { type NextAuthResult } from 'next-auth';
import Cognito from 'next-auth/providers/cognito';
import { env } from '@/app/lib/env';

declare module 'next-auth' {
  interface Session {
    idToken?: string;
    error?: string;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    idToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: string;
  }
}

function getCognitoIssuer(): string {
  const poolId = process.env.COGNITO_USER_POOL_ID;
  if (!poolId?.includes('_')) {
    return 'https://cognito-idp.us-east-1.amazonaws.com/placeholder-pool-id';
  }
  const region = poolId.split('_')[0]!;
  return `https://cognito-idp.${region}.amazonaws.com/${poolId}`;
}

const issuer = getCognitoIssuer();

function getCognitoOAuthTokenEndpoint(): string {
  const explicit = process.env.COGNITO_OAUTH_DOMAIN?.replace(/\/$/, '');
  if (explicit) {
    return `${explicit}/oauth2/token`;
  }
  const prefix = process.env.COGNITO_DOMAIN_PREFIX;
  const region = process.env.AWS_REGION ?? process.env.COGNITO_REGION ?? 'us-east-1';
  if (prefix) {
    return `https://${prefix}.auth.${region}.amazoncognito.com/oauth2/token`;
  }
  return `${issuer}/oauth2/token`;
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ idToken: string; expiresAt: number; refreshToken: string }> {
  const tokenEndpoint = getCognitoOAuthTokenEndpoint();
  const { COGNITO_CLIENT_ID, COGNITO_CLIENT_SECRET } = env();

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: COGNITO_CLIENT_ID,
    client_secret: COGNITO_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`Refresh failed: ${res.status}`);
  }

  const tokens = await res.json();

  return {
    idToken: tokens.id_token,
    expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    refreshToken: tokens.refresh_token ?? refreshToken,
  };
}

const nextAuth: NextAuthResult = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Cognito({
      clientId: process.env.COGNITO_CLIENT_ID!,
      clientSecret: process.env.COGNITO_CLIENT_SECRET!,
      issuer,
      checks: ['state'],
      client: {
        token_endpoint_auth_method: 'client_secret_post',
      },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth;
      if (request.nextUrl.pathname.startsWith('/chat')) {
        return isLoggedIn;
      }
      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        token.idToken = account.id_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.error = undefined;
        return token;
      }

      if (token.expiresAt && Date.now() < (token.expiresAt - 60) * 1000) {
        return token;
      }

      if (!token.refreshToken) {
        token.error = 'RefreshTokenMissing';
        return token;
      }

      try {
        const refreshed = await refreshAccessToken(token.refreshToken);
        token.idToken = refreshed.idToken;
        token.expiresAt = refreshed.expiresAt;
        token.refreshToken = refreshed.refreshToken;
        token.error = undefined;
        return token;
      } catch {
        token.error = 'RefreshTokenError';
        return token;
      }
    },
    session({ session, token }) {
      session.idToken = token.idToken;
      session.error = token.error;
      return session;
    },
  },
});

export const handlers: NextAuthResult['handlers'] = nextAuth.handlers;
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn;
export const signOut: NextAuthResult['signOut'] = nextAuth.signOut;
export const auth: NextAuthResult['auth'] = nextAuth.auth;
