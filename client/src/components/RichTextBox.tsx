import { useRef, useCallback, useEffect, useState } from "react";
import { TextBox, Point } from "../lib/types";
import RichTextToolbar from "./RichTextToolbar";

interface RichTextBoxProps {
  textBox: TextBox;
  isSelected: boolean;
  isEditMode: boolean;
  pxPerCm: number;
  panOffset: Point;
  zoom: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (id: string) => void;
  onStartDrag: (id: string, offsetX: number, offsetY: number) => void;
  onDoubleClick: (id: string) => void;
  onExitEdit: () => void;
  onContentChange: (id: string, html: string) => void;
  onStartResize: (id: string, corner: string, e: React.PointerEvent) => void;
  onStartRotate: (id: string, e: React.PointerEvent) => void;
}

const RESIZE_HANDLE_SIZE = 8;

export default function RichTextBox({
  textBox,
  isSelected,
  isEditMode,
  pxPerCm,
  panOffset,
  zoom,
  containerRef,
  onSelect,
  onStartDrag,
  onDoubleClick,
  onExitEdit,
  onContentChange,
  onStartResize,
  onStartRotate,
}: RichTextBoxProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);

  // Convert world coordinates to screen pixels
  const screenX = textBox.x * pxPerCm + panOffset.x;
  const screenY = textBox.y * pxPerCm + panOffset.y;
  const screenW = textBox.width * pxPerCm;
  const screenH = textBox.height * pxPerCm;

  const hasContent = textBox.content && textBox.content.replace(/<[^>]*>/g, "").trim().length > 0;

  useEffect(() => {
    if (isEditMode && contentRef.current) {
      contentRef.current.focus();
    }
  }, [isEditMode]);

  // Update container rect for toolbar positioning
  useEffect(() => {
    if (isEditMode && containerRef.current) {
      setContainerRect(containerRef.current.getBoundingClientRect());
    }
  }, [isEditMode, containerRef]);

  // Set content when entering edit mode
  useEffect(() => {
    if (isEditMode && contentRef.current) {
      if (contentRef.current.innerHTML !== textBox.content) {
        contentRef.current.innerHTML = textBox.content || "";
      }
    }
  }, [isEditMode]);

  const handleInput = useCallback(() => {
    if (contentRef.current) {
      onContentChange(textBox.id, contentRef.current.innerHTML);
    }
  }, [textBox.id, onContentChange]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isEditMode) {
        // In edit mode, allow normal text selection
        e.stopPropagation();
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      onSelect(textBox.id);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onStartDrag(textBox.id, e.clientX - rect.left, e.clientY - rect.top);
    },
    [textBox.id, isEditMode, onSelect, onStartDrag]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDoubleClick(textBox.id);
    },
    [textBox.id, onDoubleClick]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onExitEdit();
      }
      // Prevent canvas-level shortcuts while editing
      e.stopPropagation();
    },
    [onExitEdit]
  );

  const bgColor = textBox.backgroundColor || "#ffffff";
  const bgOpacity = textBox.backgroundOpacity ?? 1;
  // Convert hex to rgba
  const r = parseInt(bgColor.slice(1, 3), 16);
  const g = parseInt(bgColor.slice(3, 5), 16);
  const b = parseInt(bgColor.slice(5, 7), 16);
  const bgRgba = `rgba(${r}, ${g}, ${b}, ${bgOpacity})`;

  const boxStyle: React.CSSProperties = {
    position: "absolute",
    left: screenX,
    top: screenY,
    width: screenW,
    height: screenH,
    transform: `rotate(${textBox.rotation}deg)`,
    transformOrigin: "center center",
    backgroundColor: bgRgba,
    borderRadius: textBox.cornerRadius,
    padding: textBox.padding * zoom,
    fontSize: textBox.fontSize * zoom,
    fontFamily: textBox.fontFamily,
    overflow: isEditMode ? "auto" : "hidden",
    cursor: isEditMode ? "text" : isSelected ? "move" : "default",
    outline: isEditMode ? "2px solid #3b82f6" : isSelected ? "2px solid #01696f" : "none",
    outlineOffset: -1,
    boxSizing: "border-box",
    wordWrap: "break-word",
    overflowWrap: "break-word",
    lineHeight: 1.5,
    zIndex: textBox.zIndex + (isEditMode ? 100 : isSelected ? 50 : 0),
    userSelect: isEditMode ? "text" : "none",
    ...(textBox.borderEnabled
      ? {
          border: `${textBox.borderWidth}px ${textBox.borderStyle} ${textBox.borderColor}`,
        }
      : {}),
    ...(textBox.shadowEnabled
      ? {
          boxShadow: `${textBox.shadowOffsetX}px ${textBox.shadowOffsetY}px ${textBox.shadowBlur}px rgba(0,0,0,0.2)`,
        }
      : {}),
  };

  const resizeHandles = isSelected && !isEditMode ? (
    <>
      {(["tl", "tr", "bl", "br", "t", "b", "l", "r"] as const).map((corner) => {
        let hLeft = 0, hTop = 0;
        const hs = RESIZE_HANDLE_SIZE;
        const half = hs / 2;
        if (corner === "tl") { hLeft = -half; hTop = -half; }
        else if (corner === "tr") { hLeft = screenW - half; hTop = -half; }
        else if (corner === "bl") { hLeft = -half; hTop = screenH - half; }
        else if (corner === "br") { hLeft = screenW - half; hTop = screenH - half; }
        else if (corner === "t") { hLeft = screenW / 2 - half; hTop = -half; }
        else if (corner === "b") { hLeft = screenW / 2 - half; hTop = screenH - half; }
        else if (corner === "l") { hLeft = -half; hTop = screenH / 2 - half; }
        else if (corner === "r") { hLeft = screenW - half; hTop = screenH / 2 - half; }

        const cursors: Record<string, string> = {
          tl: "nwse-resize", tr: "nesw-resize", bl: "nesw-resize", br: "nwse-resize",
          t: "ns-resize", b: "ns-resize", l: "ew-resize", r: "ew-resize",
        };

        return (
          <div
            key={corner}
            style={{
              position: "absolute",
              left: hLeft,
              top: hTop,
              width: hs,
              height: hs,
              backgroundColor: "white",
              border: "2px solid #01696f",
              cursor: cursors[corner],
              zIndex: 1,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onStartResize(textBox.id, corner, e);
            }}
          />
        );
      })}
      {/* Rotate handle */}
      <div
        style={{
          position: "absolute",
          left: screenW / 2 - 6,
          top: -28,
          width: 12,
          height: 12,
          borderRadius: "50%",
          backgroundColor: "white",
          border: "2px solid #01696f",
          cursor: "grab",
          zIndex: 1,
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onStartRotate(textBox.id, e);
        }}
      />
      {/* Line from top center to rotate handle */}
      <div
        style={{
          position: "absolute",
          left: screenW / 2 - 0.5,
          top: -16,
          width: 1,
          height: 16,
          backgroundColor: "#01696f",
          zIndex: 0,
        }}
      />
    </>
  ) : null;

  return (
    <>
      <div
        style={boxStyle}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
        data-textbox-id={textBox.id}
      >
        {isEditMode ? (
          <div
            ref={contentRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            className="outline-none w-full h-full rich-text-content"
            style={{
              minHeight: "100%",
              color: "inherit",
            }}
          />
        ) : (
          <div
            className="w-full h-full rich-text-content pointer-events-none"
            style={{
              color: hasContent ? "inherit" : "#9ca3af",
              fontStyle: hasContent ? "normal" : "italic",
            }}
            dangerouslySetInnerHTML={{
              __html: hasContent ? textBox.content : "Double-click to edit...",
            }}
          />
        )}
        {resizeHandles}
      </div>
      {isEditMode && (
        <RichTextToolbar
          boxRect={{
            left: screenX + (containerRef.current?.getBoundingClientRect().left || 0),
            top: screenY + (containerRef.current?.getBoundingClientRect().top || 0),
            width: screenW,
          }}
          containerRect={containerRect}
        />
      )}
    </>
  );
}
