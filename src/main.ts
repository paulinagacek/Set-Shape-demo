// --- CONFIGURATION ---
const APP_CONFIG = {
    bufferSize: 50,
    minWindowWidth: 150,
    minWindowHeight: 150
};

class WindowManager {
    // --- STATE ---
    private state: AppState;
    private useStaticBuffer: boolean = false;
    private isMaximized: boolean = false;
    private preMaximizeState: Rect | null = null;
    private lastAppliedShape: string = "";
    private lastNativeX: number = window.screenX;
    private lastNativeY: number = window.screenY;

    // --- DOM CACHE ---
    private dom = {
        mainApp: document.getElementById('main-app') as HTMLElement,
        popupsContainer: document.getElementById('popups-container') as HTMLElement,
        workspace: document.getElementById('workspace') as HTMLElement,
        coordsText: document.getElementById('coords') as HTMLElement,

        // Controls
        toggleBuffer: document.getElementById('toggle-buffer-checkbox') as HTMLInputElement,
        btnMaximize: document.getElementById('btn-maximize') as HTMLElement,
        btnClose: document.getElementById('btn-close') as HTMLElement,
        btnTopLeft: document.getElementById('btn-top-left') as HTMLElement,
        btnLeft: document.getElementById('btn-left') as HTMLElement,
        btnTop: document.getElementById('btn-top') as HTMLElement,
        btnBottomRight: document.getElementById('btn-bottom-right') as HTMLElement,
        btnReset: document.getElementById('btn-reset') as HTMLElement,
        btnRemoveShape: document.getElementById('btn-remove-setshape') as HTMLElement,
    };

    constructor(initialState: AppState) {
        this.state = initialState;
    }

    // --- INITIALIZATION ---
    public async boot() {
        const hasPermission = await this.checkAndRequestWindowManagement();
        if (hasPermission) {
            this.bindEvents();
            this.setupCustomResizing();
            this.syncLayout();
            this.trackWindowMovement(); // Start the real-time polling loop
        }
    }

    // --- EVENT BINDING ---
    private bindEvents() {
        this.dom.toggleBuffer?.addEventListener('change', (e) => {
            this.syncAppPosition();
            this.useStaticBuffer = (e.target as HTMLInputElement).checked;
            this.syncLayout();
        });

        this.dom.btnMaximize?.addEventListener('click', () => this.toggleMaximize());
        this.dom.btnClose?.addEventListener('click', () => window.close());
        this.dom.btnReset?.addEventListener('click', () => this.resetPopups());
        this.dom.btnRemoveShape?.addEventListener('click', () => this.clearShapeMask());

        // Tooltip Triggers
        this.dom.btnTopLeft?.addEventListener('click', () => this.spawnPopup('tl-tooltip', "Top-Left Menu"));
        this.dom.btnLeft?.addEventListener('click', () => this.spawnPopup('l-tooltip', "Left Menu"));
        this.dom.btnTop?.addEventListener('click', () => this.spawnPopup('t-tooltip', "Top Menu"));
        this.dom.btnBottomRight?.addEventListener('click', () => this.spawnPopup('br-tooltip', "Bottom Context"));
    }

    // --- CORE LAYOUT ORCHESTRATOR ---
    private async syncLayout() {
        this.updatePopupAnchors();
        const bounds = this.calculateBoundingBox();

        // 1. Update internal visual DOM
        this.updateDOM(bounds.minX, bounds.minY);

        // Wait for the browser to visually render the DOM changes
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        // 2. Update external OS Native Window
        this.updateOSWindow(bounds.minX, bounds.minY, bounds.boundingW, bounds.boundingH);
        await this.applyShapeMask(bounds.minX, bounds.minY);
    }

    // --- DOM MANIPULATION ---
    private updateDOM(minX: number, minY: number) {
        const offsetX = this.state.app.x - minX;
        const offsetY = this.state.app.y - minY;

        this.dom.workspace.style.position = 'absolute';
        this.dom.workspace.style.left = `${offsetX}px`;
        this.dom.workspace.style.top = `${offsetY}px`;

        this.dom.mainApp.style.width = `${this.state.app.w}px`;
        this.dom.mainApp.style.height = `${this.state.app.h}px`;
        this.dom.mainApp.style.left = `0px`;
        this.dom.mainApp.style.top = `0px`;
        this.dom.coordsText.textContent = `${this.state.app.x}, ${this.state.app.y}`;

        // Re-render tooltips
        this.dom.popupsContainer.replaceChildren();
        for (const p of this.state.popups) {
            const el = document.createElement('div');
            el.className = 'tooltip';
            el.style.boxSizing = 'border-box';
            el.style.left = `${p.x - this.state.app.x}px`;
            el.style.top = `${p.y - this.state.app.y}px`;
            el.style.width = `${p.w}px`;
            el.style.height = `${p.h}px`;
            el.textContent = p.text;

            (el.style as any).webkitAppRegion = 'no-drag';
            this.dom.popupsContainer.appendChild(el);
        }
    }

