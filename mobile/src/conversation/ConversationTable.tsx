import { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme';
import { ConversationInline } from './ConversationInline';
import type { MarkdownBlock } from './markdownBlocks';

export function ConversationTable({ table }: { table: Extract<MarkdownBlock, { kind: 'table' }> }) {
  const { colors } = useTheme();
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const available = (measured || window.width - 40) - 2 * StyleSheet.hairlineWidth;
  const minimum = 100 * window.fontScale;
  const budget = Math.max(available, table.headers.length * minimum);
  // Column geometry depends on headers, never arriving tokens: streamed rows cannot shift it.
  const ratio = table.headers[0].length * 2 < (table.headers[1]?.length ?? 0) ? 0.36 : 0.5;
  const firstWidth = Math.max(minimum, Math.min(budget - minimum, budget * ratio));
  const widths = table.headers.map((header, column) =>
    table.headers.length === 1
      ? budget
      : table.headers.length === 2
        ? column === 0
          ? firstWidth
          : budget - firstWidth
        : Math.max(150, Math.min(280, header.length * 8 + 64)) * window.fontScale,
  );
  const contentWidth = widths.reduce((sum, width) => sum + width, 0);
  const row = (cells: string[], index: number, header = false) => (
    <View
      key={index}
      testID={header ? 'table-header' : 'table-row'}
      style={[
        s.row,
        {
          backgroundColor: header ? colors.elevated : 'transparent',
          borderBottomColor: colors.border,
          borderBottomWidth: header || index < table.rows.length - 1 ? StyleSheet.hairlineWidth : 0,
        },
      ]}
    >
      {cells.map((cell, column) => (
        <View
          key={column}
          testID={`table-cell-${column}`}
          style={[s.cell, { width: widths[column] }]}
        >
          <Text
            selectable
            accessibilityRole={header ? 'header' : undefined}
            accessibilityLabel={header ? undefined : `${table.headers[column]}: ${cell}`}
            style={[
              s.text,
              header && s.header,
              { color: colors.text, textAlign: table.alignments[column] },
            ]}
          >
            <ConversationInline text={cell} />
          </Text>
        </View>
      ))}
    </View>
  );
  return (
    <View
      testID="conversation-table"
      onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
      style={[s.frame, { borderColor: colors.border }]}
    >
      <ScrollView
        horizontal
        directionalLockEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        style={[s.scroll, { width: available }]}
        accessibilityLabel={
          contentWidth > available + 1 ? 'Table, scroll horizontally for more columns' : 'Table'
        }
      >
        <View style={{ width: contentWidth }}>
          {row(table.headers, -1, true)}
          {table.rows.map((cells, index) => row(cells, index))}
        </View>
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  frame: {
    maxWidth: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 10,
  },
  scroll: { maxWidth: '100%', flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  cell: { paddingHorizontal: 12, paddingVertical: 10 },
  text: { fontSize: 14.5, lineHeight: 21, letterSpacing: -0.15 },
  header: { fontSize: 13, fontWeight: '600', letterSpacing: -0.05 },
});
