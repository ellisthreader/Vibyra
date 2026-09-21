import { impactAsync, ImpactFeedbackStyle, notificationAsync, NotificationFeedbackType, selectionAsync } from 'expo-haptics';

/** One detent, as a control passes a step. Where there is no haptic engine — the
 *  browser, or a build made before haptics were linked — nothing is felt. */
export const detent = () => { void selectionAsync().catch(() => {}); };

/** Something was found: the two quick taps iOS gives a success. */
export const arrived = () => { void notificationAsync(NotificationFeedbackType.Success).catch(() => {}); };

/** A tap that could not be acted on: the short shake iOS gives a refusal. */
export const refused = () => { void notificationAsync(NotificationFeedbackType.Warning).catch(() => {}); };

/** Something solid coming to rest — a lid meeting its stop. */
export const thud = () => { void impactAsync(ImpactFeedbackStyle.Rigid).catch(() => {}); };
