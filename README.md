# Free Room Planner

A free, browser-based room planning tool for homeowners. Draw floor plans, place furniture, and export to PDF — no login required.

## Features

- **Wall Drawing** — Snap-to-grid wall placement with endpoint snapping (15cm threshold)
- **Furniture Library** — 25+ items across 5 categories (Seating, Tables, Storage, Bedroom, Structure)
- **Doors & Windows** — Dedicated structural elements with accurate dimensions
- **Room Area Calculation** — Automatic detection of enclosed rooms with area displayed in m²
- **Drag, Rotate & Resize** — Full manipulation with corner handles and dimension inputs
- **Copy/Paste & Duplicate** — Ctrl+C/V/D shortcuts and toolbar button
- **Save/Load Plans** — JSON export/import for saving and sharing floor plans
- **PDF Export** — High-quality PDF generation via jsPDF
- **Undo/Redo** — Full history stack
- **Zoom & Pan** — Mouse wheel zoom + middle-click pan
- **Dark Mode** — Toggle between light and dark themes
- **Touch Support** — Pointer events and pinch-to-zoom for mobile/tablet
- **Inline Label Editing** — Click-to-edit labels directly on canvas
- **Keyboard Shortcuts** — Delete, Escape, Ctrl+Z/Y, Ctrl+C/V/D

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui
- **Canvas**: HTML5 Canvas 2D for floor plan rendering
- **Build**: Vite
- **Server**: Express (serves static build)
- **PDF**: jsPDF + html2canvas

## Getting Started

```bash
# Install dependencies
npm install

# Development (runs both client and server)
npm run dev

# Production build
npm run build

# Start production server
npm start
```

The app runs on `http://localhost:5000` by default.

## Project Structure

```
freeroomplanner/
├── client/
│   └── src/
│       ├── components/     # React components (Canvas, Toolbar, Panels)
│       ├── hooks/          # Custom hooks (useEditor state management)
│       ├── lib/            # Canvas renderer, room detection, PDF export, types
│       └── pages/          # Editor page
├── server/                 # Express server
├── shared/                 # Shared schemas
└── dist/                   # Production build output
```

## License

MIT
