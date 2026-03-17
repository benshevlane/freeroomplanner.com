import { useState } from "react";
import { FURNITURE_LIBRARY, FurnitureTemplate, isWallCupboard } from "../lib/types";
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
  ChevronDown,
  ChevronRight,
  TextCursorInput,
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

/** Group items by variantGroup, keeping non-grouped items as singletons */
function groupByVariant(items: FurnitureTemplate[]): { key: string; primary: FurnitureTemplate; variants: FurnitureTemplate[] }[] {
  const seen = new Set<string>();
  const groups: { key: string; primary: FurnitureTemplate; variants: FurnitureTemplate[] }[] = [];

  for (const item of items) {
    if (item.variantGroup) {
      if (seen.has(item.variantGroup)) continue;
      seen.add(item.variantGroup);
      const variants = items.filter(t => t.variantGroup === item.variantGroup);
      groups.push({ key: item.variantGroup, primary: item, variants });
    } else {
      groups.push({ key: item.type, primary: item, variants: [item] });
    }
  }
  return groups;
}

interface FurniturePanelProps {
  onSelectFurniture: (template: FurnitureTemplate) => void;
  onSwitchToSelect?: () => void;
  onAddTextBox?: () => void;
  className?: string;
}

export default function FurniturePanel({ onSelectFurniture, onSwitchToSelect, onAddTextBox, className }: FurniturePanelProps) {
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
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const filtered = FURNITURE_LIBRARY.filter((item) => {
    if (search) {
      return item.label.toLowerCase().includes(search.toLowerCase());
    }
    if (selectedCategory !== "All" && item.category !== selectedCategory) return false;
    return true;
  });

  const groups = groupByVariant(filtered);

  const handleDragStart = (e: React.DragEvent, template: FurnitureTemplate) => {
    e.dataTransfer.setData("application/json", JSON.stringify(template));
    e.dataTransfer.effectAllowed = "copy";
    onSwitchToSelect?.();
  };

  const renderItem = (template: FurnitureTemplate, isVariant = false) => {
    const CatIcon = CATEGORY_ICONS[template.category] || Sofa;
    const isWallCup = isWallCupboard(template.type);
    return (
      <div
        key={template.type}
        draggable
        onDragStart={(e) => handleDragStart(e, template)}
        onClick={() => onSelectFurniture(template)}
        className={cn(
          "flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-md cursor-grab active:cursor-grabbing hover-elevate transition-colors",
          isVariant && "ml-4 border-l-2 border-border"
        )}
        data-testid={`furniture-item-${template.type}`}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        {isWallCup ? (
          <WallCupboardIcon />
        ) : (
          <CatIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{template.label}</p>
          <p className="text-xs text-muted-foreground">
            {template.width} × {template.height} cm
          </p>
        </div>
      </div>
    );
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
        <div className="p-2 space-y-0.5">
          {/* Text Box item */}
          {onAddTextBox && (!search || "text box".includes(search.toLowerCase())) && (
            <div
              onClick={onAddTextBox}
              className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-md cursor-pointer hover-elevate transition-colors border border-dashed border-border"
              data-testid="add-text-box"
            >
              <TextCursorInput className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">Text Box</p>
                <p className="text-xs text-muted-foreground">Rich text annotation</p>
              </div>
            </div>
          )}
          {groups.map((group) => {
            const hasVariants = group.variants.length > 1;
            const isExpanded = expandedGroup === group.key;

            if (!hasVariants) {
              return renderItem(group.primary);
            }

            return (
              <div key={group.key}>
                {/* Group header — click to expand/collapse variants */}
                <div
                  className="flex items-center gap-1 px-1 py-1 rounded-md cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
                  data-testid={`variant-group-${group.key}`}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="text-xs font-medium text-muted-foreground flex-1 truncate">
                    {group.primary.label}
                    <span className="ml-1 text-[10px] opacity-60">({group.variants.length} types)</span>
                  </span>
                </div>

                {/* Always show first variant as the default pick */}
                {!isExpanded && renderItem(group.primary)}

                {/* Expanded: show all variants */}
                {isExpanded && group.variants.map((v) => renderItem(v, true))}
              </div>
            );
          })}
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No items found</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
