import { requireLinkedUser } from '@/lib/linked-user';
import { getDirectConversationInbox } from '@/models/messaging.js';
import MessagesInbox from '../components/MessagesInbox';


export default async function MessagesPage() {
  const user = await requireLinkedUser();
  const conversations = await getDirectConversationInbox(user.users_id, 50);

  return (
    <main className="feed-page">
      <header style={{ maxWidth: 760, margin: '0 auto 18px' }}>
        <h1>Messages</h1>
        <p>Private conversations with people on HavenSocial.</p>
      </header>
      <MessagesInbox initialConversations={conversations} />
    </main>
  );
}
