export class GlobalUtils {
    static isMobile() {
        return window.innerWidth <= 768;
    }

    static hideSplashScreen(): Promise<void> {
        return new Promise((resolve, _) => {
            setTimeout(() => {
                let splash = document.getElementById('splash-container')
                if (splash != null) {
                    splash.style.opacity = '0'
                    setTimeout(() => {
                        splash?.remove()
                        resolve()
                    }, 250);
                } else {
                    resolve()
                }
            }, 500);
        });
    }
}
