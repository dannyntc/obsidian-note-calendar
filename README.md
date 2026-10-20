# Note Calendar

Note Calendar adds a monthly calendar to an ordinary Obsidian note. Click the calendar button in the top-right of a Markdown note to enable or disable it. You can also run **Toggle calendar in current note** from the command palette.

Select **+ Add** on any day to create a new Markdown note. The new note is stored under `Calendar entries/<calendar-id>/`, includes a date and calendar identity in its Properties, and contains a backlink to the calendar note on the first body row. The editor opens with the cursor on the fifth body row, leaving three blank rows as a click buffer. Its filename becomes the link shown in the day cell.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

For local installation, copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/note-calendar/`, then enable **Note Calendar** in Obsidian’s Community Plugins settings.
