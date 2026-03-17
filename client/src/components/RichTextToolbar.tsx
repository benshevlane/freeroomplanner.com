import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Indent,
  Outdent,
  Heading1,
  Heading2,
  Heading3,
  Minus,
  RemoveFormatting,
  Pilcrow,
} from "lucide-react";

const FONT_FAMILIES = [
  { value: "sans-serif", label: "Sans-serif" },
  { value: "serif", label: "Serif" },
  { value: "monospace", label: "Monospace" },
];

const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

interface RichTextToolbarProps {
  boxRect: { left: number; top: number; width: number };
  containerRect: DOMRect | null;
}

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

function queryActive(command: string): boolean {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

function queryValue(command: string): string {
  try {
    return document.queryCommandValue(command) || "";
  } catch {
    return "";
  }
}

function ToolbarButton({
  icon: Icon,
  label,
  command,
  value,
  active,
  onClick,
}: {
  icon: typeof Bold;
  label: string;
  command?: string;
  value?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (onClick) {
        onClick();
      } else if (command) {
        exec(command, value);
      }
    },
    [command, value, onClick]
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleClick}
          className={`p-1.5 rounded hover:bg-accent transition-colors ${
            active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export default function RichTextToolbar({ boxRect, containerRect }: RichTextToolbarProps) {
  const [, forceUpdate] = useState(0);

  // Poll for formatting state changes
  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), 200);
    return () => clearInterval(interval);
  }, []);

  const isBold = queryActive("bold");
  const isItalic = queryActive("italic");
  const isUnderline = queryActive("underline");
  const isStrikethrough = queryActive("strikeThrough");

  const currentFontName = queryValue("fontName").replace(/['"]/g, "") || "sans-serif";
  const currentFontSize = queryValue("fontSize");

  // Position toolbar above the text box
  const toolbarWidth = 680;
  let left = boxRect.left + boxRect.width / 2 - toolbarWidth / 2;
  let top = boxRect.top - 48;

  // Ensure toolbar doesn't go off-screen
  if (containerRect) {
    if (left < containerRect.left + 4) left = containerRect.left + 4;
    if (left + toolbarWidth > containerRect.right - 4) left = containerRect.right - toolbarWidth - 4;
    if (top < containerRect.top + 4) {
      // Place below the box instead
      top = boxRect.top + 8;
    }
  }

  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 bg-popover border border-border rounded-lg shadow-lg px-2 py-1"
      style={{ left, top, maxWidth: toolbarWidth }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Font family */}
      <select
        className="h-7 text-xs bg-transparent border border-border rounded px-1 mr-1 outline-none cursor-pointer"
        value={currentFontName.includes("serif") && !currentFontName.includes("sans") ? "serif" : currentFontName.includes("mono") ? "monospace" : "sans-serif"}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.preventDefault();
          exec("fontName", e.target.value);
        }}
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Font size */}
      <select
        className="h-7 text-xs bg-transparent border border-border rounded px-1 mr-1 outline-none cursor-pointer w-14"
        value={currentFontSize || "3"}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.preventDefault();
          exec("fontSize", e.target.value);
        }}
      >
        {[1, 2, 3, 4, 5, 6, 7].map((s) => (
          <option key={s} value={s}>
            {FONT_SIZES[s - 1] ?? s}px
          </option>
        ))}
      </select>

      <div className="w-px h-5 bg-border mx-0.5" />

      {/* Text color */}
      <Tooltip>
        <TooltipTrigger asChild>
          <label className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer relative">
            <span className="block w-3.5 h-3.5 rounded border border-border" style={{ backgroundColor: queryValue("foreColor") || "#000000" }} />
            <input
              type="color"
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              value={queryValue("foreColor") || "#000000"}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => exec("foreColor", e.target.value)}
            />
          </label>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Text Color</TooltipContent>
      </Tooltip>

      {/* Highlight color */}
      <Tooltip>
        <TooltipTrigger asChild>
          <label className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer relative">
            <span className="block w-3.5 h-3.5 rounded border border-border" style={{ backgroundColor: queryValue("hiliteColor") || "transparent", backgroundImage: !queryValue("hiliteColor") || queryValue("hiliteColor") === "transparent" ? "linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)" : undefined, backgroundSize: "4px 4px", backgroundPosition: "0 0, 2px 2px" }} />
            <input
              type="color"
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              value={queryValue("hiliteColor") || "#ffff00"}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => exec("hiliteColor", e.target.value)}
            />
          </label>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Highlight</TooltipContent>
      </Tooltip>

      <div className="w-px h-5 bg-border mx-0.5" />

      <ToolbarButton icon={Bold} label="Bold (Ctrl+B)" command="bold" active={isBold} />
      <ToolbarButton icon={Italic} label="Italic (Ctrl+I)" command="italic" active={isItalic} />
      <ToolbarButton icon={Underline} label="Underline (Ctrl+U)" command="underline" active={isUnderline} />
      <ToolbarButton icon={Strikethrough} label="Strikethrough" command="strikeThrough" active={isStrikethrough} />

      <div className="w-px h-5 bg-border mx-0.5" />

      <ToolbarButton icon={AlignLeft} label="Align Left" command="justifyLeft" active={queryActive("justifyLeft")} />
      <ToolbarButton icon={AlignCenter} label="Align Center" command="justifyCenter" active={queryActive("justifyCenter")} />
      <ToolbarButton icon={AlignRight} label="Align Right" command="justifyRight" active={queryActive("justifyRight")} />
      <ToolbarButton icon={AlignJustify} label="Justify" command="justifyFull" active={queryActive("justifyFull")} />

      <div className="w-px h-5 bg-border mx-0.5" />

      <ToolbarButton icon={List} label="Bullet List" command="insertUnorderedList" active={queryActive("insertUnorderedList")} />
      <ToolbarButton icon={ListOrdered} label="Numbered List" command="insertOrderedList" active={queryActive("insertOrderedList")} />
      <ToolbarButton icon={Indent} label="Indent" command="indent" />
      <ToolbarButton icon={Outdent} label="Outdent" command="outdent" />

      <div className="w-px h-5 bg-border mx-0.5" />

      <ToolbarButton
        icon={Heading1}
        label="Heading 1"
        onClick={() => exec("formatBlock", "h1")}
        active={queryValue("formatBlock") === "h1"}
      />
      <ToolbarButton
        icon={Heading2}
        label="Heading 2"
        onClick={() => exec("formatBlock", "h2")}
        active={queryValue("formatBlock") === "h2"}
      />
      <ToolbarButton
        icon={Heading3}
        label="Heading 3"
        onClick={() => exec("formatBlock", "h3")}
        active={queryValue("formatBlock") === "h3"}
      />
      <ToolbarButton
        icon={Pilcrow}
        label="Normal"
        onClick={() => exec("formatBlock", "p")}
        active={queryValue("formatBlock") === "p" || queryValue("formatBlock") === ""}
      />

      <div className="w-px h-5 bg-border mx-0.5" />

      <ToolbarButton icon={Minus} label="Horizontal Rule" onClick={() => exec("insertHorizontalRule")} />
      <ToolbarButton icon={RemoveFormatting} label="Clear Formatting" command="removeFormat" />
    </div>
  );
}
