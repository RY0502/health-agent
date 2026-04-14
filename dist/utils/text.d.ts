export declare const normalizeWhitespace: (value: string) => string;
export declare const tokenize: (value: string) => string[];
export declare const unique: <T>(items: T[]) => T[];
export declare const sentenceWindow: (text: string, needle: string, radius?: number) => string;
export declare const overlapScore: (a: string | string[], b: string | string[]) => number;
export declare const clamp: (value: number, min?: number, max?: number) => number;
export declare const toTitleCase: (value: string) => string;
export declare const shortText: (value: string, max?: number) => string;
