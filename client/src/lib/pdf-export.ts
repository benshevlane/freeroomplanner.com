import jsPDF from "jspdf";
import { EditorState } from "./types";
import {
  drawGrid,
  drawWalls,
  drawFurniture,
  drawLabels,
  drawTextBoxes,
} from "./canvas-renderer";

export async function exportToPdf(state: EditorState, roomName: string) {
  // Create an offscreen canvas at high resolution
  const pdfWidth = 297; // A4 landscape mm
  const pdfHeight = 210;
  const scale = 3; // resolution multiplier
  const canvasW = pdfWidth * scale;
  const canvasH = pdfHeight * scale;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Calculate bounds of all elements
  const allPoints: { x: number; y: number }[] = [];
  state.walls.forEach((w) => {
    allPoints.push(w.start, w.end);
  });
  state.furniture.forEach((f) => {
    allPoints.push({ x: f.x, y: f.y }, { x: f.x + f.width, y: f.y + f.height });
  });
  state.labels.forEach((l) => {
    allPoints.push({ x: l.x - 100, y: l.y - 50 }, { x: l.x + 100, y: l.y + 50 });
  });
  (state.textBoxes || []).forEach((t) => {
    allPoints.push({ x: t.x, y: t.y }, { x: t.x + t.width, y: t.y + t.height });
  });

  if (allPoints.length === 0) {
    // Nothing to export
    allPoints.push({ x: 0, y: 0 }, { x: 500, y: 400 });
  }

  const minX = Math.min(...allPoints.map((p) => p.x)) - 50;
  const minY = Math.min(...allPoints.map((p) => p.y)) - 50;
  const maxX = Math.max(...allPoints.map((p) => p.x)) + 50;
  const maxY = Math.max(...allPoints.map((p) => p.y)) + 50;

  const contentW = maxX - minX;
  const contentH = maxY - minY;

  // Fit content to page with margins
  const marginPx = 60 * scale;
  const drawAreaW = canvasW - marginPx * 2;
  const drawAreaH = canvasH - marginPx * 2 - 40 * scale; // room for title

  const fitZoom = Math.min(drawAreaW / (contentW * 0.8), drawAreaH / (contentH * 0.8));
  const pxPerCm = fitZoom;

  const panOffset = {
    x: marginPx + (drawAreaW - contentW * pxPerCm) / 2 - minX * pxPerCm,
    y: marginPx + 35 * scale + (drawAreaH - contentH * pxPerCm) / 2 - minY * pxPerCm,
  };

  const gridSize = 100 * pxPerCm; // 1m = 100cm * pxPerCm
  const zoom = 1;

  // Draw grid (light)
  drawGrid(ctx, canvasW, canvasH, gridSize, zoom, panOffset, false);

  // Draw walls
  drawWalls(ctx, state.walls, gridSize, zoom, panOffset, false, null);

  // Draw furniture
  drawFurniture(ctx, state.furniture, gridSize, zoom, panOffset, false, null);

  // Draw labels
  drawLabels(ctx, state.labels, gridSize, zoom, panOffset, false, null);

  // Draw text boxes (notes) — shared renderer keeps PNG and PDF exports in sync
  drawTextBoxes(ctx, state.textBoxes, gridSize, zoom, panOffset);

  // Title
  ctx.font = `600 ${18 * scale}px 'General Sans', sans-serif`;
  ctx.fillStyle = "#28251d";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(roomName, marginPx, 20 * scale);

  // Date
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  ctx.font = `400 ${10 * scale}px 'General Sans', sans-serif`;
  ctx.fillStyle = "#7a7974";
  ctx.textAlign = "right";
  ctx.fillText(date, canvasW - marginPx, 24 * scale);

  // "Made with Free Room Planner" footer
  ctx.font = `400 ${8 * scale}px 'General Sans', sans-serif`;
  ctx.fillStyle = "#bab9b4";
  ctx.textAlign = "center";
  ctx.fillText("Made with freeroomplanner.com", canvasW / 2, canvasH - 16 * scale);

  // Scale indicator
  const scaleBarLen = 100 * pxPerCm; // 1m
  const scaleX = marginPx;
  const scaleY = canvasH - 30 * scale;
  ctx.strokeStyle = "#7a7974";
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(scaleX, scaleY);
  ctx.lineTo(scaleX + scaleBarLen, scaleY);
  ctx.moveTo(scaleX, scaleY - 4 * scale);
  ctx.lineTo(scaleX, scaleY + 4 * scale);
  ctx.moveTo(scaleX + scaleBarLen, scaleY - 4 * scale);
  ctx.lineTo(scaleX + scaleBarLen, scaleY + 4 * scale);
  ctx.stroke();
  ctx.font = `500 ${9 * scale}px 'General Sans', sans-serif`;
  ctx.fillStyle = "#7a7974";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  // Label the scale bar based on selected units
  let scaleLabel = "1 metre";
  switch (state.units) {
    case "ft": scaleLabel = "3 feet"; break;
    case "cm": scaleLabel = "100cm"; break;
    case "mm": scaleLabel = "1000mm"; break;
  }
  ctx.fillText(scaleLabel, scaleX + scaleBarLen / 2, scaleY - 6 * scale);

  // Generate PDF
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const imgData = canvas.toDataURL("image/png");
  pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);

  // Download
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${roomName.replace(/[^a-zA-Z0-9]/g, "_")}_floorplan.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
