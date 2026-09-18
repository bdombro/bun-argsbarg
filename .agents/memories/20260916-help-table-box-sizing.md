# Made with /thread-memory

## Meta
updated: 2026-09-16 13:48
id: c9a29eb3-7891-4b09-b48c-217fe95ca8af
scope: src/help.ts, src/help.test.ts, CHANGELOG.md
topics: help-table-box, box-sizing, terminal-width, text-wrapping, tty-rendering
counts: 1 decision, 1 footgun

## 2026-09-16 13:48 decision
Help table box sizing derives column width from inner content (hw - 4)
context: In TTY mode, help boxes have 4 columns of horizontal border overhead (`│ ` on left, ` │` on right). `renderTableBox` previously calculated column description wrapping width from `contentWidth = Math.max(hw - 2, minimumContentWidth)`, which caused table body lines to reach `(hw - 2) + 4 = hw + 2` columns. In terminals matching `process.stdout.columns` (e.g. 120 cols), any line where the description filled the allocated width exceeded the terminal width and wrapped the trailing `│` onto a new line.
decision: Compute `targetContentWidth = Math.max(visibleWidth(titleLead) + 1, hw - 4)` and `descWidth = Math.max(1, targetContentWidth - labelWidth - 2)`. Derives both `renderTableBox` and `renderTextBox` borders and wrapping directly from `hw - 4`. Prevents trailing vertical box border characters from wrapping across all terminal widths.
paths: src/help.ts, src/help.test.ts, CHANGELOG.md

## 2026-09-16 13:48 footgun
TTY box line length must include border overhead (contentWidth + 4) when calculating wrapping limits
fails: Deriving table column wrap widths from `hw - 2` or clamping `contentWidth = Math.min(contentWidth, hw - 4)` after wrapping lines causes inner lines to remain wider than the top/bottom borders, resulting in 1-2 char overflow and wrapped border lines on standard terminal widths.
paths: src/help.ts
