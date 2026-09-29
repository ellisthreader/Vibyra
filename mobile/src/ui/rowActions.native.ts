import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { thud } from './haptics';
export type RowAction = { title: string; destructive?: boolean; run(): void };
export function rowActions(title: string, actions: RowAction[]) {
  thud();
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions({ title,
      options: [...actions.map(action => action.title), 'Cancel'], cancelButtonIndex: actions.length,
      destructiveButtonIndex: actions.findIndex(action => action.destructive) < 0 ? undefined
        : actions.findIndex(action => action.destructive),
    }, index => actions[index]?.run());
  } else Alert.alert(title, undefined, [...actions.map(action => ({ text: action.title,
    style: action.destructive ? 'destructive' as const : 'default' as const, onPress: action.run })),
    { text: 'Cancel', style: 'cancel' }]);
}
