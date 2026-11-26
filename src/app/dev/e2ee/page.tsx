
import { notFound } from 'next/navigation';

import { requireLinkedUser } from '@/lib/linked-user';
import E2EELab from './E2EELab';

export const metadata = {
  title: 'E2EE Development Lab | HavenSocial',
};

export default async function E2EELabPage() {
  // Never expose this testing page in production.
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }

  // Require an existing HavenSocial/BHID-authenticated session.
  await requireLinkedUser();

  return (
    <main
      style={{
        width: '100%',
        maxWidth: 850,
        margin: '30px auto',
        padding: 16,
      }}
    >
      <E2EELab />
    </main>
  );
}
