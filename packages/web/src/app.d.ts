// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
    namespace App {
        // interface Error {}
        // interface Locals {}
        // interface PageData {}
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
