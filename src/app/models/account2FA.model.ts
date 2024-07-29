export class Account2FA {
    id: string;
    serviceName: string;
    accountName: string;
    secret: string;
    tokenLength: number;
    interval: number;
    active?: boolean;
    logo?: string;

    constructor(id: string, serviceName: string, accountName: string, secret: string, tokenLength?: number, interval?: number, active?: boolean, logo?: string) {
        this.id = id;
        this.serviceName = serviceName;
        this.accountName = accountName;
        this.secret = secret;
        this.tokenLength = tokenLength || 6;
        this.interval = interval || 30;
        this.active = active;
        this.logo = logo;
    }

    static fromDictionary(data: any): Account2FA {
        return new Account2FA(data.id, data.serviceName, data.accountName, data.secret, data.tokenLength, data.interval, data.active, data.logo);
    }

    static fromOTPAuthURL(url: string): Account2FA {
        const urlObj = new URL(url);
        const params = new URLSearchParams(urlObj.search);
        //otpauth://totp/ACME%20Co:john.doe@email.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=ACME%20Co&algorithm=SHA1&digits=6&period=30

        const pathComponents = urlObj.pathname.split('/').filter(e=>!!e);
        const type = pathComponents[0];
        
        if (type !== 'totp') {
            throw new Error('Only TOTP is supported');
        }

        const label = pathComponents[1];
        const serviceName = label.split(':')[0];
        const accountName = label.split(':')[1].replace('%20', ' ');
        if(!serviceName || !accountName) {
            throw new Error('Missing required fields');
        }

        const secret = params.get('secret');
        if(!secret) {
            throw new Error('Missing secret key');
        }

        const tokenLength = params.get('digits') ? parseInt(params.get('digits')!) : undefined;
        const interval = params.get('period') ? parseInt(params.get('period')!) : undefined;

        return new Account2FA('', serviceName, accountName, secret, tokenLength, interval);
    }

    getLogo(): string {
        return this.logo || '../assets/icon/favicon.png';
    }

    getNextRollingTimeLeft(): number {
        return (this.interval || 30) - (Math.floor(Date.now() / 1000) % (this.interval || 30));
    }

    typeErased(): Object {
        return Object.assign({}, this);
    }
}