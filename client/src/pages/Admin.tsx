import { useState, useRef, useCallback, useEffect } from "react";

export default function Admin() {
  const [heroExists, setHeroExists] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const checkHero = useCallback(async () => {
    const res = await fetch("/api/admin/hero-image");
    const data = await res.json();
    setHeroExists(data.exists);
    if (data.exists) setPreview(data.path + "?t=" + Date.now());
  }, []);

  useEffect(() => { checkHero(); }, [checkHero]);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setMessage("Please select an image file.");
      return;
    }
    setUploading(true);
    setMessage("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/admin/hero-image", { method: "POST", body: form });
      const data = await res.json();
      if (data.ok) {
        setMessage(`Uploaded (${(data.size / 1024).toFixed(0)} KB)`);
        checkHero();
      } else {
        setMessage(data.error || "Upload failed");
      }
    } catch {
      setMessage("Upload failed — network error");
    }
    setUploading(false);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }, []);

  const onDelete = async () => {
    await fetch("/api/admin/hero-image", { method: "DELETE" });
    setPreview(null);
    setHeroExists(false);
    setMessage("Hero image removed. The homepage will show the default SVG.");
  };

  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1a1a18]">
      <div className="max-w-2xl mx-auto px-5 py-16">
        <a href="/" className="text-sm text-[#3d8a7c] hover:underline mb-6 inline-block">&larr; Back to site</a>
        <h1 className="text-3xl font-bold mb-2">Admin</h1>
        <p className="text-[#6b6457] mb-10">Manage the homepage hero image.</p>

        {/* Upload area */}
        <div
          ref={dropRef}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-[#d8d2c4] rounded-xl p-10 text-center cursor-pointer hover:border-[#3d8a7c] transition-colors"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) upload(e.target.files[0]); }}
          />
          <div className="text-4xl mb-3 text-[#c4bfb4]">{uploading ? "..." : "+"}</div>
          <p className="font-medium">{uploading ? "Uploading..." : "Drop an image here or click to browse"}</p>
          <p className="text-sm text-[#9a9488] mt-1">PNG, JPG, or WebP. Will be saved as the homepage hero image.</p>
        </div>

        {message && (
          <p className="mt-4 text-sm font-medium text-[#3d8a7c]">{message}</p>
        )}

        {/* Current hero preview */}
        {heroExists && preview && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Current hero image</h2>
              <button
                onClick={onDelete}
                className="text-sm text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
            <div className="rounded-xl border border-[#e8e3d8] overflow-hidden shadow-sm bg-white">
              <img src={preview} alt="Hero preview" className="w-full" />
            </div>
            <p className="text-xs text-[#9a9488] mt-2">Served at <code className="bg-[#f0ede6] px-1.5 py-0.5 rounded">/hero-floorplan.png</code></p>
          </div>
        )}
      </div>
    </div>
  );
}
