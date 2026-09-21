import { Image } from 'react-native';
import type { Avatar } from './types';

const artwork = {
  site: require('../../assets/teammates/site.webp'), review: require('../../assets/teammates/review.webp'),
  oncall: require('../../assets/teammates/oncall.webp'), assistant: require('../../assets/teammates/assistant.webp'),
  lead: require('../../assets/teammates/lead.webp'), bugs: require('../../assets/teammates/bugs.webp'),
  db: require('../../assets/teammates/db.webp'), qa: require('../../assets/teammates/qa.webp'), sprout: require('../../assets/teammates/sprout.webp'),
};
export function TeammateAvatar({ avatar, size = 44 }: { avatar: Avatar; size?: number }) {
  return <Image source={artwork[avatar] ?? artwork.assistant} style={{ width: size, height: size }} resizeMode="contain" accessible={false} />;
}
