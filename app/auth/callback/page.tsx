'use client';

import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().finally(() => {
      if (active) {
        window.location.replace('/');
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f7f5] p-8 text-[#171717]">
      <p className="mx-auto max-w-md text-sm text-[#6b6b68]">
        Validando tu sesión…
      </p>
    </main>
  );
}
