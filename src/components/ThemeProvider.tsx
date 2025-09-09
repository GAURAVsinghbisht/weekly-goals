import { ReactNode } from 'react';
import { ThemeContext, useThemeLogic } from '../lib/theme';

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const themeLogic = useThemeLogic();

  return (
    <ThemeContext.Provider value={themeLogic}>
      {children}
    </ThemeContext.Provider>
  );
};