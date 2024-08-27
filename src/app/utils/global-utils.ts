export class GlobalUtils {
    static isMobile() {
        return window.innerWidth <= 768;
    }

    static track: any

    static async accessFlashlight() {
        //Test browser support
        if (!('mediaDevices' in window.navigator)) {
            console.log("Media Devices not available. Use HTTPS!");
            return;
        };

        //Get the environment camera (usually the second one)
        const devices = await window.navigator.mediaDevices.enumerateDevices()

        const cameras = devices.filter((device) => device.kind === 'videoinput');
        if (cameras.length === 0) {
            console.log("No camera found. If your device has camera available, check permissions.");
            return;
        };

        const camera = cameras[cameras.length - 1];

        const stream = await window.navigator.mediaDevices.getUserMedia({
            video: { deviceId: camera.deviceId }
        })

        const track = stream.getVideoTracks().find(track => track.readyState === 'live');
        if (!track) {
            console.log("No Active track found.");
            return;
        }

        this.track = track;

        if (!(this.track.getCapabilities().torch)) {
            console.log("No torch available.");
        }

    }

    static async getFlashlightStatus() {
        await this.accessFlashlight();
        if (!this.track) {
            console.log("Flashlight not accessed.");
            return;
        }
        const settings = this.track.getSettings();
        return settings.torch;
    }

    static async setFlashlightStatus(status: boolean) {
        await this.accessFlashlight();
        if (!this.track) {
            console.log("Flashlight not accessed.");
            return;
        }
        this.track.applyConstraints({
            advanced: [{
                torch: status
            }]
        });
    }
}

/**
 * class flashlightHandler {

    static track; //the video track which is used to turn on/off the flashlight

    static accessFlashlight() {
        //Test browser support
        if (!('mediaDevices' in window.navigator)) {
            alert("Media Devices not available. Use HTTPS!");
            return;
        };

        //Get the environment camera (usually the second one)
        window.navigator.mediaDevices.enumerateDevices().then((devices) => {

            const cameras = devices.filter((device) => device.kind === 'videoinput');
            if (cameras.length === 0) {
                alert("No camera found. If your device has camera available, check permissions.");
                return;
            };
            
            const camera = cameras[cameras.length - 1];
            
            window.navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: camera.deviceId
                }
            }).then((stream) => {
                this.track = stream.getVideoTracks()[0];
                
                if (!(this.track.getCapabilities().torch)) {
                    alert("No torch available.");
                }; 
            });
        });
    }

    static setFlashlightStatus(status) {
        this.track.applyConstraints({
            advanced: [{
                torch: status
            }]
        });
    }
}
 */