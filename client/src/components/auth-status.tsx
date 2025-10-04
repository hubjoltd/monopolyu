import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LogIn, LogOut, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface AuthStatus {
  isAuthenticated: boolean;
  email?: string;
  lastLogin?: string;
}

export default function AuthStatus() {
  const { toast } = useToast();

  const { data: authStatus, isLoading } = useQuery<AuthStatus>({
    queryKey: ['/api/auth/status'],
    refetchInterval: 30000, // Check every 30 seconds
  });

  const loginMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/login");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Logged in successfully",
          description: data.email ? `Logged in as ${data.email}` : "You can now access private forms",
        });
        queryClient.invalidateQueries({ queryKey: ['/api/auth/status'] });
      } else {
        toast({
          title: "Login failed",
          description: data.message || "Please try again",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error.message || "An error occurred during login",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogin = () => {
    toast({
      title: "Opening browser window",
      description: "Please complete the Google sign-in in the browser window that will open. This may take a moment...",
    });
    loginMutation.mutate();
  };

  if (isLoading) {
    return (
      <Card className="slide-up" style={{ animationDelay: '0.4s' }}>
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <h3 className="text-sm font-semibold">Checking authentication...</h3>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="slide-up" style={{ animationDelay: '0.4s' }}>
      <CardHeader className="border-b bg-muted/30">
        <div className="flex items-center gap-3">
          {authStatus?.isAuthenticated ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <XCircle className="h-5 w-5 text-yellow-500" />
          )}
          <div className="flex-1">
            <h3 className="text-sm font-semibold">Google Authentication</h3>
            <p className="text-xs text-muted-foreground">
              {authStatus?.isAuthenticated ? "Authenticated" : "Required for private forms"}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {authStatus?.isAuthenticated ? (
          <div className="space-y-3">
            {authStatus.email && (
              <div className="text-sm">
                <span className="text-muted-foreground">Signed in as:</span>
                <p className="font-medium mt-1">{authStatus.email}</p>
              </div>
            )}
            <Button
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              variant="outline"
              size="sm"
              className="w-full"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {logoutMutation.isPending ? "Logging out..." : "Logout"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Sign in with Google to access private forms. This is a one-time setup.
            </p>
            <Button
              onClick={handleLogin}
              disabled={loginMutation.isPending}
              className="w-full"
              data-testid="button-login"
            >
              <LogIn className="h-4 w-4 mr-2" />
              {loginMutation.isPending ? "Opening browser..." : "Sign in with Google"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
