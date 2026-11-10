import { Toaster } from "sonner";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import "@/styles/primitives.css";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppShell } from "./components/shell/AppShell";
import { ThemeProvider } from "./contexts/ThemeContext";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <TooltipProvider>
          <Toaster />
          <AppShell />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
