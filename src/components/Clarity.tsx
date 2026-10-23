import { useEffect } from 'react';

type ClarityFunction = {
  (...args: unknown[]): void;
  q?: unknown[][];
};

declare global {
  interface Window {
    clarity?: ClarityFunction;
  }
}

const projectId = 'z28dwmlrbn';

export function Clarity() {
  useEffect(() => {
    if (import.meta.env.DEV || document.getElementById('clarity-script'))
      return;

    window.clarity =
      window.clarity ||
      function (...args: unknown[]) {
        (window.clarity!.q ||= []).push(args);
      };

    const script = document.createElement('script');
    script.id = 'clarity-script';
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${projectId}`;
    document.head.appendChild(script);
  }, []);

  return null;
}
