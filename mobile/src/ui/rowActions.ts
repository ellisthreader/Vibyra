import { Alert } from 'react-native';
export type RowAction = { title: string; destructive?: boolean; run(): void };
export function rowActions(title: string, actions: RowAction[]) {
  Alert.alert(title, undefined, [...actions.map(action => ({ text: action.title,
    style: action.destructive ? 'destructive' as const : 'default' as const, onPress: action.run })),
    { text: 'Cancel', style: 'cancel' }]);
}
