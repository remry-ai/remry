# Charts in reports and docs

A chart is a fenced code block with the language `chart` containing JSON. It renders in the report editor, in doc and note views, and in the branded print/PDF view, using the report's brand colours.

````markdown
```chart
{
  "type": "bar",
  "title": "Story points",
  "labels": ["Jul", "Aug", "Sep"],
  "series": [
    { "label": "Committed", "values": [30, 32, 28] },
    { "label": "Delivered", "values": [24, 33, 29] }
  ],
  "min": 0
}
```
````

## Rules

| Key | Required | Rules |
|---|---|---|
| `type` | yes | `bar`, `line` or `radar` |
| `labels` | yes | 1–100 strings: the x-axis categories, or the radar spokes |
| `series` | yes | 1–6 objects `{ "label"?: string, "values": number[], "color"?: "#rrggbb" }`. **Each `values` array must have exactly one number per label.** |
| `title` | no | Shown above the chart |
| `min`, `max` | no | Axis range, e.g. `"min": 0, "max": 5` for a 1–5 scale |

No other keys are allowed. Colours come from branding: series fade from the brand colour. Give a series a `color` (a six-digit hex like `"#16a34a"`) to draw its line or bars in that colour instead, e.g. green for actual and grey for target. Use it only when the colour means something; otherwise leave it to the branding. Values must be plain numbers: no `"12%"`, no `null`, and nothing left blank.

## Choosing a type

- **bar**: compare categories, or plan vs. actual. Several series sit side by side.
- **line**: a trend over time (months, sprints, quarters). Put labels in time order.
- **radar**: a profile across 3–8 dimensions on the same scale (skills, health check). Set `min` and `max`.

```chart
{ "type": "bar", "title": "Revenue vs. target", "labels": ["Q1", "Q2", "Q3"], "series": [{ "label": "Target", "values": [100, 110, 120], "color": "#a1a1aa" }, { "label": "Actual", "values": [96, 118, 125], "color": "#16a34a" }], "min": 0 }
```

```chart
{ "type": "line", "title": "Incidents per month", "labels": ["Jul", "Aug", "Sep"], "series": [{ "label": "Incidents", "values": [5, 3, 1] }], "min": 0 }
```

```chart
{ "type": "radar", "title": "Team health (1-5)", "labels": ["Delivery", "Quality", "Collaboration", "Growth", "Wellbeing"], "series": [{ "label": "Q2", "values": [3, 3, 4, 3, 4] }, { "label": "Q3", "values": [4, 3.5, 4.5, 3, 4] }], "min": 0, "max": 5 }
```

## When a save is rejected

`report.create` and `report.update` refuse content with an invalid chart. The error names the line of the opening fence:

| Error | Fix |
|---|---|
| `series.0.values has 2 values but there are 3 labels` | Add the missing value or remove the extra label |
| `invalid JSON (...)` | Usually a trailing comma, single quotes or an unquoted key |
| `type Invalid enum value...` | Use `bar`, `line` or `radar` |
| `chart Unrecognized key(s) in object: 'colors'` | Remove the key; set `color` on each series instead |
| `series.0.color must be a hex colour like "#2563eb"` | Use six-digit hex: no names, no `#fff`, no `rgb()` |
| `series Array must contain at most 6 element(s)` | Split into two charts |

Tables and prose render too: use ordinary markdown tables for exact numbers alongside a chart.

Legacy `[chart:avg_by_section]`, `[chart:scores:<section>]` and `[chart:radar:<section>]` tags only work for imported survey results. Don't write them.
