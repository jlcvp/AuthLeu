export class GlobalUtils {
    static isMobile() {
        return window.innerWidth <= 768;
    }

    static hideSplashScreen(): Promise<void> {
        return new Promise((resolve) => {
            const splash = document.getElementById('splash-container')
            if (splash != null) {
                splash.style.opacity = '0'
                setTimeout(() => {
                    splash?.remove()
                    resolve()
                }, 250);
            } else {
                resolve()
            }
        });
    }

    static updateSplashScreenMessage(message: string) {
        const splashMessage = document.getElementById('splash-message')
        if (splashMessage != null) {
            splashMessage.innerHTML = message
        }
    }
}
