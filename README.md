# cc-peak

> When are you actually most focused with Claude Code?

Find your optimal working window based on real session data.

```
  cc-peak v1.0.0
  ═══════════════════════════════════════
  When are you most focused? Last 90 days.

  ▸ Your Peak Window
    Fri  ·  9pm–1am
    (highest combined session hours in any 4h block)

  ▸ Hour-of-Day Heatmap  (when sessions start)
   9pm ▓▓▓▓▓▓▓▓     19.0h ←
  10pm ▓▓▓▓▓▓        13.5h
  11pm ▓▓▓▓▓▓▓▓▓▓▓▓  27.7h ← peak
  12am ▓▓▓▓▓▓▓▓▓     21.3h

  ▸ Day-of-Week Breakdown
    Mon  ██████████████████   41.4h
    Fri  ████████████████████ 46.9h ← peak
    ...

  ▸ Insights
    🦉 Night owl — most activity between 10pm–5am
    🗓️  Weekday focused — 74% of work on weekdays
    📈 Regular rhythm — active 53% of days
```

## Usage

```bash
npx cc-peak              # Last 90 days
npx cc-peak --days=30   # Last 30 days
npx cc-peak --json      # JSON output
```

## Why this exists

All other cc-toolkit tools answer "how much?" This one answers "when?"

Once you know your peak window, you can:
- Schedule complex tasks during your most focused hours
- Avoid starting deep work sessions outside your window
- Plan your day around when you're actually productive

## Part of cc-toolkit

One of [31 free tools](https://yurukusa.github.io/cc-toolkit/) for understanding your Claude Code usage.

## License

MIT
