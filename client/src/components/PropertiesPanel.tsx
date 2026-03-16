import { Wall, FurnitureItem, RoomLabel } from "../lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCw, Trash2, Ruler, Copy } from "lucide-react";

interface PropertiesPanelProps {
  selectedWall: Wall | null;
  selectedFurniture: FurnitureItem | null;
  selectedLabel: RoomLabel | null;
  onRotate: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUpdateFurniture: (id: string, updates: Partial<FurnitureItem>) => void;
}

export default function PropertiesPanel({
  selectedWall,
  selectedFurniture,
  selectedLabel,
  onRotate,
  onDelete,
  onDuplicate,
  onUpdateFurniture,
}: PropertiesPanelProps) {
  if (!selectedWall && !selectedFurniture && !selectedLabel) {
    return (
      <div className="p-4 text-sm text-muted-foreground" data-testid="properties-empty">
        <p className="font-medium text-foreground mb-1">Properties</p>
        <p>Select an item to view its properties</p>
      </div>
    );
  }

  if (selectedWall) {
    const dx = selectedWall.end.x - selectedWall.start.x;
    const dy = selectedWall.end.y - selectedWall.start.y;
    const lengthCm = Math.sqrt(dx * dx + dy * dy);

    return (
      <div className="p-4 space-y-3" data-testid="properties-wall">
        <p className="text-sm font-semibold">Wall</p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Length:</span>
            <span className="font-medium">{(lengthCm / 100).toFixed(2)}m</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground ml-5">Thickness:</span>
            <span className="font-medium">{selectedWall.thickness}cm</span>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive w-full mt-2" data-testid="btn-delete-wall">
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Delete Wall
        </Button>
      </div>
    );
  }

  if (selectedFurniture) {
    return (
      <div className="p-4 space-y-3" data-testid="properties-furniture">
        <p className="text-sm font-semibold">{selectedFurniture.label}</p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Width:</span>
            <Input
              type="number"
              min={20}
              value={selectedFurniture.width}
              onChange={(e) => {
                const val = Math.max(20, parseInt(e.target.value) || 20);
                const delta = val - selectedFurniture.width;
                // Adjust position so item resizes from center, not top-left
                onUpdateFurniture(selectedFurniture.id, {
                  width: val,
                  x: selectedFurniture.x - delta / 2,
                });
              }}
              className="h-7 w-20 text-sm"
              data-testid="input-furniture-width"
            />
            <span className="text-muted-foreground text-xs">cm</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Height:</span>
            <Input
              type="number"
              min={20}
              value={selectedFurniture.height}
              onChange={(e) => {
                const val = Math.max(20, parseInt(e.target.value) || 20);
                const delta = val - selectedFurniture.height;
                // Adjust position so item resizes from center, not top-left
                onUpdateFurniture(selectedFurniture.id, {
                  height: val,
                  y: selectedFurniture.y - delta / 2,
                });
              }}
              className="h-7 w-20 text-sm"
              data-testid="input-furniture-height"
            />
            <span className="text-muted-foreground text-xs">cm</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Rotation:</span>
            <span className="font-medium">{selectedFurniture.rotation}°</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Category:</span>
            <span className="font-medium">{selectedFurniture.category}</span>
          </div>
        </div>
        <div className="flex gap-1 pt-1">
          <Button size="sm" variant="secondary" onClick={onRotate} className="flex-1" data-testid="btn-rotate-furniture">
            <RotateCw className="h-3.5 w-3.5 mr-1" />
            Rotate
          </Button>
          <Button size="sm" variant="secondary" onClick={onDuplicate} data-testid="btn-duplicate-furniture">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive" data-testid="btn-delete-furniture">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  if (selectedLabel) {
    return (
      <div className="p-4 space-y-3" data-testid="properties-label">
        <p className="text-sm font-semibold">Label</p>
        <p className="text-sm">{selectedLabel.text}</p>
        <div className="flex gap-1 pt-1">
          <Button size="sm" variant="secondary" onClick={onDuplicate} className="flex-1" data-testid="btn-duplicate-label">
            <Copy className="h-3.5 w-3.5 mr-1" />
            Duplicate
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive" data-testid="btn-delete-label">
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
