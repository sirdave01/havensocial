import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLinkedUser } from '@/lib/linked-user';

const errors: Record<string, string> = {
  oauth_state: 'Your sign-in session expired. Please try again.',
  oauth_denied: 'BHID sign-in was cancelled.',
  oauth_callback: 'BHID sign-in could not be completed. Please try again.',
  account_unavailable: 'This HavenSocial account is not currently active.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getLinkedUser();
  if (user) redirect('/feed');
  const { error } = await searchParams;

  return (
    <main className="auth-card">
      <h1>Sign in to HavenSocial</h1>
      <p>Use your BHID account to continue. Passwords and account registration are managed by BHID.</p>
      {error && <p role="alert">{errors[error] || 'Sign-in failed. Please try again.'}</p>}
      <a href="/auth/bhid" className="btn-primary btn-large">Continue with BHID</a>
      <p><Link href="/">Back to HavenSocial</Link></p>
    </main>
  );
}
