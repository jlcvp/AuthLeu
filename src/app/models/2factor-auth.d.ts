declare module '2factor-auth'{
    export function generateCode(key: string, counter: number, opts?: { length?: number }): string;
}