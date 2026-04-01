import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { apiRequest } from "@/lib/queryClient";

const BUCKET = "hero-images";
const OBJECT_PATH = "hero-floorplan.jpg";

interface EmbedPartner {
  partner_id: string;
  business_name: string;
  email: string;
  website_url: string | null;
  created_at: string | null;
  embed_loaded_count: number;
  plan_exported_count: number;
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiRequest("POST", "/api/admin/forgot-password", { email });
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1a1a18] flex items-center justify-center">
      <div className="w-full max-w-sm px-5">
        <div className="bg-white rounded-xl border border-[#e8e3d8] shadow-sm p-8">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-[#e8f5f1] flex items-center justify-center">
              <svg className="w-6 h-6 text-[#3d8a7c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>

          <h1 className="text-xl font-bold mb-1 text-center">Reset Password</h1>
          <p className="text-[#6b6457] mb-6 text-center text-sm">
            {sent ? "Check your email for a reset link." : "Enter your email to receive a reset link."}
          </p>

          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="reset-email" className="block text-sm font-medium text-[#6b6457] mb-1">Email</label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  autoFocus
                  autoComplete="email"
                  className="w-full border border-[#d8d2c4] rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#3d8a7c] transition-colors"
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full bg-[#3d8a7c] text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-[#357a6e] disabled:opacity-50 transition-colors"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-[#6b6457] text-center">
              If an account exists with that email, you'll receive a password reset link shortly.
            </p>
          )}

          <button
            onClick={onBack}
            className="w-full text-center mt-4 text-sm text-[#3d8a7c] hover:underline"
          >
            &larr; Back to login
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordForm({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/admin/reset-password", { token, password });
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("expired") || msg.includes("Invalid")) {
        setError("This reset link is invalid or has expired. Please request a new one.");
      } else {
        setError("Failed to reset password. Please try again.");
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1a1a18] flex items-center justify-center">
      <div className="w-full max-w-sm px-5">
        <div className="bg-white rounded-xl border border-[#e8e3d8] shadow-sm p-8">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-[#e8f5f1] flex items-center justify-center">
              <svg className="w-6 h-6 text-[#3d8a7c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>

          <h1 className="text-xl font-bold mb-1 text-center">Set New Password</h1>
          <p className="text-[#6b6457] mb-6 text-center text-sm">Enter your new password below.</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-[#6b6457] mb-1">New Password</label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                autoFocus
                autoComplete="new-password"
                className="w-full border border-[#d8d2c4] rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#3d8a7c] transition-colors"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-[#6b6457] mb-1">Confirm Password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
                className="w-full border border-[#d8d2c4] rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#3d8a7c] transition-colors"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password || !confirm}
              className="w-full bg-[#3d8a7c] text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-[#357a6e] disabled:opacity-50 transition-colors"
            >
              {loading ? "Resetting..." : "Reset password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function LoginForm({ onSuccess }: { onSuccess: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("reset");
  });
  const [resetSuccess, setResetSuccess] = useState(false);

  // Show reset password form if token is in URL
  if (resetToken) {
    return (
      <ResetPasswordForm
        token={resetToken}
        onSuccess={() => {
          setResetToken(null);
          setResetSuccess(true);
          // Clean up URL
          window.history.replaceState({}, "", "/admin");
        }}
      />
    );
  }

  if (showForgot) {
    return <ForgotPasswordForm onBack={() => setShowForgot(false)} />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiRequest("POST", "/api/admin/login", { email, password });
      onSuccess(email);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("429")) {
        setError("Too many attempts. Please wait a few minutes and try again.");
      } else if (msg.startsWith("401")) {
        setError("Invalid email or password");
      } else {
        setError("Login failed. Please try again.");
        console.error("Admin login error:", msg);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1a1a18] flex items-center justify-center">
      <div className="w-full max-w-sm px-5">
        <div className="bg-white rounded-xl border border-[#e8e3d8] shadow-sm p-8">
          {/* Lock icon */}
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-[#e8f5f1] flex items-center justify-center">
              <svg className="w-6 h-6 text-[#3d8a7c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>

          <h1 className="text-xl font-bold mb-1 text-center">Admin Login</h1>
          <p className="text-[#6b6457] mb-6 text-center text-sm">Sign in to manage your site.</p>

          {resetSuccess && (
            <p className="text-[#3d8a7c] text-sm mb-4 text-center">Password reset successfully. Sign in with your new password.</p>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="admin-email" className="block text-sm font-medium text-[#6b6457] mb-1">Email</label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                autoFocus
                autoComplete="email"
                className="w-full border border-[#d8d2c4] rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#3d8a7c] transition-colors"
              />
            </div>
            <div>
              <label htmlFor="admin-password" className="block text-sm font-medium text-[#6b6457] mb-1">Password</label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="w-full border border-[#d8d2c4] rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-[#3d8a7c] transition-colors"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-[#3d8a7c] text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-[#357a6e] disabled:opacity-50 transition-colors"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <button
            onClick={() => setShowForgot(true)}
            className="w-full text-center mt-4 text-sm text-[#3d8a7c] hover:underline"
          >
            Forgot password?
          </button>
        </div>

        <p className="text-center mt-6">
          <a href="/" className="text-sm text-[#3d8a7c] hover:underline">&larr; Return to site</a>
        </p>
      </div>
    </div>
  );
}

interface DownloadPartner {
  partner_id: string;
  business_name: string;
  plan_exported_count: number;
}

function DownloadsReport() {
  const { data, isLoading, error } = useQuery<{
    total_downloads: number;
    embed_partner_downloads: DownloadPartner[];
  }>({
    queryKey: ["/api/admin/downloads-report"],
  });

  if (isLoading) return <p className="text-sm text-[#9a9488]">Loading downloads report...</p>;
  if (error) return <p className="text-sm text-red-600">Failed to load downloads report.</p>;

  const total = data?.total_downloads ?? 0;
  const partners = data?.embed_partner_downloads ?? [];

  return (
    <div className="mt-12">
      <h2 className="text-lg font-semibold mb-1">Plan Downloads</h2>
      <p className="text-sm text-[#6b6457] mb-4">
        {total} total plan{total !== 1 ? "s" : ""} downloaded via embed partners
      </p>
      {partners.length === 0 ? (
        <p className="text-sm text-[#9a9488]">No plan downloads recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e8e3d8] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e8e3d8] bg-[#f5f2ec]">
                <th className="text-left px-4 py-3 font-medium text-[#6b6457]">Partner</th>
                <th className="text-right px-4 py-3 font-medium text-[#6b6457]">Plans Downloaded</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.partner_id} className="border-b border-[#e8e3d8] last:border-0">
                  <td className="px-4 py-3 font-medium">{p.business_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.plan_exported_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmbedReport() {
  const { data, isLoading, error } = useQuery<{ partners: EmbedPartner[] }>({
    queryKey: ["/api/admin/embed-report"],
  });

  if (isLoading) return <p className="text-sm text-[#9a9488]">Loading embed report...</p>;
  if (error) return <p className="text-sm text-red-600">Failed to load embed report.</p>;

  const partners = data?.partners ?? [];

  return (
    <div className="mt-12">
      <h2 className="text-lg font-semibold mb-1">Embed Users</h2>
      <p className="text-sm text-[#6b6457] mb-4">
        {partners.length} registered partner{partners.length !== 1 ? "s" : ""}
      </p>
      {partners.length === 0 ? (
        <p className="text-sm text-[#9a9488]">No embed users yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e8e3d8] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e8e3d8] bg-[#f5f2ec]">
                <th className="text-left px-4 py-3 font-medium text-[#6b6457]">Business Name</th>
                <th className="text-left px-4 py-3 font-medium text-[#6b6457]">Email</th>
                <th className="text-left px-4 py-3 font-medium text-[#6b6457]">Website</th>
                <th className="text-right px-4 py-3 font-medium text-[#6b6457]">Embed Loads</th>
                <th className="text-right px-4 py-3 font-medium text-[#6b6457]">Plans Exported</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.partner_id} className="border-b border-[#e8e3d8] last:border-0">
                  <td className="px-4 py-3 font-medium">{p.business_name}</td>
                  <td className="px-4 py-3 text-[#6b6457]">{p.email}</td>
                  <td className="px-4 py-3">
                    {p.website_url ? (
                      <a
                        href={p.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#3d8a7c] hover:underline"
                      >
                        {p.website_url.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      <span className="text-[#c4bfb4]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.embed_loaded_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.plan_exported_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [heroExists, setHeroExists] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Check auth status on mount
  useEffect(() => {
    fetch("/api/admin/auth-status", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setIsAuthenticated(d.authenticated);
        if (d.authenticated && d.email) setAdminEmail(d.email);
      })
      .catch(() => setIsAuthenticated(false));
  }, []);

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/admin/logout");
    } catch {
      // Ignore errors — clear client state regardless
    }
    setIsAuthenticated(false);
    setAdminEmail(null);
  };

  const getPublicUrl = useCallback((): string | null => {
    if (!supabase) return null;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(OBJECT_PATH);
    return data.publicUrl;
  }, []);

  const checkHero = useCallback(async () => {
    if (!supabase) {
      setMessage("Supabase is not configured. Check environment variables.");
      setMessageType("error");
      return;
    }
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list("", { search: OBJECT_PATH });
      if (error) {
        console.error("Error checking hero image:", error);
        setHeroExists(false);
        return;
      }
      const exists = !!data && data.some((f) => f.name === OBJECT_PATH);
      setHeroExists(exists);
      if (exists) {
        const url = getPublicUrl();
        setPreview(url ? `${url}?t=${Date.now()}` : null);
      } else {
        setPreview(null);
      }
    } catch (err) {
      console.error("Error checking hero image:", err);
      setHeroExists(false);
    }
  }, [getPublicUrl]);

  useEffect(() => {
    if (isAuthenticated) checkHero();
  }, [isAuthenticated, checkHero]);

  const compressImage = (file: File, maxWidth = 1920, quality = 0.85): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error("Compression failed")),
          "image/jpeg",
          quality,
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = URL.createObjectURL(file);
    });
  };

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setMessage("Please select an image file.");
      setMessageType("error");
      return;
    }
    if (!supabase) {
      setMessage("Supabase is not configured. Check environment variables.");
      setMessageType("error");
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      const blob = await compressImage(file);
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(OBJECT_PATH, blob, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (error) {
        setMessage("Upload failed — " + error.message);
        setMessageType("error");
      } else {
        setMessage(`Uploaded successfully (${(blob.size / 1024).toFixed(0)} KB)`);
        setMessageType("success");
        await checkHero();
      }
    } catch (err) {
      setMessage("Upload failed — " + (err instanceof Error ? err.message : "unknown error"));
      setMessageType("error");
    }
    setUploading(false);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDelete = async () => {
    if (!supabase) return;
    const { error } = await supabase.storage.from(BUCKET).remove([OBJECT_PATH]);
    if (error) {
      setMessage("Delete failed — " + error.message);
      setMessageType("error");
      return;
    }
    setPreview(null);
    setHeroExists(false);
    setMessage("Hero image removed. The homepage will show the default illustration.");
    setMessageType("success");
  };

  // Loading state
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-[#faf8f4] flex items-center justify-center">
        <p className="text-sm text-[#9a9488]">Loading...</p>
      </div>
    );
  }

  // Not authenticated — show login
  if (!isAuthenticated) {
    return (
      <LoginForm
        onSuccess={(email) => {
          setIsAuthenticated(true);
          setAdminEmail(email);
        }}
      />
    );
  }

  // Authenticated — show admin content
  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1a1a18]">
      <div className="max-w-3xl mx-auto px-5 py-16">
        <div className="flex items-center justify-between mb-6">
          <a href="/" className="text-sm text-[#3d8a7c] hover:underline">&larr; Back to site</a>
          <div className="flex items-center gap-4">
            {adminEmail && (
              <span className="text-sm text-[#9a9488]">{adminEmail}</span>
            )}
            <button
              onClick={handleLogout}
              className="text-sm text-[#6b6457] hover:text-[#1a1a18] transition-colors"
            >
              Log out
            </button>
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-2">Admin</h1>
        <p className="text-[#6b6457] mb-10">Manage the homepage hero image and view embed analytics.</p>

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
          <p className="text-sm text-[#9a9488] mt-1">PNG, JPG, or WebP. Will be compressed and saved as the homepage hero image.</p>
        </div>

        {message && (
          <p className={`mt-4 text-sm font-medium ${messageType === "error" ? "text-red-600" : "text-[#3d8a7c]"}`}>{message}</p>
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
            <p className="text-xs text-[#9a9488] mt-2">Stored in Supabase Storage</p>
          </div>
        )}

        {/* Plan Downloads Report */}
        <DownloadsReport />

        {/* Embed Users Report */}
        <EmbedReport />
      </div>
    </div>
  );
}
