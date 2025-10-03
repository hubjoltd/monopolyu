import { useEffect } from "react";

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 2500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-primary z-50 flex items-center justify-center">
      <div className="text-center space-y-6 fade-in">
        <div className="relative">
          <div className="text-8xl text-primary-foreground bounce-subtle">
            ✈️
          </div>
          <div className="absolute -top-2 -right-2">
            <div className="text-3xl text-accent animate-pulse">
              📊
            </div>
          </div>
        </div>
        <h1 className="text-5xl font-bold text-primary-foreground tracking-tight">FormFlow</h1>
        <p className="text-primary-foreground/80 text-lg">Google Forms Auto Submitter</p>
        <div className="flex items-center justify-center gap-2 mt-8">
          <div className="w-2 h-2 bg-primary-foreground rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
          <div className="w-2 h-2 bg-primary-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-primary-foreground rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    </div>
  );
}
