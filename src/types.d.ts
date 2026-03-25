interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface Popup extends Rect {
    id: string;
    text: string;
}

interface AppState {
    app: Rect;
    popups: Popup[];
}
