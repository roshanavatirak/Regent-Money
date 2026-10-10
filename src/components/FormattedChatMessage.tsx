import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface FormattedChatMessageProps {
  content: string;
  isUser: boolean;
  colors: any;
  isDark: boolean;
}

interface TableData {
  headers: string[];
  rows: string[][];
}

type ContentBlock =
  | { type: 'table'; data: TableData }
  | { type: 'heading'; level: number; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'paragraph'; text: string };

/**
 * Parses markdown inline bold/italic syntax and returns styled Text elements
 */
export const renderInlineFormattedText = (
  rawText: string,
  baseStyle: any,
  colors: any,
  isUser: boolean
) => {
  if (!rawText) return null;

  // Split text by bold patterns (**text**)
  const boldParts = rawText.split(/(\*\*[^*]+?\*\*)/g);

  const boldColor = isUser
    ? colors.isDark
      ? '#ffffff'
      : '#064e3b'
    : colors.isDark
    ? '#34D399'
    : '#059669';

  return boldParts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      const boldContent = part.slice(2, -2);
      return (
        <Text
          key={index}
          style={[
            baseStyle,
            {
              fontWeight: '700',
              color: boldColor,
            },
          ]}
        >
          {boldContent}
        </Text>
      );
    }

    return (
      <Text key={index} style={baseStyle}>
        {part}
      </Text>
    );
  });
};

