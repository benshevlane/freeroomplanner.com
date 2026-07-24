import { useEffect, useRef, useState } from "react";
import { FURNITURE_LIBRARY, FurnitureTemplate, FurnitureItem, isWallCupboard } from "../lib/types";
import { drawFurniture } from "../lib/canvas-renderer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Sofa,
  ChefHat,
  BedDouble,
  Bath,
  UtensilsCrossed,
  Search,
  GripVertical,
  DoorOpen,
  Monitor,
} from "lucide-react";

const CATEGORIES = ["All", "Kitchen", "Living", "Bedroom", "Bathroom", "Dining", "Office", "Structure"];

const CATEGORY_ICONS: Record<string, typeof Sofa> = {
  Living: Sofa,
  Kitchen: ChefHat,
  Bedroom: BedDouble,
  Bathroom: Bath,
  Dining: UtensilsCrossed,
  Office: Monitor,
  Structure: DoorOpen,
};

function WallCupboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="flex-shrink-0 text-muted-foreground">
      <rect
        x="1" y="3" width="14" height="10" rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="3 1.5"
      />
      <line x1="1" y1="3" x2="15" y2="13" stroke="currentColor" strokeWidth="0.7" opacity="0.4" />
      <line x1="15" y1="3" x2="1" y2="13" stroke="currentColor" strokeWidth="0.7" opacity="0.4" />
    </svg>
  );
}

/**
 * Small top-down preview of an item, drawn by the SAME renderer that draws the
 * plan — so the thumbnail always matches exactly what lands on the canvas.
 */
const THUMB_SIZE = 34;
function ItemThumb({ template }: { template: FurnitureTemplate }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = THUMB_SIZE * dpr;
    canvas.height = THUMB_SIZE * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);

    const pad = 3;
    const scale = (THUMB_SIZE - pad * 2) / Math.max(template.width, template.height);
    const item: FurnitureItem = {
      id: `thumb-${template.type}`,
      type: template.type,
      label: "",
      x: 0,
      y: 0,
      width: template.width,
      height: template.height,
      rotation: 0,
      category: template.category,
    };
    // pxPerCm inside drawFurniture is (gridSize * zoom) / 100 — with
    // gridSize=100 and zoom=scale it becomes exactly our fitted scale.
    const panOffset = {
      x: (THUMB_SIZE - template.width * scale) / 2,
      y: (THUMB_SIZE - template.height * scale) / 2,
    };
    try {
      drawFurniture(ctx, [item], 100, scale, panOffset, false, null);
    } catch {
      // A failed thumbnail must never break the library list
    }
  }, [template]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
      className="flex-shrink-0 rounded-sm bg-background border border-border/60"
      aria-hidden="true"
    />
  );
}

interface FurniturePanelProps {
  onSelectFurniture: (template: FurnitureTemplate) => void;
  onSwitchToSelect?: () => void;
  className?: string;
}

export default function FurniturePanel({ onSelectFurniture, onSwitchToSelect, className }: FurniturePanelProps) {
  const [selectedCategory, setSelectedCategory] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("freeroomplanner-intent") || "{}");
      const map: Record<string, string> = {
        kitchen_renovation: "Kitchen",
        bathroom_renovation: "Bathroom",
        living_room_refresh: "Living",
        bedroom_refresh: "Bedroom",
      };
      return map[stored.intent] || "All";
    } catch {
      return "All";
    }
  });
  const [search, setSearch] = useState("");

  const isDoorOrWindow = (type: string) =>
    type === "door" || type === "door_double" || type === "window";

  const filtered = FURNITURE_LIBRARY.filter((item) => {
    // When searching, ignore category filter so results span all categories
    if (search) {
      return item.label.toLowerCase().includes(search.toLowerCase());
    }
    // Doors & windows always appear regardless of selected category
    if (isDoorOrWindow(item.type)) return true;
    if (selectedCategory !== "All" && item.category !== selectedCategory) return false;
    return true;
  }).sort((a, b) => {
    // For Structure category, preserve array order (don't float doors/windows)
    if (selectedCategory === "Structure") return 0;
    // For all other categories, float Window → Door → Double Door to top
    const doorWindowOrder: Record<string, number> = { window: 0, door: 1, door_double: 2 };
    const aOrder = isDoorOrWindow(a.type) ? doorWindowOrder[a.type] ?? 0 : 10;
    const bOrder = isDoorOrWindow(b.type) ? doorWindowOrder[b.type] ?? 0 : 10;
    return aOrder - bOrder;
  });

  const handleDragStart = (e: React.DragEvent, template: FurnitureTemplate) => {
    e.dataTransfer.setData("application/json", JSON.stringify(template));
    e.dataTransfer.effectAllowed = "copy";
    // Switch to select mode so canvas doesn't interpret the drop as a wall draw
    onSwitchToSelect?.();
  };

  return (
    <div className={cn("w-60 border-r border-border bg-card flex flex-col", className)} data-testid="furniture-panel">
      <div className="p-3 border-b border-border">
        <h3 className="text-sm font-semibold mb-2">Items Library</h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="furniture-search"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 p-3 border-b border-border">
        {CATEGORIES.map((cat) => (
          <Badge
            key={cat}
            variant={selectedCategory === cat ? "default" : "secondary"}
            className="cursor-pointer text-xs py-1.5 px-2.5"
            onClick={() => setSelectedCategory(cat)}
            data-testid={`category-${cat.toLowerCase()}`}
          >
            {cat}
          </Badge>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filtered.map((template) => {
            const CatIcon = CATEGORY_ICONS[template.category] || Sofa;
            const isWallCup = isWallCupboard(template.type);
            return (
              <div
                key={template.type}
                draggable
                onDragStart={(e) => handleDragStart(e, template)}
                onClick={() => onSelectFurniture(template)}
                className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-md cursor-grab active:cursor-grabbing hover-elevate transition-colors"
                data-testid={`furniture-item-${template.type}`}
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <ItemThumb template={template} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{template.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {template.width} × {template.height} cm
                  </p>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No items found</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
