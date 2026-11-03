# VestEd Design System

The interface should feel like a university investment program: quiet, precise, and competitive without looking like a trading arcade.

## Color

Use greens for structure, depth, and positive results. Use red only for losses.

| Token | Hex | Use |
| --- | --- | --- |
| `background` | `#F7FAF5` | Page background |
| `surface` | `#FFFFFF` | Cards and sheets |
| `mint` | `#EAF5E8` | Soft fills, selected nav, chips |
| `pale` | `#D8EBD5` | Borders on emphasis, chart washes |
| `sage` | `#A6C5A0` | Dividers, secondary charts |
| `medium` | `#5B9568` | Secondary actions, positive but quiet |
| `primary` | `#247448` | Primary buttons, links, active state |
| `forest` | `#174F36` | Headings, strong text |
| `deep` | `#103B2B` | Hero gradient end, key numbers |
| `ink` | `#10261C` | Body text |
| `muted` | `#667A6B` | Labels and meta |
| `loss` | `#9E3B32` | Negative returns |
| `loss-soft` | `#F8E8E4` | Negative chips |

Gradients are limited to the brand mark, the season hero, and one performance highlight. The approved pairs are `#EAF5E8 → #A6C5A0` and `#247448 → #103B2B`. Do not gradient every card.

Borders are 1px `#D5E4D4`. Shadows are a single soft layer, `0 10px 30px rgba(16, 59, 43, 0.05)`. Corners are 12px for cards and 8px for controls.

## Type

- Newsreader for titles and key figures. It carries the academic tone.
- Geist for interface text.
- Geist Mono for tickers, ranks, and timestamps.

Titles use forest green, not pure black. Labels are 11–12px, tracked, uppercase only for eyebrows and table headers. Body copy stays at 14–15px. Do not use more than two weights in one card.

## Layout

Desktop uses a fixed 240px sidebar and a top bar with season status. Content width caps at 1180px. Mobile collapses the sidebar into a sheet. Pages stack in this order: context, primary number, chart or table, supporting columns.

Tables are the product. Keep them dense enough to scan, with 12px horizontal padding, right-aligned numbers, and a sticky header. Do not turn rankings into cards on desktop.

## Motion

Hover states change background or border color in 150ms. Rank movement is a small arrow, not a bounce. Charts draw once. No confetti, streaks, or pulsing calls to action.

## Components

- **Eyebrow.** Muted uppercase label, then a serif title.
- **Metric.** Label, figure, and a one-line delta. Insufficient data is a sentence, not a dash pretending to be zero.
- **Pill.** Sample, Provisional, Final, or Demonstration. Sample data is always identifiable.
- **Button.** Primary is forest fill with off-white text. Secondary is a mint outline. Destructive actions are not styled as primary green.
- **Ticket.** Order side is a segmented control. The review state repeats ticker, quantity, estimated debit, and the execution rule before confirm.
- **Banner.** A thin mint band on every page stating that quotes, news, standings, and AI replies are sample data.

## Charts

Charts are lightweight SVG. The portfolio line uses `#247448`. The benchmark uses `#A6C5A0`. Negative areas are not filled in red. Gridlines are barely visible. Axes use mono type.

## Accessibility

Text on `#247448` is off-white. Muted green is not used for small text below 12px on pale backgrounds. Loss is both color and a minus sign. Interactive controls have visible focus rings in `#247448`. Icon-only buttons require an accessible name.

## What to avoid

Neon green, glassmorphism, cartoon trophies, gamified level bars, generic purple AI gradients, and brokerage layouts that exist only to look busy.