export const FormattedChatMessage: React.FC<FormattedChatMessageProps> = ({
  content,
  isUser,
  colors,
  isDark,
}) => {
  if (!content) return null;

  const userTextColor = colors.isDark ? '#ECFDF5' : '#064E3B';
  const botTextColor = colors.isDark ? '#F3F4F6' : '#1F2937';

  // If it's a user message, render as clean conversational text
  if (isUser) {
    return (
      <Text style={[styles.userText, { color: userTextColor }]} selectable>
        {renderInlineFormattedText(content, { color: userTextColor }, colors, true)}
      </Text>
    );
  }

  // Parse lines into structured blocks (tables, headings, bullets, paragraphs)
  const lines = content.split('\n');
  const blocks: ContentBlock[] = [];
  let currentTableLines: string[] = [];

  const flushTable = () => {
    if (currentTableLines.length >= 2) {
      // Process table rows
      const cleanRows = currentTableLines
        .map((l) =>
          l
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim())
        )
        // Filter out markdown divider lines like |---|---|
        .filter((row) => !row.every((cell) => /^:?-+:?$/.test(cell)));

      if (cleanRows.length > 0) {
        const headers = cleanRows[0];
        const rows = cleanRows.slice(1);
        blocks.push({
          type: 'table',
          data: { headers, rows },
        });
      }
    } else if (currentTableLines.length > 0) {
      currentTableLines.forEach((l) => blocks.push({ type: 'paragraph', text: l }));
    }
    currentTableLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if line is part of a markdown table (starts and contains |)
    if (trimmed.startsWith('|') && trimmed.includes('|', 1)) {
      currentTableLines.push(trimmed);
      continue;
    } else {
      flushTable();
    }

    if (!trimmed) {
      continue;
    }

    // Check for headings: # , ## , ###
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      continue;
    }

    // Check for bullet lists
    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      blocks.push({
        type: 'bullet',
        text: bulletMatch[1],
      });
      continue;
    }

    // Normal paragraph
    blocks.push({
      type: 'paragraph',
      text: line,
    });
  }

  flushTable();

  return (
    <View style={styles.container}>
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          return (
            <View key={idx} style={styles.headingBlock}>
              <Text
                style={[
                  styles.headingText,
                  {
                    fontSize: block.level <= 2 ? 15.5 : 14,
                    color: colors.isDark ? '#34D399' : '#047857',
                  },
                ]}
                selectable
              >
                {renderInlineFormattedText(block.text, { fontWeight: '700' }, colors, false)}
              </Text>
            </View>
          );
        }

        if (block.type === 'bullet') {
          return (
            <View key={idx} style={styles.bulletRow}>
              <View
                style={[
                  styles.bulletDot,
                  { backgroundColor: colors.isDark ? '#10B981' : '#059669' },
                ]}
              />
              <Text style={[styles.bulletContent, { color: botTextColor }]} selectable>
                {renderInlineFormattedText(
                  block.text,
                  { color: botTextColor, fontSize: 13.5, lineHeight: 20 },
                  colors,
                  false
                )}
              </Text>
            </View>
          );
        }

        if (block.type === 'table') {
          const { headers, rows } = block.data;
          const tableBg = colors.isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(240, 253, 244, 0.55)';
          const tableBorder = colors.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(16, 185, 129, 0.2)';
          const headerBg = colors.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(16, 185, 129, 0.1)';

          return (
            <View
              key={idx}
              style={[
                styles.tableCard,
                {
                  backgroundColor: tableBg,
                  borderColor: tableBorder,
                },
              ]}
            >
              {/* Table Header Row */}
              {headers.length > 0 && (
                <View
                  style={[
                    styles.tableRow,
                    styles.tableHeaderRow,
                    { backgroundColor: headerBg, borderBottomColor: tableBorder },
                  ]}
                >
                  {headers.map((h, colIdx) => (
                    <View
                      key={colIdx}
                      style={[
                        styles.tableCell,
                        colIdx === 0 ? { flex: 1.4 } : { flex: 1, alignItems: 'flex-end' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tableHeaderText,
                          {
                            color: colors.isDark ? '#9CA3AF' : '#4B5563',
                            textAlign: colIdx === 0 ? 'left' : 'right',
                          },
                        ]}
                        selectable
                      >
                        {renderInlineFormattedText(h, styles.tableHeaderText, colors, false)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Table Body Rows */}
              {rows.map((row, rowIdx) => {
                const isLast = rowIdx === rows.length - 1;
                const isTotalRow = row.some((cell) =>
                  /total|sum|net worth/i.test(cell)
                );

                return (
                  <View
                    key={rowIdx}
                    style={[
                      styles.tableRow,
                      !isLast && { borderBottomColor: tableBorder, borderBottomWidth: 1 },
                      isTotalRow && {
                        backgroundColor: colors.isDark
                          ? 'rgba(16, 185, 129, 0.1)'
                          : 'rgba(16, 185, 129, 0.08)',
                      },
                    ]}
                  >
                    {row.map((cell, colIdx) => (
                      <View
                        key={colIdx}
                        style={[
                          styles.tableCell,
                          colIdx === 0
                            ? { flex: 1.4 }
                            : { flex: 1, alignItems: 'flex-end' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tableCellText,
                            {
                              color: isTotalRow
                                ? colors.isDark
                                  ? '#34D399'
                                  : '#047857'
                                : botTextColor,
                              fontWeight: isTotalRow ? '700' : '400',
                              textAlign: colIdx === 0 ? 'left' : 'right',
                            },
                          ]}
                          selectable
                        >
                          {renderInlineFormattedText(
                            cell,
                            {
                              color: isTotalRow
                                ? colors.isDark
                                  ? '#34D399'
                                  : '#047857'
                                : botTextColor,
                              fontSize: 13,
                              fontWeight: isTotalRow ? '700' : '400',
                            },
                            colors,
                            false
                          )}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          );
        }

        // Paragraph
        return (
          <Text
            key={idx}
            style={[styles.paragraphText, { color: botTextColor }]}
            selectable
          >
            {renderInlineFormattedText(
              block.text,
              { color: botTextColor, fontSize: 13.5, lineHeight: 21 },
              colors,
              false
            )}
          </Text>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  userText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  paragraphText: {
    fontSize: 13.5,
    lineHeight: 21,
    marginBottom: 6,
  },
  headingBlock: {
    marginTop: 8,
    marginBottom: 4,
  },
  headingText: {
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 5,
    paddingLeft: 2,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 8,
    marginRight: 8,
  },
  bulletContent: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 20,
  },
  tableCard: {
    marginVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  tableHeaderRow: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  tableCell: {
    justifyContent: 'center',
  },
  tableHeaderText: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tableCellText: {
    fontSize: 12.5,
    lineHeight: 18,
  },
});
