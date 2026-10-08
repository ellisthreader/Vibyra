import { NotificationsPage } from './pages/NotificationsPage';
import { UpdatesPage } from './pages/UpdatesPage';
import type { ComponentType } from 'react';
import type { AccountMode } from '../onboarding/AccountForm';
import type { WorkspaceModel } from '../ui/types';
import { VibesSettingsPage } from '../vibes/VibesSettingsPage';
import { AdvancedPage } from './pages/AdvancedPage';
import { DeleteAccountPage } from './pages/DeleteAccountPage';
import { MemoryPage } from './pages/MemoryPage';
import { SummaryPage } from './memory/SummaryPage';
import { PersonalityPage } from './pages/PersonalityPage';
import { ProfilePage } from './pages/ProfilePage';
import { SecurityPage } from './pages/SecurityPage';
import { SubscriptionPage } from './pages/SubscriptionPage';
import { TwoFactorPage } from './pages/TwoFactorPage';
import { ReportPage } from './pages/ReportPage';

/** Every page the sheet can open over its home list. */
export type SettingsPageId =
  | 'notifications'
  | 'updates'
  | 'advanced'
  | 'profile'
  | 'security'
  | 'twoFactor'
  | 'delete'
  | 'personality'
  | 'memory'
  | 'summary'
  | 'vibes'
  | 'subscription'
  | 'report';

export interface SettingsNav {
  /** Opens a page over the current one. A page that is not registered is never opened. */
  push(page: SettingsPageId): void;
  /** Returns to the page underneath. */
  back(): void;
  /** Closes the sheet; `then` runs as it goes, for a destination behind it or a sheet over it. */
  close(then?: () => void): void;
  /** Raises the one account form the sheet owns, over whichever page asked. */
  signIn(mode?: AccountMode): void;
}
/** Where a row leads out of the sheet. Call them through `nav.close(routes.x)`, so the
 *  sheet closes as the place behind it changes. */
export interface SettingsRoutes {
  plugins(): void;
  /** `from` is the page to return to when the upgrade screen closes. */
  wallet(from?: SettingsPageId): void;
  remote(): void;
  connect(): void;
}
export interface SettingsPageProps {
  workspace: WorkspaceModel;
  nav: SettingsNav;
  routes: SettingsRoutes;
}
export interface SettingsPage {
  title: string;
  Page: ComponentType<SettingsPageProps>;
}

/**
 * Where a page joins the sheet: one entry here, and one row on the home list that
 * calls `nav.push(id)`. The sheet owns the stack, the header's title and Back, the
 * slide between pages and the bottom inset (`useSheetBottomInset() + 24`), so a
 * page is only its own ScrollView of rows. Import the page here, e.g.
 * `profile: { title: 'Profile', Page: ProfilePage }`.
 */
export const settingsPages: Partial<Record<SettingsPageId, SettingsPage>> = {
  notifications: { title: 'Notifications', Page: NotificationsPage },
  updates: { title: 'Updates', Page: UpdatesPage },
  report: { title: 'Report a problem', Page: ReportPage },
  advanced: { title: 'Advanced', Page: AdvancedPage },
  vibes: { title: 'Vibyra tokens', Page: VibesSettingsPage },
  personality: { title: 'Personality', Page: PersonalityPage },
  memory: { title: 'Memory', Page: MemoryPage },
  // Opened from Memory's "Memory summary" part, not from the home list.
  summary: { title: 'Memory summary', Page: SummaryPage },
  profile: { title: 'Profile', Page: ProfilePage },
  security: { title: 'Security', Page: SecurityPage },
  // Opened from Security's own list, not from the home list.
  twoFactor: { title: 'Two-factor', Page: TwoFactorPage },
  subscription: { title: 'Subscription', Page: SubscriptionPage },
  delete: { title: 'Delete account', Page: DeleteAccountPage },
};
