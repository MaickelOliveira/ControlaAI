export const THEME_STORAGE_KEY = "zelo-theme";
export type AppTheme = "light" | "dark";
// A fixed script runs before hydration; it never contains user data.
export const themeInitScript = `(()=>{let theme='light';try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='dark')theme='dark'}catch{}document.documentElement.dataset.theme=theme})()`;
