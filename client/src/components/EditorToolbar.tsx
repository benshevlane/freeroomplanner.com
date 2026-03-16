import { EditorTool, UnitSystem, MeasureMode } from "../lib/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  MousePointer2,
  Pencil,
  Type,
  Eraser,
  Hand,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Trash2,
  Trash,
  Image,
  FolderOpen,
} from "lucide-react";

interface EditorToolbarProps {
  selectedTool: EditorTool;
  onSetTool: (tool: EditorTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotateSelected: () => void;
  onDeleteSelected: () => void;
  hasSelection: boolean;
  selectionIsFurniture: boolean;
  onSavePlan: () => void;
  onLoadPlan: () => void;
  onClearAll: () => void;
  zoom: number;
  units: UnitSystem;
  onToggleUnits: () => void;
  measureMode: MeasureMode;
  onToggleMeasureMode: () => void;
}

const tools: { tool: EditorTool; icon: typeof MousePointer2; label: string; shortcut: string }[] = [
  { tool: "select", icon: MousePointer2, label: "Select & Move", shortcut: "V" },
  { tool: "pan", icon: Hand, label: "Pan / Drag", shortcut: "H" },
  { tool: "wall", icon: Pencil, label: "Draw Walls", shortcut: "W" },
  { tool: "label", icon: Type, label: "Add Label", shortcut: "L" },
  { tool: "eraser", icon: Eraser, label: "Eraser", shortcut: "E" },
];

export default function EditorToolbar({
  selectedTool,
  onSetTool,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onZoomIn,
  onZoomOut,
  onRotateSelected,
  onDeleteSelected,
  hasSelection,
  selectionIsFurniture,
  onSavePlan,
  onLoadPlan,
  onClearAll,
  zoom,
  units,
  onToggleUnits,
  measureMode,
  onToggleMeasureMode,
}: EditorToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-card" data-testid="editor-toolbar">
      {/* Tools */}
      <div className="flex items-center gap-0.5">
        {tools.map(({ tool, icon: Icon, label, shortcut }) => (
          <Tooltip key={tool}>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={selectedTool === tool ? "default" : "ghost"}
                onClick={() => onSetTool(tool)}
                data-testid={`tool-${tool}`}
              >
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{label} ({shortcut})</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Undo/Redo */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" onClick={onUndo} disabled={!canUndo} data-testid="btn-undo">
              <Undo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Undo (Ctrl+Z)</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" onClick={onRedo} disabled={!canRedo} data-testid="btn-redo">
              <Redo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Redo (Ctrl+Y)</p></TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Zoom */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" onClick={onZoomOut} data-testid="btn-zoom-out">
              <ZoomOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Zoom Out</p></TooltipContent>
        </Tooltip>
        <span className="text-xs text-muted-foreground w-12 text-center tabular-nums" data-testid="zoom-level">
          {Math.round(zoom * 100)}%
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" onClick={onZoomIn} data-testid="btn-zoom-in">
              <ZoomIn className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Zoom In</p></TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Selection actions */}
      {hasSelection && (
        <div className="flex items-center gap-0.5">
          {selectionIsFurniture && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" onClick={onRotateSelected} data-testid="btn-rotate">
                  <RotateCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Rotate 90 deg</p></TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={onDeleteSelected} data-testid="btn-delete-selected">
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Delete (Del)</p></TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="h-6 mx-1" />
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" onClick={onClearAll} className="text-destructive" data-testid="btn-clear">
              <Trash className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Clear all items</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" onClick={onSavePlan} data-testid="btn-save-plan">
              <Image className="h-4 w-4 mr-1" />
              Save Image
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Save as PNG image</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              onClick={onToggleMeasureMode}
              data-testid="btn-toggle-measure"
              className="text-xs px-2"
            >
              {measureMode === "full" ? "Full Wall" : "Inside"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{measureMode === "full" ? "Showing full wall length — click for inside measurement" : "Showing inside measurement — click for full wall length"}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              onClick={onToggleUnits}
              data-testid="btn-toggle-units"
              className="text-xs font-mono px-2"
            >
              {units === "metric" ? "m" : "ft"}
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>{units === "metric" ? "Switch to feet / sq ft" : "Switch to metres / m²"}</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" onClick={onLoadPlan} data-testid="btn-load-plan">
              <FolderOpen className="h-4 w-4 mr-1" />
              Load
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Load Plan (JSON)</p></TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
