window.orimTheme = {
    get() {
        try {
            return window.localStorage.getItem("orim-theme") || "light";
        } catch {
            return "light";
        }
    },
    set(theme) {
        try {
            window.localStorage.setItem("orim-theme", theme || "light");
        } catch {
        }

        this.apply(theme);
    },
    apply(theme) {
        const activeTheme = theme || "light";
        document.documentElement.setAttribute("data-orim-theme", activeTheme);

        if (document.body) {
            document.body.setAttribute("data-orim-theme", activeTheme);
        }
    }
};