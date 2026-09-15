import { Platform } from 'react-native';

/** The face for paths and commands, the same one CodeContent draws code in. */
export const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
