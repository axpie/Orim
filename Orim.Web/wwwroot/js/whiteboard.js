window.orimWhiteboard = {

    clientToElement: function (elementId, clientX, clientY) {
        const element = document.getElementById(elementId);
        if (!element) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        const rect = element.getBoundingClientRect();
        const x = Number.isFinite(clientX - rect.left) ? clientX - rect.left : 0;
        const y = Number.isFinite(clientY - rect.top) ? clientY - rect.top : 0;
        const width = Number.isFinite(rect.width) ? rect.width : 0;
        const height = Number.isFinite(rect.height) ? rect.height : 0;

        return {
            x,
            y,
            width,
            height
        };
    },

    getElementSize: function (elementId) {
        const element = document.getElementById(elementId);
        if (!element) {
            return { width: 0, height: 0 };
        }

        const rect = element.getBoundingClientRect();
        return {
            width: Number.isFinite(rect.width) ? rect.width : 0,
            height: Number.isFinite(rect.height) ? rect.height : 0
        };
    },

    scrollElementToBottom: function (element) {
        if (!element) {
            return;
        }

        element.scrollTop = element.scrollHeight;
    },

    pickScreenColor: async function () {
        if (typeof window.EyeDropper !== 'function') {
            return { supported: false, canceled: false, color: null };
        }

        try {
            const eyeDropper = new window.EyeDropper();
            const result = await eyeDropper.open();
            return {
                supported: true,
                canceled: false,
                color: result?.sRGBHex || null
            };
        } catch (error) {
            if (error?.name === 'AbortError') {
                return { supported: true, canceled: true, color: null };
            }

            throw error;
        }
    },

    downloadFile: function (filename, contentType, base64) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    _touchState: null,

    registerTouchHandler: function (elementId, dotNetRef) {
        const el = document.getElementById(elementId);
        if (!el) return;

        const state = { dotNetRef, activeTouchId: null };
        window.orimWhiteboard._touchState = state;

        el.addEventListener('touchstart', function (e) {
            if (e.touches.length !== 1) return;
            e.preventDefault();
            const touch = e.touches[0];
            state.activeTouchId = touch.identifier;
            dotNetRef.invokeMethodAsync('OnTouchStartFromJs', touch.clientX, touch.clientY);
        }, { passive: false });

        el.addEventListener('touchmove', function (e) {
            if (state.activeTouchId === null) return;
            e.preventDefault();
            let touch = null;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === state.activeTouchId) {
                    touch = e.touches[i];
                    break;
                }
            }
            if (!touch) return;
            dotNetRef.invokeMethodAsync('OnTouchMoveFromJs', touch.clientX, touch.clientY);
        }, { passive: false });

        el.addEventListener('touchend', function (e) {
            if (state.activeTouchId === null) return;
            e.preventDefault();
            state.activeTouchId = null;
            dotNetRef.invokeMethodAsync('OnTouchEndFromJs');
        }, { passive: false });

        el.addEventListener('touchcancel', function (e) {
            if (state.activeTouchId === null) return;
            state.activeTouchId = null;
            dotNetRef.invokeMethodAsync('OnTouchEndFromJs');
        }, { passive: false });
    },

    disposeTouchHandler: function () {
        window.orimWhiteboard._touchState = null;
    },

    getWindowWidth: function () {
        return window.innerWidth;
    },

    getViewportProfile: function () {
        const viewportWidth = window.visualViewport?.width ?? window.innerWidth ?? document.documentElement?.clientWidth ?? 0;
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight ?? document.documentElement?.clientHeight ?? 0;
        const maxTouchPoints = navigator.maxTouchPoints || 0;
        const platform = navigator.platform || '';
        const userAgent = navigator.userAgent || '';
        const isAppleTouchDevice = /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
        const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches === true;
        const hasTouch = 'ontouchstart' in window || maxTouchPoints > 0;
        const isCompact = viewportWidth <= 768 || isAppleTouchDevice || (hasTouch && hasCoarsePointer);

        return {
            width: viewportWidth,
            height: viewportHeight,
            isCompact: isCompact
        };
    }
};
