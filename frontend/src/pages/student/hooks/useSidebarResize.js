import { useState } from "react";

/**
 * Manages sidebar width state and mouse-drag resizing.
 * @param {number} [initialWidth=280] - Starting sidebar width in px.
 * @returns {{ sidebarWidth: number, startResizing: (e: MouseEvent) => void }}
 */
export default function useSidebarResize(initialWidth = 280) {
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth);

  const handleMouseMove = (e) => {
    const newWidth = e.clientX;
    if (newWidth >= 115 && newWidth <= 400) {
      setSidebarWidth(newWidth);
    }
  };

  const stopResizing = () => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", stopResizing);
  };

  const startResizing = (e) => {
    e.preventDefault();
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", stopResizing);
  };

  return { sidebarWidth, startResizing };
}
