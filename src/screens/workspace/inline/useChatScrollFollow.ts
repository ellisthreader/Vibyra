import { useCallback, useEffect, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from "react-native";
import type { ChatMessage } from "../../../types/domain";

export function useChatScrollFollow(chatMessages: ChatMessage[], hasConversation: boolean) {
  const messageListRef = useRef<ScrollView | null>(null);
  const shouldFollowChatRef = useRef(true);
  const latestMessage = chatMessages[chatMessages.length - 1];
  const latestMessageKey = latestMessage ? `${latestMessage.id}:${latestMessage.text.length}` : "";
  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => messageListRef.current?.scrollToEnd({ animated }));
    setTimeout(() => messageListRef.current?.scrollToEnd({ animated }), 60);
    setTimeout(() => messageListRef.current?.scrollToEnd({ animated }), 180);
  }, []);
  const followIfAtBottom = useCallback((animated = true) => {
    if (shouldFollowChatRef.current) scrollToBottom(animated);
  }, [scrollToBottom]);
  const handleMessageScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    shouldFollowChatRef.current = contentSize.height - layoutMeasurement.height - contentOffset.y < 72;
  }, []);

  useEffect(() => {
    if (!hasConversation) return;
    if (latestMessage?.role === "user") {
      shouldFollowChatRef.current = true;
      scrollToBottom(true);
      return;
    }
    followIfAtBottom(true);
  }, [hasConversation, latestMessage?.role, latestMessageKey, followIfAtBottom, scrollToBottom]);

  return { followIfAtBottom, handleMessageScroll, messageListRef };
}
