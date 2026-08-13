/**
 * 테마 상수. "use client" 모듈에 두면 서버 컴포넌트에서 import 할 때
 * 값이 아니라 클라이언트 참조 프록시가 넘어오므로 반드시 여기(서버/클라 공용)에 둔다.
 */
export const THEME_STORAGE_KEY = "automake-theme";

/** 첫 페인트 전에 테마를 적용해 깜빡임(FOUC)을 막는다. 기본은 라이트. */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)})==="dark")document.documentElement.classList.add("dark")}catch(e){}`;
