# Pomodoro Timer & Focus Modes ⏱️

The sidebar timer (`js/modules/timers.js`) provides focus/break countdowns, named custom timers, and browser-generated alarm audio.

## Modes and controls

| Timer | Initial intervals | Controls |
| --- | --- | --- |
| Main Focus / Break | 25 / 5 minutes | Start or pause, reset, skip mode, edit intervals, collapse |
| Deep Work custom preset | 50 / 10 minutes | Start/pause, reset, delete |
| Quick Review custom preset | 15 / 3 minutes | Start/pause, reset, delete |

Saved preferences and custom timers can replace these initial values. Add a named custom countdown from **Custom Timers**. The module does not implement an untimed stopwatch or an automatic long break after four sessions.

The main control is named **Start or pause timer** for assistive technology. Custom timer buttons include their timer's name and expose running state; the custom-timer disclosure is a keyboard-operable button. Audited sidebar controls have enlarged targets. Use the [Testing guide](Testing-&-CI-CD) for the limits of the release accessibility checks.

## Alarm and ambient audio

Appearance settings control muting, alarm sound, and ambient white/brown noise. Alarms are synthesized with Web Audio; no downloaded audio file is required. Browser interaction, device volume, background throttling, or browser policy can affect playback. There is no separate guaranteed start chime or timer-completion push notification.

## Floating timer

When the main timer is collapsed or otherwise meets the module's floating conditions, running timers can appear in a corner widget. The widget provides countdown/start-pause controls and can be dismissed. It is a page UI, not an operating-system background timer service.

Timer state is saved locally; do not assume live cross-device timer synchronization. A page reload can restore a running main timer from its stored end time, subject to browser behavior.

## Study-plan connection · Pro, opt-in

A study-plan timer can attach a task context. With personalized estimates enabled and Pro access verified, completed focus sessions and finished tasks contribute to recent study history. Simply pressing Start is not a measurement of completed study time, and the free timer does not provide comprehensive per-class hour analytics.

See [Smart Study Planner](Smart-Study-Planner) for enabling, pausing, and clearing calibration history. Browser due-date reminders and Canvas change alerts are separate settings, not timer-completion guarantees.