    // --- OS WINDOW MANAGEMENT ---
    private updateOSWindow(minX: number, minY: number, boundingW: number, boundingH: number) {
        const diffW = Math.round(boundingW - window.innerWidth);
        const diffH = Math.round(boundingH - window.innerHeight);
        const targetX = Math.round(minX);
        const targetY = Math.round(minY);

        // Shrink First
        if (diffW < 0 || diffH < 0) {
            window.resizeBy(Math.min(0, diffW), Math.min(0, diffH));
        }

        // Move
        if (window.screenX !== targetX || window.screenY !== targetY) {
            window.moveTo(targetX, targetY);
        }

        // Grow Later
        if (diffW > 0 || diffH > 0) {
            window.resizeBy(Math.max(0, diffW), Math.max(0, diffH));
        }
    }

    // --- MATH & CALCULATIONS ---
    private calculateBoundingBox() {
        let minX, minY, maxX, maxY;

        if (this.useStaticBuffer && !this.isMaximized) {
            const safeBufferX = Math.min(APP_CONFIG.bufferSize, this.state.app.x);
            const safeBufferY = Math.min(APP_CONFIG.bufferSize, this.state.app.y);

            minX = this.state.app.x - safeBufferX;
            minY = this.state.app.y - safeBufferY;
            maxX = this.state.app.x + this.state.app.w;
            maxY = this.state.app.y + this.state.app.h;
        } else {
            minX = this.state.app.x;
            minY = this.state.app.y;
            maxX = this.state.app.x + this.state.app.w;
            maxY = this.state.app.y + this.state.app.h;
        }

        for (const p of this.state.popups) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x + p.w > maxX) maxX = p.x + p.w;
            if (p.y + p.h > maxY) maxY = p.y + p.h;
        }

        if (this.isMaximized) {
            minX = 0; minY = 0;
            maxX = window.screen.availWidth;
            maxY = window.screen.availHeight;
        }

        return { minX, minY, boundingW: maxX - minX, boundingH: maxY - minY };
    }

    private syncAppPosition() {
        const currentOffsetX = parseInt(this.dom.workspace.style.left || '0', 10);
        const currentOffsetY = parseInt(this.dom.workspace.style.top || '0', 10);

        const newAppX = window.screenX + currentOffsetX;
        const newAppY = window.screenY + currentOffsetY;

        const deltaX = newAppX - this.state.app.x;
        const deltaY = newAppY - this.state.app.y;

        this.state.app.x = newAppX;
        this.state.app.y = newAppY;

        for (const p of this.state.popups) {
            p.x += deltaX;
            p.y += deltaY;
        }
    }

    private updatePopupAnchors() {
        for (const p of this.state.popups) {
            switch (p.id) {
                case 'tl-tooltip':
                    p.x = this.state.app.x - 50; p.y = this.state.app.y - 50; break;
                case 'l-tooltip':
                    p.x = this.state.app.x - 50; p.y = this.state.app.y + 50; break;
                case 't-tooltip':
                    p.x = this.state.app.x + 50; p.y = this.state.app.y - 50; break;
                case 'br-tooltip':
                    p.x = this.state.app.x + this.state.app.w - 100; p.y = this.state.app.y + this.state.app.h - 30; break;
            }
        }
    }

    // --- REAL-TIME POLLING ---
    private trackWindowMovement = () => {
        if (window.screenX !== this.lastNativeX || window.screenY !== this.lastNativeY) {
            this.lastNativeX = window.screenX;
            this.lastNativeY = window.screenY;

            this.syncAppPosition();
            this.dom.coordsText.textContent = `${this.state.app.x}, ${this.state.app.y}`;
        }
        requestAnimationFrame(this.trackWindowMovement);
    };

    // --- ACTIONS & HANDLERS ---
    private spawnPopup(id: string, text: string) {
        this.syncAppPosition();
        this.state.popups.push({ id, text, x: 0, y: 0, w: 150, h: 80 }); // x, y will be overwritten by updatePopupAnchors
        this.syncLayout();
    }

    private resetPopups() {
        this.syncAppPosition();
        this.state.popups = [];
        this.syncLayout();
    }

    private toggleMaximize() {
        this.syncAppPosition();
        if (!this.isMaximized) {
            this.preMaximizeState = { ...this.state.app };
            this.isMaximized = true;
            this.dom.btnMaximize.textContent = "🗗";
            this.state.app = { x: 0, y: 0, w: window.screen.availWidth, h: window.screen.availHeight };
        } else {
            this.isMaximized = false;
            this.dom.btnMaximize.textContent = "🗖";
            if (this.preMaximizeState) this.state.app = { ...this.preMaximizeState };
        }
        this.syncLayout();
    }

    private setupCustomResizing() {
        const handleConfigs = [
            { pos: 'right', cursor: 'ew-resize', css: { right: '0px', top: '0px', bottom: '0px', width: '8px' } },
            { pos: 'bottom', cursor: 'ns-resize', css: { left: '0px', right: '0px', bottom: '0px', height: '8px' } },
            { pos: 'bottom-right', cursor: 'nwse-resize', css: { right: '0px', bottom: '0px', width: '12px', height: '12px' } }
        ];

        handleConfigs.forEach(config => {
            const handle = document.createElement('div');
            Object.assign(handle.style, { position: 'absolute', cursor: config.cursor, zIndex: '9999', ...config.css });
            (handle.style as any).webkitAppRegion = 'no-drag';
            this.dom.mainApp.appendChild(handle);

            let isResizing = false;
            let startX = 0, startY = 0, startW = 0, startH = 0;

            const onMouseMove = (e: MouseEvent) => {
                if (!isResizing) return;
                if (config.pos.includes('right')) this.state.app.w = Math.max(APP_CONFIG.minWindowWidth, startW + (e.clientX - startX));
                if (config.pos.includes('bottom')) this.state.app.h = Math.max(APP_CONFIG.minWindowHeight, startH + (e.clientY - startY));
                this.syncLayout();
            };

            const onMouseUp = () => {
                isResizing = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            handle.addEventListener('mousedown', (e) => {
                if (this.isMaximized) return;
                isResizing = true;
                startX = e.clientX; startY = e.clientY;
                startW = this.state.app.w; startH = this.state.app.h;
                e.preventDefault();
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
                e.stopPropagation();
            });
        });
    }

    // --- CHROME OS SPECIFIC ---
    private async applyShapeMask(minX: number, minY: number) {
        const shapeRects: DOMRect[] = [
            new DOMRect(Math.round(this.state.app.x - minX), Math.round(this.state.app.y - minY), Math.round(this.state.app.w), Math.round(this.state.app.h))
        ];

        for (const p of this.state.popups) {
            shapeRects.push(new DOMRect(Math.round(p.x - minX), Math.round(p.y - minY), Math.round(p.w), Math.round(p.h)));
        }

        const shapeStr = JSON.stringify(shapeRects);
        if (this.lastAppliedShape !== shapeStr) {
            this.lastAppliedShape = shapeStr;
            const iwaApi = window.chromeos?.isolatedWebApp;
            if (iwaApi && typeof iwaApi.setShape === 'function') {
                try { await iwaApi.setShape(shapeRects); } catch (e) { console.error("setShape error:", e); }
            }
        }
    }

    private clearShapeMask() {
        const iwaApi = window.chromeos?.isolatedWebApp;
        if (iwaApi && typeof iwaApi.setShape === 'function') {
            try { iwaApi.setShape([]); } catch (e) { console.error("setShape error:", e); }
        }
    }

    // --- PERMISSIONS ---
    private async checkAndRequestWindowManagement(): Promise<boolean> {
        try {
            const permission = await navigator.permissions.query({ name: 'window-management' as any });
            if (permission.state === 'granted') {
                return true;
            }
            if (permission.state === 'denied') {
                alert("Window Management permission is denied. Please enable it.");
                return false;
            }

            return await new Promise((resolve) => {
                const overlay = document.createElement('div');
                Object.assign(overlay.style, {
                    position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
                    backgroundColor: 'rgba(15, 23, 42, 0.95)', color: 'white', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexDirection: 'column', zIndex: '10000', fontFamily: 'sans-serif'
                });

                const message = document.createElement('p');
                message.textContent = "This app requires Window Management permissions.";
                message.style.marginBottom = "20px";

                const btn = document.createElement('button');
                btn.textContent = "Grant Permission";
                Object.assign(btn.style, { padding: "12px 24px", fontSize: "16px", cursor: "pointer" });

                btn.onclick = async () => {
                    try {
                        await (window as any).getScreenDetails();
                        document.body.removeChild(overlay);
                        resolve(true);
                    } catch (e) {
                        btn.textContent = "Permission Denied";
                        btn.disabled = true;
                        resolve(false);
                    }
                };

                overlay.append(message, btn);
                document.body.appendChild(overlay);
            });
        } catch { return true; } // Fallback if API completely unsupported
    }
}

// --- BOOT THE APP ---
window.onload = () => {
    const app = new WindowManager({
        app: { x: 50, y: 100, w: 400, h: 500 },
        popups: []
    });
    app.boot();
};