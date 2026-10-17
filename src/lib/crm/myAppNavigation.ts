/** Shell-owned navigation; preview events can dismiss it, never select an Admin route. */
export const MY_APP_NAVIGATION = Symbol('my-app-navigation');
export type MyAppNavigation = { dismiss: () => void };
