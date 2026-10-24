"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

const MotionContext = createContext({
  running: false,
  reduced: false,
  toggle: () => {},
});

export function PresentationMotion({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(preference.matches);
      setReady(true);
    };
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  return (
    <MotionContext.Provider
      value={{
        running: ready && !paused && !reduced,
        reduced,
        toggle: () => setPaused((value) => !value),
      }}
    >
      {children}
    </MotionContext.Provider>
  );
}

export const usePresentationMotion = () => useContext(MotionContext);

export function useVisible(ref: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "100px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return visible;
}
