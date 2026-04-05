import { Suspense } from 'react';
import { handleSignIn } from '@/app/lib/actions/auth';

function authErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    Configuration:
      'Auth configuration error — check AUTH_SECRET, AUTH_URL, and Cognito env vars.',
    AccessDenied: 'Access was denied.',
    Verification: 'The verification token has expired or was invalid.',
    OAuthSignin: 'Could not start sign-in with Cognito.',
    OAuthCallback:
      'Cognito sign-in failed after redirect — check callback URL in Cognito matches this site.',
    OAuthCreateAccount: 'Could not create account from Cognito profile.',
    EmailCreateAccount: 'Could not create account from email.',
    Callback: 'Callback error — try again or contact support.',
    OAuthAccountNotLinked:
      'This email is already linked to another sign-in method.',
    SessionRequired: 'You must be signed in to view this page.',
    Default: 'Sign-in failed. Try again.',
  };
  return map[code] ?? `${map.Default} (${code})`;
}

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorCode } = await props.searchParams;
  const errorMessage = authErrorMessage(errorCode);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-neutral-500">Use your Cognito account to continue</p>
        </div>
        {errorMessage ? (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            {errorMessage}
          </div>
        ) : null}
        <Suspense>
          <form action={handleSignIn}>
            <button
              type="submit"
              className="w-full rounded-lg bg-neutral-900 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
            >
              Continue with Cognito
            </button>
          </form>
        </Suspense>
      </div>
    </main>
  );
}
