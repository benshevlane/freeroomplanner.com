import { useState } from "react";
import { FURNITURE_LIBRARY, FurnitureTemplate } from "../lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sofa,
  ChefHat,
  BedDouble,
  Bath,
  UtensilsCrossed,
  Search,
  GripVertical,
  DoorOpen,
} from "lucide-react";

const CATEGORIES = ["All", "Living", "Kitchen", "Bedroom", "Bathroom", "Dining", "Structure"];

const CATEGORY_ICONS: Record<string, typeof Sofa> = {
  Living: Sofa,
  Kitchen: ChefHat,
  Bedroom: BedDouble,
  Bathroom: Bath,
  Dining: UtensilsCrossed,
  Structure: DoorOpen,
};

interface FurniturePanelProps {
  onSelectFurniture: (template: FurnitureTemplate) => void;
  onSwitchToSelect?: () => void;
}

export default function FurniturePanel({ onSelectFurniture, onSwitchToSelect }: FurniturePanelProps) {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = FURNITURE_LIBRARY.filter((item) => {
    // When searching, ignore category filter so results span all categories
    if (!search && selectedCategory !== "All" && item.category !== selectedCategory) return false;
    if (search && !item.label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleDragStart = (e: React.DragEvent, template: FurnitureTemplate) => {
    e.dataTransfer.setData("application/json", JSON.stringify(template));
    e.dataTransfer.effectAllowed = "copy";
    // Switch to select mode so canvas doesn't interpret the drop as a wall draw
    onSwitchToSelect?.();
  };

  return (
    <div className="w-60 border-r border-border bg-card flex flex-col" data-testid="furniture-panel">
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
            className="cursor-pointer text-xs"
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
            return (
              <div
                key={template.type}
                draggable
                onDragStart={(e) => handleDragStart(e, template)}
                onClick={() => onSelectFurniture(template)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-md cursor-grab active:cursor-grabbing hover-elevate transition-colors"
                data-testid={`furniture-item-${template.type}`}
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <CatIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
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
