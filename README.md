# 🪟 `setShape` demo IWA

This application demonstrates how to build a fully custom, frameless desktop experience using ChromeOS Isolated Web Apps (IWA). 

By combining the ChromeOS `setShape` API with the Window Management API, this app creates the illusion of popups and tooltips rendering *outside* the boundaries of the main application window. It achieves this by silently resizing the hidden OS-level window while dynamically masking the visible content area.

## ⚠️ Critical Prerequisites

1. **Window Management Permission:** The unframed feature requires the `window-management` permission to be granted in the browser.
2. **Enable Chrome `setShape` Feature:** The browser must have the `setShape` feature enabled. Without this feature, the OS cannot mask the rectangular window boundaries, and the transparent areas of the buffer will render as a solid block.

---

## ✨ Features

* **Custom Frameless UI:** Replaces the native OS title bar and resize handles with entirely custom HTML/CSS counterparts.
* **Out-of-Bounds Popups:** Spawns context menus and tooltips that float outside the main application UI.
* **Static vs. Dynamic Buffer Toggle:** A visual UI switch to easily observe how the app behaves with and without the invisible 50px rendering buffer.


## 🚀 Setup & Usage

1. Serve the application locally or install it as an Isolated Web App on your ChromeOS device.
2. Upon launching, the app will prompt for **Window Management** permissions via a full-screen overlay. Click **Grant Permission** and accept the native browser prompt.
3. Use the **Custom Title Bar** to drag the app around your screen.
4. Use the custom resize handles on the right, bottom, and bottom-right to stretch the app.
5. Click the directional buttons (e.g., `Top-Left`, `Bottom-Right`) to spawn tooltips that break outside the main app container.