window.orimLanguage = {
    _cookieName: '.AspNetCore.Culture',
    get() {
        try {
            return window.localStorage.getItem('orim-language') || '';
        } catch {
            return '';
        }
    },
    set(lang) {
        try {
            window.localStorage.setItem('orim-language', lang);
        } catch {}
        this._syncCookie(lang);
    },
    _syncCookie(lang) {
        if (!lang) return;
        var value = encodeURIComponent('c=' + lang + '|uic=' + lang);
        document.cookie = this._cookieName + '=' + value + ';path=/;max-age=31536000;samesite=lax';
    }
};

window.orimTheme = {
    _appliedCssKeys: [],
    get() {
        try {
            return window.localStorage.getItem("orim-theme") || "light";
        } catch {
            return "light";
        }
    },
    set(theme, cssVariables, isDarkMode) {
        try {
            window.localStorage.setItem("orim-theme", theme || "light");
        } catch {
        }

        this.apply(theme, cssVariables, isDarkMode);
    },
    apply(theme, cssVariables, isDarkMode) {
        const activeTheme = theme || "light";
        const root = document.documentElement;

        root.setAttribute("data-orim-theme", activeTheme);
        root.setAttribute("data-orim-dark", isDarkMode ? "true" : "false");

        for (const key of this._appliedCssKeys) {
            root.style.removeProperty(key);
        }

        this._appliedCssKeys = [];
        if (cssVariables && typeof cssVariables === "object") {
            for (const [key, value] of Object.entries(cssVariables)) {
                if (!key || value === undefined || value === null) {
                    continue;
                }

                root.style.setProperty(key, value);
                this._appliedCssKeys.push(key);
            }
        }

        if (document.body) {
            document.body.setAttribute("data-orim-theme", activeTheme);
            document.body.setAttribute("data-orim-dark", isDarkMode ? "true" : "false");
        }
    }
};