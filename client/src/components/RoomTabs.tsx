import { useState, useRef, useCallback, useEffect } from "react";
import { RoomData } from "../lib/types";
import { Plus, X, Pencil, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RoomTabsProps {
  rooms: RoomData[];
  activeRoomId: string;
  roomOrder: string[];
  onSwitchRoom: (roomId: string) => void;
  onAddRoom: () => void;
  onRenameRoom: (roomId: string, name: string) => void;
  onDeleteRoom: (roomId: string) => void;
  onDuplicateRoom: (roomId: string) => void;
  onReorderRooms: (newOrder: string[]) => void;
}

export default function RoomTabs({
  rooms,
  activeRoomId,
  roomOrder,
  onSwitchRoom,
  onAddRoom,
  onRenameRoom,
  onDuplicateRoom,
  onDeleteRoom,
  onReorderRooms,
}: RoomTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const orderedRooms = roomOrder.map((id) => roomMap.get(id)).filter(Boolean) as RoomData[];

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startEditing = useCallback((room: RoomData) => {
    setEditingId(room.id);
    setEditingName(room.name);
  }, []);

  const commitEditing = useCallback(() => {
    if (editingId && editingName.trim()) {
      onRenameRoom(editingId, editingName.trim());
    }
    setEditingId(null);
  }, [editingId, editingName, onRenameRoom]);

  const handleDelete = useCallback((roomId: string) => {
    const room = roomMap.get(roomId);
    if (!room) return;
    const hasItems = room.walls.length > 0 || room.furniture.length > 0 ||
      room.labels.length > 0 || room.textBoxes.length > 0 || room.arrows.length > 0;
    if (hasItems) {
      setDeleteConfirm(roomId);
    } else {
      onDeleteRoom(roomId);
    }
  }, [rooms, onDeleteRoom]);

  // Drag-and-drop reordering
  const handleDragStart = useCallback((e: React.DragEvent, roomId: string) => {
    setDragId(roomId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", roomId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, roomId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(roomId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const newOrder = [...roomOrder];
    const fromIdx = newOrder.indexOf(dragId);
    const toIdx = newOrder.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragId);
    onReorderRooms(newOrder);
    setDragId(null);
    setDragOverId(null);
  }, [dragId, roomOrder, onReorderRooms]);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDragOverId(null);
  }, []);

  const deleteRoom = roomMap.get(deleteConfirm ?? "");

  return (
    <>
      <div className="flex items-center border-b border-border bg-card/50 px-1 min-h-[36px]">
        <div
          ref={scrollRef}
          className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide flex-1"
        >
          {orderedRooms.map((room) => {
            const isActive = room.id === activeRoomId;
            const isDragOver = room.id === dragOverId && dragId !== room.id;

            return (
              <div
                key={room.id}
                draggable={editingId !== room.id}
                onDragStart={(e) => handleDragStart(e, room.id)}
                onDragOver={(e) => handleDragOver(e, room.id)}
                onDrop={(e) => handleDrop(e, room.id)}
                onDragEnd={handleDragEnd}
                className={`
                  group relative flex items-center gap-1 px-3 py-1.5 text-sm cursor-pointer
                  rounded-t-md transition-colors select-none whitespace-nowrap shrink-0
                  ${isActive
                    ? "bg-background text-foreground border border-b-0 border-border -mb-px font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }
                  ${isDragOver ? "ring-2 ring-primary/40" : ""}
                  ${dragId === room.id ? "opacity-50" : ""}
                `}
                onClick={() => {
                  if (editingId !== room.id) onSwitchRoom(room.id);
                }}
                onDoubleClick={() => startEditing(room)}
              >
                {editingId === room.id ? (
                  <input
                    ref={inputRef}
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={commitEditing}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEditing();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="bg-transparent border-b border-primary outline-none text-sm w-20 min-w-[3ch]"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="max-w-[120px] truncate">{room.name}</span>
                )}

                {/* Tab action buttons — show on hover */}
                {editingId !== room.id && (
                  <>
                    <button
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditing(room);
                      }}
                      title="Rename room"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateRoom(room.id);
                      }}
                      title="Duplicate room"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    {roomOrder.length > 1 && (
                      <button
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(room.id);
                        }}
                        title="Delete room"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 ml-1 shrink-0"
          onClick={onAddRoom}
          title="Add room"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete room?</DialogTitle>
            <DialogDescription>
              "{deleteRoom?.name}" contains items. Are you sure you want to delete it? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm) onDeleteRoom(deleteConfirm);
                setDeleteConfirm(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
