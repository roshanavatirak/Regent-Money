import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

const computeMonthStart = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1, 0, 0, 0, 0).getTime();
};

export function useMonthStart(): number {
  const [monthStart, setMonthStart] = useState(computeMonthStart);

  useEffect(() => {
    const check = () => {
      setMonthStart((prev) => {
        const next = computeMonthStart();
        return next === prev ? prev : next;
      });
    };

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        check();
      }
    });

    const intervalId = setInterval(check, 60_000); // 1 minute ticker to cover midnight transition

    return () => {
      sub.remove();
      clearInterval(intervalId);
    };
  }, []);

  return monthStart;
}

