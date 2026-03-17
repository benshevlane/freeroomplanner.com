/**
 * Generates the Open Graph image (og-image.png) for social sharing.
 * Run: npx tsx script/generate-og-image.ts
 */
import { createCanvas } from "canvas";
import { writeFileSync } from "fs";
import path from "path";

const W = 1200;
const H = 630;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

// Background
ctx.fillStyle = "#faf9f6";
ctx.fillRect(0, 0, W, H);

// Grid pattern
ctx.strokeStyle = "rgba(0,0,0,0.04)";
ctx.lineWidth = 1;
for (let x = 0; x < W; x += 30) {
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, H);
  ctx.stroke();
}
for (let y = 0; y < H; y += 30) {
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.stroke();
}

// Floor plan illustration - walls
const accent = "#3d8a7c";
ctx.strokeStyle = accent;
ctx.lineWidth = 4;

// Main room outline
ctx.strokeRect(600, 120, 400, 360);
// Internal wall
ctx.beginPath();
ctx.moveTo(600, 300);
ctx.lineTo(800, 300);
ctx.stroke();
ctx.beginPath();
ctx.moveTo(800, 300);
ctx.lineTo(800, 480);
ctx.stroke();

// Door arc
ctx.strokeStyle = accent;
ctx.lineWidth = 2;
ctx.setLineDash([4, 3]);
ctx.beginPath();
ctx.arc(800, 300, 40, 0, Math.PI / 2);
ctx.stroke();
ctx.setLineDash([]);

// Furniture - sofa
ctx.fillStyle = "rgba(61,138,124,0.08)";
ctx.strokeStyle = "rgba(0,0,0,0.15)";
ctx.lineWidth = 1.5;
ctx.fillRect(620, 140, 120, 50);
ctx.strokeRect(620, 140, 120, 50);

// Furniture - table
ctx.fillRect(660, 220, 60, 40);
ctx.strokeRect(660, 220, 60, 40);

// Furniture - bed
ctx.fillRect(830, 320, 140, 100);
ctx.strokeRect(830, 320, 140, 100);
ctx.fillStyle = "rgba(61,138,124,0.12)";
ctx.fillRect(830, 320, 140, 30);

// Measurement line
ctx.strokeStyle = accent;
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.moveTo(600, 510);
ctx.lineTo(1000, 510);
ctx.stroke();
ctx.beginPath();
ctx.moveTo(600, 504);
ctx.lineTo(600, 516);
ctx.stroke();
ctx.beginPath();
ctx.moveTo(1000, 504);
ctx.lineTo(1000, 516);
ctx.stroke();

// Measurement text
ctx.fillStyle = accent;
ctx.font = "500 14px sans-serif";
ctx.textAlign = "center";
ctx.fillText("5.50 m", 800, 530);

// Room labels
ctx.fillStyle = "rgba(0,0,0,0.35)";
ctx.font = "italic 13px sans-serif";
ctx.textAlign = "center";
ctx.fillText("Living room", 700, 275);
ctx.fillText("Bedroom", 900, 290);

// Brand text - left side
ctx.fillStyle = "#1a1a1a";
ctx.font = "bold 52px sans-serif";
ctx.textAlign = "left";
ctx.fillText("Free Room", 60, 220);
ctx.fillText("Planner", 60, 280);

// Tagline
ctx.fillStyle = "#666";
ctx.font = "400 22px sans-serif";
ctx.fillText("Draw accurate floor plans", 60, 330);
ctx.fillText("in minutes — free, no login", 60, 360);

// Badge
ctx.fillStyle = accent;
ctx.font = "600 16px sans-serif";
ctx.fillText("freeroomplanner.com", 60, 420);

// Logo icon (simplified floor plan icon)
ctx.strokeStyle = accent;
ctx.lineWidth = 3;
ctx.strokeRect(60, 100, 50, 50);
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(60, 125);
ctx.lineTo(90, 125);
ctx.stroke();
ctx.beginPath();
ctx.moveTo(90, 125);
ctx.lineTo(90, 150);
ctx.stroke();

// Save
const outPath = path.resolve("client/public/og-image.png");
writeFileSync(outPath, canvas.toBuffer("image/png"));
console.log(`Generated: ${outPath} (${W}x${H})`);
