'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CanvasCourse {
  id: number;
  name: string;
  course_code?: string;
  term?: { name: string };
  enrollment_state?: string;
}

export interface CanvasSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  supabase: SupabaseClient;
  userId: string;
  onSyncComplete?: (syncedCount: number) => void;
}

export const CanvasSyncModal: React.FC<CanvasSyncModalProps> = ({
  isOpen,
  onClose,
  supabase,
  userId,
  onSyncComplete
}) => {
  const [courses, setCourses] = useState<CanvasCourse[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const fetchCanvasCourses = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      setSuccessCount(null);

      // 1. Fetch Canvas credentials from user's profile
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('canvas_domain, canvas_token')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileErr) throw profileErr;
      if (!profile?.canvas_domain || !profile?.canvas_token) {
        throw new Error('Canvas credentials not found. Please connect your Canvas account first.');
      }

      // 2. Fetch active courses from Canvas REST API
      const response = await fetch(
        `${profile.canvas_domain}/api/v1/courses?enrollment_state=active&include[]=term`,
        {
          headers: {
            Authorization: `Bearer ${profile.canvas_token}`,
            Accept: 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch Canvas courses (HTTP ${response.status}).`);
      }

      const rawCourses: CanvasCourse[] = await response.json();
      // Filter out invalid/empty courses
      const activeCourses = rawCourses.filter((c) => c.name && c.name.trim().length > 0);

      setCourses(activeCourses);
      // Select all by default
      setSelectedIds(new Set(activeCourses.map((c) => c.id)));
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading courses from Canvas.');
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    if (isOpen) {
      fetchCanvasCourses();
    }
  }, [isOpen, fetchCanvasCourses]);

  const toggleSelectAll = () => {
    if (selectedIds.size === courses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(courses.map((c) => c.id)));
    }
  };

  const toggleCourse = (id: number) => {
    const updated = new Set(selectedIds);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    setSelectedIds(updated);
  };

  const handleSyncSelected = async () => {
    if (selectedIds.size === 0) return;

    try {
      setSyncing(true);
      setErrorMessage(null);

      const coursesToSync = courses.filter((c) => selectedIds.has(c.id));

      // Match Supabase schema: public.courses (user_id, name, lms_source_id, lms_provider, updated_at)
      const payload = coursesToSync.map((c) => ({
        user_id: userId,
        name: c.name,
        lms_source_id: c.id.toString(),
        lms_provider: 'canvas',
        updated_at: new Date().toISOString()
      }));

      // UPSERT into courses matching unique constraint (user_id, lms_source_id)
      const { error: upsertError } = await supabase
        .from('courses')
        .upsert(payload, {
          onConflict: 'user_id,lms_source_id'
        });

      if (upsertError) throw upsertError;

      setSuccessCount(coursesToSync.length);
      if (onSyncComplete) {
        onSyncComplete(coursesToSync.length);
      }

      // Auto close after brief confirmation
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to sync courses to database.');
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-100">Sync Canvas Courses</h3>
            <p className="text-xs text-slate-400 mt-0.5">Select the active courses to import into DueVinci.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Status Messages */}
        {errorMessage && (
          <div className="mx-5 mt-4 p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 text-xs">
            {errorMessage}
          </div>
        )}

        {successCount !== null && (
          <div className="mx-5 mt-4 p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
            <span>✓</span>
            <span>Successfully synced {successCount} {successCount === 1 ? 'course' : 'courses'}!</span>
          </div>
        )}

        {/* Course Checklist */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
              <svg className="animate-spin h-6 w-6 text-indigo-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-xs font-medium">Fetching active courses from Canvas...</span>
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              No active courses found on your Canvas account.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {selectedIds.size} of {courses.length} selected
                </span>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  {selectedIds.size === courses.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="space-y-2">
                {courses.map((course) => {
                  const isChecked = selectedIds.has(course.id);
                  return (
                    <label
                      key={course.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-indigo-950/30 border-indigo-500/40 text-slate-100'
                          : 'bg-slate-800/30 border-slate-700/60 text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCourse(course.id)}
                        className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{course.name}</p>
                        <div className="flex gap-2 items-center text-[11px] text-slate-400 mt-0.5">
                          {course.course_code && <span>{course.course_code}</span>}
                          {course.term?.name && (
                            <>
                              <span>•</span>
                              <span>{course.term.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Actions Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={syncing}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSyncSelected}
            disabled={syncing || selectedIds.size === 0 || loading}
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
          >
            {syncing ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Syncing...</span>
              </>
            ) : (
              `Sync Selected (${selectedIds.size})`
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
