import Link from 'next/link';
import { getLinkedUser } from '@/lib/linked-user';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const user = await getLinkedUser();
  if (user) redirect('/feed');

  return (
    <main className="hero-section">
      <div className="hero-content">
        <img src="/images/havensocial_logo.webp" alt="HavenSocial" className="hero-logo" />
        <h1>What’s happening now</h1>
        <p className="hero-subtitle">
          Join the next-generation SocialFi platform. Connect meaningfully, share your voice, build
          community, and earn HavenByte Token (HBT).
        </p>
        <div className="cta-group">
          <Link href="/login" className="btn-primary btn-large">Continue with BHID</Link>
        </div>
      </div>
    </main>
  );
}
