import { Observable } from "rxjs";

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
    encryptedSecret?: string;
    iv?: string;
    salt?: string;
}

export interface IAccount2FAProvider {
    getAccounts(): Promise<Observable<Account2FA[]>>;
    addAccount(account: Account2FA): Promise<string>;
    clearCache?(): Promise<void>;
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
    encryptedSecret?: string;
    iv?: string;
    salt?: string;
    constructor(id: string, label: string, secret: string, tokenLength?: number, interval?: number, algorithm?: string, issuer?:string, active?: boolean, logo?: string, encryptedSecret?: string, iv?: string, salt?: string) {
        this.id = id;
        this.label = label;
        this.secret = secret;
        this.tokenLength = tokenLength || 6;
        this.interval = interval || 30;
        this.algorithm = algorithm || 'SHA1';
        this.issuer = issuer;
        this.active = active;
        this.logo = logo;
        this.encryptedSecret = encryptedSecret;
        this.iv = iv;
        this.salt = salt;
    }

    static fromDictionary(data: IAccount2FA): Account2FA {
        return new Account2FA(data.id, data.label, data.secret, data.tokenLength, data.interval, data.algorithm, data.issuer, data.active, data.logo, data.encryptedSecret, data.iv, data.salt);
    }

    static fromOTPAuthURL(url: string): Account2FA {
        //otpauth://totp/ACME%20Co:john.doe@email.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=ACME%20Co&algorithm=SHA1&digits=6&period=30
        const urlObj = new URL(url);
        
        if(!urlObj.protocol.startsWith('otpauth:')) {
            throw new Error('Invalid OTPAuth URL');
        }
        
        const params = new URLSearchParams(urlObj.search)
        const pathComponents = url.replace('otpauth://', '')
            .split('/')
            .filter(e=>!!e)
            .map(e=>e.replace(/\?.*/, ''))
            .map(decodeURIComponent)
        
        const type = pathComponents[0];
        console.log({url})
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
        return this.logo || 'assets/icon/128.png';
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