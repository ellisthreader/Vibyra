import { createRoot } from 'react-dom/client';
import { ConversationResumeFixture } from './conversationResumeFixture';
const query = new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(<ConversationResumeFixture dark={query.get('theme') !== 'light'} mode={query.get('mode') ?? ''} />);
