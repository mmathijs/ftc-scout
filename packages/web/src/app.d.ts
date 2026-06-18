// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
    namespace App {
        // interface Error {}
        interface Locals {
            geo?: {
                country: string;
                timezone: string;
                region: string;
                region_name: string;
                city: string;
                latitude: number | null;
                longitude: number | null;
            };
        }
        interface PageData {
            geo?: {
                country: string;
                timezone: string;
                region: string;
                city: string;
                latitude: number | null;
                longitude: number | null;
            };
        }
        // interface Platform {}
    }
    interface Window {
        plausible?: (
            event: string,
            options?: {
                props?: Record<string, string>;
                callback?: () => void;
            }
        ) => void;
    }
}

export {};
