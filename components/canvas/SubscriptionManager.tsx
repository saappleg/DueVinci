'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SubscriptionManagerProps {
  supabase: SupabaseClient;
  userId: string;
  onStatusChange?: (status: string) => void;
}

export interface ProfileSubscription {
  subscription_status: 'inactive' | 'trialing' | 'active' | 'paused' | 'canceled' | string;
  trial_end: string | null;
}

export const SubscriptionManager: React.FC<SubscriptionManagerProps> = ({
  supabase,
  userId,
  onStatusChange
}) => {
  const [profile, setProfile] = useState<ProfileSubscription | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Matches schema: public.profiles with user_id as primary key
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('subscription_status, trial_end')
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const profileData: ProfileSubscription = data || {
        subscription_status: 'inactive',
        trial_end: null
      };

      setProfile(profileData);
      if (onStatusChange) {
        onStatusChange(profileData.subscription_status);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load subscription details.');
    } finally {
      setLoading(false);
    }
  }, [supabase, userId, onStatusChange]);

  useEffect(() => {
    if (userId) {
      fetchProfile();
    }
  }, [userId, fetchProfile]);

  const handleStartTrial = async () => {
    try {
      setActionLoading(true);
      setError(null);

      // Invoke Supabase Edge Function: start-trial
      const { data, error: functionError } = await supabase.functions.invoke('start-trial', {
        body: { userId }
      });

      if (functionError) throw functionError;

      // Refresh profile data to reflect 'trialing' status and trial_end
      await fetchProfile();
    } catch (err: any) {
      setError(err.message || 'Unable to start 30-day trial. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const calculateDaysLeft = (trialEndString: string | null): number => {
    if (!trialEndString) return 0;
    const diffTime = new Date(trialEndString).getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  };

  if (loading) {
    return (
      <div className="w-full animate-pulse p-5 bg-slate-900 border border-slate-800 rounded-2xl">
        <div className="flex items-center space-x-3">
          <div className="h-4 bg-slate-700 rounded w-1/3"></div>
          <div className="h-4 bg-slate-800 rounded w-1/4"></div>
        </div>
      </div>
    );
  }

  const daysRemaining = calculateDaysLeft(profile?.trial_end || null);

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-slate-100">
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-950/70 border border-red-800/80 text-red-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-200 ml-2 font-bold"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Trialing Banner */}
      {profile?.subscription_status === 'trialing' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-xl">
          <div className="flex items-center space-x-3">
            <span className="flex h-3 w-3 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
            </span>
            <div>
              <h4 className="font-semibold text-sm text-indigo-200">30-Day Free Trial Active</h4>
              <p className="text-xs text-indigo-300/80 mt-0.5">
                You have <span className="font-bold text-indigo-100">{daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}</span> left in your trial.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 rounded-full">
            Trial Active
          </span>
        </div>
      )}

      {/* Active Subscription Status */}
      {profile?.subscription_status === 'active' && (
        <div className="flex items-center justify-between p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-xl">
          <div>
            <h4 className="font-semibold text-sm text-emerald-200">DueVinci Pro Enabled</h4>
            <p className="text-xs text-emerald-300/80 mt-0.5">Full Canvas LMS Sync and automated study workflows active.</p>
          </div>
          <span className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full">
            Pro Plan
          </span>
        </div>
      )}

      {/* Inactive State with CTA */}
      {profile?.subscription_status === 'inactive' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-slate-800/50 border border-slate-700/60 rounded-xl">
          <div>
            <h4 className="font-semibold text-sm text-slate-100">Unlock Canvas LMS Sync</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              Start your 30-day free trial to automatically sync your Canvas courses, modules, and assignments. No credit card required.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStartTrial}
            disabled={actionLoading}
            className="whitespace-nowrap px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {actionLoading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Activating Trial...</span>
              </>
            ) : (
              'Start 30-Day Free Trial'
            )}
          </button>
        </div>
      )}
    </div>
  );
};
