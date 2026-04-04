'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SignInForm } from '@/components/auth/sign-in-form'
import { SignUpForm } from '@/components/auth/sign-up-form'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

function AuthPageContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const errorParam = searchParams.get('error')

  const initialTab = tabParam === 'signup' ? 'signup' : 'signin'
  const [activeTab, setActiveTab] = useState<string>(initialTab)
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  const handleTabChange = (value: string | number) => {
    setActiveTab(String(value))
    setShowForgotPassword(false)
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">PortfolioForge</h1>
        </div>

        {errorParam && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorParam}
          </div>
        )}

        <Card>
          <CardContent className="pt-2 pb-4">
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <CardHeader className="px-0 pb-4">
                <TabsList className="w-full">
                  <TabsTrigger value="signin" className="flex-1">
                    Sign In
                  </TabsTrigger>
                  <TabsTrigger value="signup" className="flex-1">
                    Sign Up
                  </TabsTrigger>
                </TabsList>
              </CardHeader>

              <TabsContent value="signin">
                {showForgotPassword ? (
                  <div className="flex flex-col gap-3">
                    <CardTitle className="text-base">Reset Password</CardTitle>
                    <ForgotPasswordForm
                      onBackToSignIn={() => setShowForgotPassword(false)}
                    />
                  </div>
                ) : (
                  <SignInForm
                    onForgotPassword={() => setShowForgotPassword(true)}
                  />
                )}
              </TabsContent>

              <TabsContent value="signup">
                <SignUpForm />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 flex-col items-center justify-center min-h-screen">
          <div className="text-muted-foreground text-sm">Loading...</div>
        </main>
      }
    >
      <AuthPageContent />
    </Suspense>
  )
}
