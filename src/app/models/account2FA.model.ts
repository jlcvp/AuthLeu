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