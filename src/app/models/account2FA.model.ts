export interface IAccount2FA {
    id: string;
    label: string;
    secret: string;
    tokenLength: number;
    interval: number;
    algorithm: string;
    issuer?: string;
    active?: boolean;
    logo?: string;
    added?: any;
}
export class Account2FA implements IAccount2FA {
    id: string;
    label: string;
    secret: string;
    tokenLength: number;
    interval: number;
    algorithm: string;
    issuer?: string;
    active?: boolean;
    logo?: string;
    added?: any;
    constructor(id: string, label: string, secret: string, tokenLength?: number, interval?: number, algorithm?: string, issuer?:string, active?: boolean, logo?: string) {
        this.id = id;
        this.label = label;
        this.secret = secret;
        this.tokenLength = tokenLength || 6;
        this.interval = interval || 30;
        this.algorithm = algorithm || 'SHA1';
        this.issuer = issuer;
        this.active = active;
        this.logo = logo;
    }

    static fromDictionary(data: IAccount2FA): Account2FA {
        return new Account2FA(data.id, data.label, data.secret, data.tokenLength, data.interval, data.algorithm, data.issuer, data.active, data.logo);
    }

    static fromOTPAuthURL(url: string): Account2FA {
        const urlObj = new URL(url);
        const params = new URLSearchParams(urlObj.search);
        //otpauth://totp/ACME%20Co:john.doe@email.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=ACME%20Co&algorithm=SHA1&digits=6&period=30

        const pathComponents = urlObj.pathname.split('/').filter(e=>!!e).map(decodeURIComponent);
        const type = pathComponents[0];
        
        if (type !== 'totp') {
            throw new Error('Only TOTP is supported');
        }

        const label = pathComponents[1];
        if(!label) {
            throw new Error('Missing required fields');
        }

        const secret = params.get('secret')?.toUpperCase();
        if(!secret) {
            throw new Error('Missing secret key');
        }

        const issuer = params.get('issuer') ?? undefined;
        const algorithm = params.get('algorithm') ?? 'SHA1';
        const tokenLength = params.get('digits') ? parseInt(params.get('digits')!) : undefined;
        const interval = params.get('period') ? parseInt(params.get('period')!) : undefined;

        return new Account2FA('', label, secret, tokenLength, interval, algorithm, issuer);
    }

    getLogo(): string {
        return this.logo || '../assets/icon/favicon.png';
    }

    getNextRollingTimeLeft(): number {
        return this.interval - (Math.floor(Date.now() / 1000) % this.interval);
    }

    typeErased(): Object {
        const typeErasedObject = Object.assign({}, this);
        for (const key in typeErasedObject) {
            if (!typeErasedObject[key]) {
                delete typeErasedObject[key];
            }
        }
        return typeErasedObject
    }
}