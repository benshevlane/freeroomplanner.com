import { EditorTool, UnitSystem, MeasureMode, UNIT_LABELS, UNIT_SHORT } from "../lib/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MousePointer2,
  Pencil,
  MoveRight,
  Type,
  Eraser,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Trash2,
  Trash,
  Image,
  Download,
  FileDown,
  FolderOpen,
  MoreHorizontal,
  LayoutList,
  SlidersHorizontal,
  Tags,
  TextCursorInput,
  Ruler,
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
  onSaveJSON: () => void;
  onSaveAllJSON: () => void;
  onLoadPlan: () => void;
  onClearAll: () => void;
  zoom: number;
  units: UnitSystem;
  onSetUnits: (units: UnitSystem) => void;
  measureMode: MeasureMode;
  onToggleMeasureMode: () => void;
  showAllMeasurements: boolean;
  onToggleShowAllMeasurements: () => void;
  onAddTextBox: () => void;
  isMobile?: boolean;
  onToggleFurniturePanel?: () => void;
  onTogglePropertiesPanel?: () => void;
  componentLabelsVisible: boolean;
  onToggleComponentLabels: () => void;
}

const tools: { tool: EditorTool; icon: typeof MousePointer2; label: string; shortcut: string }[] = [
  { tool: "select", icon: MousePointer2, label: "Select / Pan", shortcut: "V" },
  { tool: "wall", icon: Pencil, label: "Draw Walls", shortcut: "W" },
  { tool: "arrow", icon: MoveRight, label: "Draw Arrow", shortcut: "A" },
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
  onSaveJSON,
  onSaveAllJSON,
  onLoadPlan,
  onClearAll,
  zoom,
  units,
  onSetUnits,
  measureMode,
  onToggleMeasureMode,
  showAllMeasurements,
  onToggleShowAllMeasurements,
  onAddTextBox,
  isMobile,
  onToggleFurniturePanel,
  onTogglePropertiesPanel,
  componentLabelsVisible,
  onToggleComponentLabels,
}: EditorToolbarProps) {
  if (isMobile) {
    const btnClass = "h-11 w-11 flex-shrink-0";
    return (
      <div className="border-b border-border bg-card overflow-hidden" data-testid="editor-toolbar">
        {/* Row 1: Library + Tools + Undo/Redo + Properties */}
        <div className="flex items-center gap-0.5 px-2 py-1 overflow-x-auto scrollbar-hide">
          <Button size="icon" variant="ghost" className={btnClass} onClick={onToggleFurniturePanel} data-testid="btn-library">
            <LayoutList className="h-5 w-5" />
          </Button>

          <Separator orientation="vertical" className="h-6 mx-0.5 flex-shrink-0" />

          {tools.map(({ tool, icon: Icon }) => (
            <Button
              key={tool}
              size="icon"
              variant={selectedTool === tool ? "default" : "ghost"}
              className={btnClass}
              onClick={() => onSetTool(tool)}
              data-testid={`tool-${tool}`}
            >
              <Icon className="h-5 w-5" />
            </Button>
          ))}

          <Separator orientation="vertical" className="h-6 mx-0.5 flex-shrink-0" />

          <Button size="icon" variant={selectedTool === "label" ? "default" : "ghost"} className={btnClass} onClick={() => onSetTool("label")} data-testid="tool-label">
            <Type className="h-5 w-5" />
          </Button>
          <Button size="icon" variant="ghost" className={btnClass} onClick={onAddTextBox} data-testid="btn-add-text-box">
            <TextCursorInput className="h-5 w-5" />
          </Button>

          <Separator orientation="vertical" className="h-6 mx-0.5 flex-shrink-0" />

          <Button size="icon" variant="ghost" className={btnClass} onClick={onUndo} disabled={!canUndo} data-testid="btn-undo">
            <Undo2 className="h-5 w-5" />
          </Button>
          <Button size="icon" variant="ghost" className={btnClass} onClick={onRedo} disabled={!canRedo} data-testid="btn-redo">
            <Redo2 className="h-5 w-5" />
          </Button>

        </div>

        {/* Row 2: Zoom + Selection actions + Overflow menu */}
        <div className="flex items-center gap-0.5 px-2 pb-1">
          <Button size="icon" variant="ghost" className={btnClass} onClick={onZoomOut} data-testid="btn-zoom-out">
            <ZoomOut className="h-5 w-5" />
          </Button>
          <span className="text-xs text-muted-foreground w-12 text-center tabular-nums" data-testid="zoom-level">
            {Math.round(zoom * 100)}%
          </span>
          <Button size="icon" variant="ghost" className={btnClass} onClick={onZoomIn} data-testid="btn-zoom-in">
            <ZoomIn className="h-5 w-5" />
          </Button>

          {hasSelection && (
            <>
              <Separator orientation="vertical" className="h-6 mx-0.5" />
              {selectionIsFurniture && (
                <Button size="icon" variant="ghost" className={btnClass} onClick={onRotateSelected} data-testid="btn-rotate">
                  <RotateCw className="h-5 w-5" />
                </Button>
              )}
              <Button size="icon" variant="ghost" className={btnClass} onClick={onDeleteSelected} data-testid="btn-delete-selected">
                <Trash2 className="h-5 w-5" />
              </Button>
            </>
          )}

          <div className="flex-1" />

          <Button size="icon" variant="ghost" className={btnClass} onClick={onTogglePropertiesPanel} data-testid="btn-properties">
            <SlidersHorizontal className="h-5 w-5" />
          </Button>

          {/* Overflow menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className={btnClass} data-testid="btn-more">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onSavePlan}>
                <Image className="h-4 w-4 mr-2" />
                Save Image (PNG)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSaveJSON}>
                <FileDown className="h-4 w-4 mr-2" />
                Save Room (JSON)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSaveAllJSON}>
                <Download className="h-4 w-4 mr-2" />
                Save All Rooms (JSON)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onLoadPlan}>
                <FolderOpen className="h-4 w-4 mr-2" />
                Load Plan
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {(["m", "cm", "mm", "ft"] as UnitSystem[]).map((u) => (
                <DropdownMenuItem key={u} onClick={() => onSetUnits(u)}>
                  {units === u ? "\u2713 " : "   "}{UNIT_LABELS[u]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={onToggleMeasureMode}>
                Measure: {measureMode === "full" ? "Full Wall" : "Inside"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleShowAllMeasurements}>
                <Ruler className="h-4 w-4 mr-2" />
                Show all measurements: {showAllMeasurements ? "On" : "Off"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleComponentLabels}>
                <Tags className="h-4 w-4 mr-2" />
                Labels: {componentLabelsVisible ? "On" : "Off"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onClearAll} className="text-destructive">
                <Trash className="h-4 w-4 mr-2" />
                Clear All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  // Desktop layout (unchanged)
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

      {/* Text / Annotation Tools */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant={selectedTool === "label" ? "default" : "ghost"}
              onClick={() => onSetTool("label")}
              data-testid="tool-label"
            >
              <Type className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Add Label (L)</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" onClick={onAddTextBox} data-testid="btn-add-text-box">
              <TextCursorInput className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Add Text Box (T)</p></TooltipContent>
        </Tooltip>
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
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" data-testid="btn-save-plan">
                  <Download className="h-4 w-4 mr-1" />
                  Save
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent><p>Save options</p></TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onSavePlan}>
              <Image className="h-4 w-4 mr-2" />
              Save Image (PNG)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSaveJSON}>
              <FileDown className="h-4 w-4 mr-2" />
              Save Room (JSON)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSaveAllJSON}>
              <Download className="h-4 w-4 mr-2" />
              Save All Rooms (JSON)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
              variant={showAllMeasurements ? "default" : "outline"}
              onClick={onToggleShowAllMeasurements}
              data-testid="btn-toggle-show-all-measurements"
              className="text-xs px-2"
            >
              <Ruler className="h-3.5 w-3.5 mr-1" />
              All
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{showAllMeasurements ? "Hide labels for walls under 1 m" : "Show all wall measurements (including short walls)"}</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="btn-toggle-units"
                  className="text-xs font-mono px-2"
                >
                  {UNIT_SHORT[units]}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent><p>Change measurement units</p></TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            {(["m", "cm", "mm", "ft"] as UnitSystem[]).map((u) => (
              <DropdownMenuItem key={u} onClick={() => onSetUnits(u)} className={units === u ? "font-semibold" : ""}>
                <span className="font-mono w-6 inline-block">{UNIT_SHORT[u]}</span>
                {UNIT_LABELS[u]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant={componentLabelsVisible ? "default" : "outline"}
              onClick={onToggleComponentLabels}
              data-testid="btn-toggle-labels"
              className="text-xs px-2"
            >
              <Tags className="h-3.5 w-3.5 mr-1" />
              Labels
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>{componentLabelsVisible ? "Hide component labels" : "Show component labels"}</p></TooltipContent>
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
