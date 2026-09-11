import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { PurchaseBridge } from './types';

export const purchaseBridge: PurchaseBridge | null = Platform.OS === 'ios'
  ? requireOptionalNativeModule<PurchaseBridge>('VibyraPurchases') : null;
