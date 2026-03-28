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

    getElementRect: function (elementId) {
        const element = document.getElementById(elementId);
        if (!element) {
            return { left: 0, top: 0, width: 0, height: 0 };
        }

        const rect = element.getBoundingClientRect();
        return {
            left: Number.isFinite(rect.left) ? rect.left : 0,
            top: Number.isFinite(rect.top) ? rect.top : 0,
            width: Number.isFinite(rect.width) ? rect.width : 0,
            height: Number.isFinite(rect.height) ? rect.height : 0
        };
    },

    focusElementById: function (elementId) {
        const element = document.getElementById(elementId);
        if (!element || typeof element.focus !== 'function') {
            return;
        }

        element.focus();
        if (typeof element.select === 'function') {
            element.select();
        }
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

    copyTextToClipboard: async function (text) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    },

    getLocalStorageValue: function (key) {
        try {
            return window.localStorage.getItem(key);
        } catch {
            return null;
        }
    },

    setLocalStorageValue: function (key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch {
            // Ignore storage write failures.
        }
    },

    _presenceLifecycle: {},

    registerPresenceLifecycle: function (boardId, clientId) {
        if (!boardId || !clientId) {
            return;
        }

        const lifecycleKey = `${boardId}:${clientId}`;
        const existing = window.orimWhiteboard._presenceLifecycle[lifecycleKey];
        if (existing) {
            return;
        }

        const sendLeave = function () {
            const payload = JSON.stringify({ boardId, clientId });

            try {
                if (navigator.sendBeacon) {
                    const blob = new Blob([payload], { type: 'application/json' });
                    navigator.sendBeacon('/api/presence/leave', blob);
                    return;
                }
            } catch {
                // Fall through to fetch keepalive.
            }

            try {
                fetch('/api/presence/leave', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    keepalive: true
                });
            } catch {
                // Ignore unload transport failures.
            }
        };

        const onPageHide = function () {
            sendLeave();
        };

        const onBeforeUnload = function () {
            sendLeave();
        };

        window.addEventListener('pagehide', onPageHide);
        window.addEventListener('beforeunload', onBeforeUnload);

        window.orimWhiteboard._presenceLifecycle[lifecycleKey] = {
            onPageHide,
            onBeforeUnload
        };
    },

    unregisterPresenceLifecycle: function (boardId, clientId) {
        const lifecycleKey = `${boardId}:${clientId}`;
        const lifecycle = window.orimWhiteboard._presenceLifecycle[lifecycleKey];
        if (!lifecycle) {
            return;
        }

        window.removeEventListener('pagehide', lifecycle.onPageHide);
        window.removeEventListener('beforeunload', lifecycle.onBeforeUnload);
        delete window.orimWhiteboard._presenceLifecycle[lifecycleKey];
    },

    _touchState: null,

    _getTouchGestureInfo: function (touches) {
        if (!touches || touches.length < 2) {
            return null;
        }

        const first = touches[0];
        const second = touches[1];
        const centerX = (first.clientX + second.clientX) / 2;
        const centerY = (first.clientY + second.clientY) / 2;
        const dx = second.clientX - first.clientX;
        const dy = second.clientY - first.clientY;

        return {
            centerX,
            centerY,
            distance: Math.hypot(dx, dy)
        };
    },

    registerTouchHandler: function (elementId, dotNetRef) {
        const el = document.getElementById(elementId);
        if (!el) return;

        const existing = window.orimWhiteboard._touchState;
        if (existing?.element && existing.handlers) {
            existing.element.removeEventListener('touchstart', existing.handlers.onTouchStart);
            existing.element.removeEventListener('touchmove', existing.handlers.onTouchMove);
            existing.element.removeEventListener('touchend', existing.handlers.onTouchEnd);
            existing.element.removeEventListener('touchcancel', existing.handlers.onTouchCancel);
            window.removeEventListener('mouseup', existing.handlers.onMouseUp, true);
        }

        const state = {
            dotNetRef,
            element: el,
            activeTouchId: null,
            gestureActive: false,
            handlers: null
        };
        window.orimWhiteboard._touchState = state;

        const onTouchStart = function (e) {
            if (e.touches.length === 2) {
                e.preventDefault();
                state.activeTouchId = null;
                state.gestureActive = true;
                const gesture = window.orimWhiteboard._getTouchGestureInfo(e.touches);
                if (gesture) {
                    dotNetRef.invokeMethodAsync('OnTouchGestureStartFromJs', gesture.centerX, gesture.centerY, gesture.distance);
                }
                return;
            }

            if (state.gestureActive || e.touches.length !== 1) {
                return;
            }

            e.preventDefault();
            const touch = e.touches[0];
            state.activeTouchId = touch.identifier;
            dotNetRef.invokeMethodAsync('OnTouchStartFromJs', touch.clientX, touch.clientY);
        };

        const onTouchMove = function (e) {
            if (state.gestureActive || e.touches.length === 2) {
                e.preventDefault();
                state.gestureActive = true;
                const gesture = window.orimWhiteboard._getTouchGestureInfo(e.touches);
                if (gesture) {
                    dotNetRef.invokeMethodAsync('OnTouchGestureChangeFromJs', gesture.centerX, gesture.centerY, gesture.distance);
                }
                return;
            }

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
        };

        const endGestureIfNeeded = function (remainingTouches) {
            if (!state.gestureActive) {
                return false;
            }

            if (remainingTouches.length >= 2) {
                return true;
            }

            state.gestureActive = false;
            dotNetRef.invokeMethodAsync('OnTouchGestureEndFromJs');

            if (remainingTouches.length === 1) {
                const touch = remainingTouches[0];
                state.activeTouchId = touch.identifier;
                dotNetRef.invokeMethodAsync('OnTouchStartFromJs', touch.clientX, touch.clientY);
            }

            return true;
        };

        const onTouchEnd = function (e) {
            if (endGestureIfNeeded(e.touches)) {
                return;
            }

            if (state.activeTouchId === null) return;
            e.preventDefault();
            state.activeTouchId = null;
            dotNetRef.invokeMethodAsync('OnTouchEndFromJs');
        };

        const onTouchCancel = function (e) {
            if (endGestureIfNeeded(e.touches || [])) {
                return;
            }

            if (state.activeTouchId === null) return;
            state.activeTouchId = null;
            dotNetRef.invokeMethodAsync('OnTouchEndFromJs');
        };

        const onMouseUp = function (e) {
            dotNetRef.invokeMethodAsync('OnGlobalMouseUpFromJs', e.clientX, e.clientY);
        };

        state.handlers = {
            onTouchStart,
            onTouchMove,
            onTouchEnd,
            onTouchCancel,
            onMouseUp
        };

        el.addEventListener('touchstart', onTouchStart, { passive: false });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd, { passive: false });
        el.addEventListener('touchcancel', onTouchCancel, { passive: false });
        window.addEventListener('mouseup', onMouseUp, true);
    },

    disposeTouchHandler: function () {
        const state = window.orimWhiteboard._touchState;
        if (state?.element && state.handlers) {
            state.element.removeEventListener('touchstart', state.handlers.onTouchStart);
            state.element.removeEventListener('touchmove', state.handlers.onTouchMove);
            state.element.removeEventListener('touchend', state.handlers.onTouchEnd);
            state.element.removeEventListener('touchcancel', state.handlers.onTouchCancel);
            window.removeEventListener('mouseup', state.handlers.onMouseUp, true);
        }

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
