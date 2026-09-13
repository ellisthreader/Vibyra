import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConversationFixture } from './conversationFixture';

createRoot(document.getElementById('root')!).render(<ConversationFixture />);
