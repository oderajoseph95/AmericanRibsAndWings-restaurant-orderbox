import { createContext, useContext, useState, ReactNode } from "react";

interface SalesPopContextType {
  isCheckoutOpen: boolean;
  setIsCheckoutOpen: (open: boolean) => void;
}

const SalesPopContext = createContext<SalesPopContextType | undefined>(undefined);

export function SalesPopContextProvider({ children }: { children: ReactNode }) {
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  return (
    <SalesPopContext.Provider value={{ isCheckoutOpen, setIsCheckoutOpen }}>
      {children}
    </SalesPopContext.Provider>
  );
}

export function useSalesPopContext() {
  const context = useContext(SalesPopContext);
  if (!context) {
    throw new Error("useSalesPopContext must be used within SalesPopContextProvider");
  }
  return context;
}
